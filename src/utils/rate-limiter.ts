/**
 * Rate Limiter - Token Bucket Algorithm
 * Prevents exceeding API rate limits
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RateLimiterOptions {
  requestsPerMinute?: number;
  burstSize?: number; // Maximum burst (default: same as requestsPerMinute)
}

export class RateLimitError extends Error {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfterMs: number = 60000
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// =============================================================================
// RATE LIMITER
// =============================================================================

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond
  private lastRefill: number;
  private readonly burstSize: number;

  constructor(options: RateLimiterOptions = {}) {
    const requestsPerMinute = options.requestsPerMinute ?? 60;
    this.burstSize = options.burstSize ?? requestsPerMinute;
    this.maxTokens = this.burstSize;
    this.tokens = this.maxTokens;
    this.refillRate = requestsPerMinute / 60000; // tokens per millisecond
    this.lastRefill = Date.now();
  }

  /**
   * Get current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Check if a request can be made (non-blocking)
   * 
   * @returns true if request can be made, false otherwise
   */
  canMakeRequest(): boolean {
    this.refill();
    return this.tokens >= 1;
  }

  /**
   * Acquire a token (blocking if needed)
   * 
   * @param waitMs - Maximum time to wait for a token (default: 0, no wait)
   * @returns Promise that resolves when token is acquired
   * @throws RateLimitError if token cannot be acquired within waitMs
   */
  async acquireToken(waitMs: number = 0): Promise<void> {
    const startTime = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill();
      
      if (this.tokens >= 1) {
        this.tokens--;
        return;
      }

      // Calculate time until next token is available
      const tokensNeeded = 1 - this.tokens;
      const waitTime = Math.ceil(tokensNeeded / this.refillRate);
      
      // Check if we've exceeded the wait time
      const elapsed = Date.now() - startTime;
      if (waitMs > 0 && elapsed + waitTime > waitMs) {
        const retryAfter = waitTime;
        throw new RateLimitError(
          `Rate limit exceeded. Retry after ${Math.ceil(retryAfter / 1000)}s`,
          retryAfter
        );
      }

      // Wait for next token (with a small buffer)
      await sleep(Math.min(waitTime, waitMs || waitTime));
    }
  }

  /**
   * Try to acquire a token (non-blocking)
   * 
   * @returns true if token was acquired, false otherwise
   */
  tryAcquireToken(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get time until next token is available (in milliseconds)
   */
  getTimeUntilNextToken(): number {
    this.refill();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Reset rate limiter (for testing)
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Per-model rate limiter manager
 * Tracks rate limiters for different models/endpoints
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Get or create a rate limiter for a model
   */
  getLimiter(model: string, options?: RateLimiterOptions): RateLimiter {
    if (!this.limiters.has(model)) {
      this.limiters.set(model, new RateLimiter(options));
    }
    return this.limiters.get(model)!;
  }

  /**
   * Reset all limiters (for testing)
   */
  reset(): void {
    this.limiters.forEach((limiter) => limiter.reset());
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  RateLimiter,
  RateLimiterManager,
  RateLimitError,
};

