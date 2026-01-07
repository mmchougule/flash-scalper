/**
 * LLM Analyzer Unit Tests
 */

import { analyzeEntry, analyzeExit } from '../../src/services/signal/llm-analyzer';
import type { TechnicalIndicators, Position, Kline } from '../../src/types';
import { LLMTimeoutError, LLMValidationError, LLMRateLimitError, LLMServiceError } from '../../src/types';

// Mock fetch
global.fetch = jest.fn();

// Mock config
jest.mock('../../src/config', () => ({
  config: {
    llm: {
      enabled: true,
      apiKey: 'test-key',
      model: 'test-model',
      timeout: 5000,
      retry: {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
      },
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        timeoutMs: 60000,
        halfOpenTimeoutMs: 30000,
      },
      rateLimit: {
        requestsPerMinute: 60,
        burstSize: 60,
      },
    },
  },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  signalLogger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock metrics
jest.mock('../../src/utils/metrics', () => ({
  llmRequests: {
    inc: jest.fn(),
  },
  llmLatency: {
    observe: jest.fn(),
  },
  llmRateLimitHits: {
    inc: jest.fn(),
  },
  llmStructuredOutputFailures: {
    inc: jest.fn(),
  },
}));

describe('LLM Analyzer', () => {
  const mockIndicators: TechnicalIndicators = {
    price: 43250,
    rsi: 45.2,
    macd: 0.001,
    macdSignal: 0.0005,
    macdHistogram: 0.001234,
    macdCrossUp: true,
    macdCrossDown: false,
    volumeRatio: 1.5,
    trend: 'UP',
    ema9: 43200,
    ema21: 43100,
    ema50: 43000,
    atr: 500,
    atrPercent: 1.2,
    momentum: 0.5,
    bbUpper: 44000,
    bbMiddle: 43250,
    bbLower: 42500,
    bbPercentB: 0.5,
    stochK: 50,
    stochD: 50,
    roc: 0.5,
    williamsR: -50,
  };

  const mockKlines: Kline[] = Array.from({ length: 100 }, (_, i) => {
    const timestamp = Date.now() - (100 - i) * 60000;
    return {
      open: 43000 + i * 10,
      high: 43100 + i * 10,
      low: 42900 + i * 10,
      close: 43050 + i * 10,
      volume: 1000 + i * 100,
      openTime: timestamp,
      closeTime: timestamp + 60000,
    };
  });

  const mockPosition: Position = {
    id: 'test-position',
    agentId: 'test-agent',
    symbol: 'BTCUSDT',
    side: 'long',
    entryPrice: 43250,
    currentPrice: 43500,
    size: 0.1,
    leverage: 10,
    marginUsed: 432.5,
    openedAt: Date.now() - 600000, // 10 minutes ago
    updatedAt: Date.now(),
    unrealizedPnl: 25,
    unrealizedROE: 5.8,
    highestROE: 6.2,
    lowestROE: -0.5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('analyzeEntry', () => {
    describe('with valid JSON response', () => {
      it('should parse and return structured result', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: '{"action": "LONG", "confidence": 75, "reason": "Strong bullish setup"}',
              },
            }],
          }),
        });

        const result = await analyzeEntry('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('LONG');
        expect(result.confidence).toBe(75);
        expect(result.reason).toBe('Strong bullish setup');
        expect(result.agrees).toBe(true);
      });
    });

    describe('with invalid JSON response', () => {
      it('should fallback to text parsing', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'ACTION: LONG\nCONFIDENCE: 80\nREASON: Good setup',
              },
            }],
          }),
        });

        const result = await analyzeEntry('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('LONG');
        expect(result.confidence).toBeGreaterThanOrEqual(50); // Fallback parsing may vary
        expect(result.reason).toBeTruthy();
      });
    });

    describe('with LLM disabled', () => {
      it('should return default result when API key is missing', async () => {
        // Mock config with no API key
        jest.doMock('../../src/config', () => ({
          config: {
            llm: {
              enabled: true,
              apiKey: '', // Empty API key disables LLM
              model: 'test-model',
              timeout: 5000,
            },
          },
        }));

        // Re-import to get mocked config
        jest.resetModules();
        const { analyzeEntry: analyzeEntryDisabled } = await import('../../src/services/signal/llm-analyzer');
        
        const result = await analyzeEntryDisabled('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('LONG');
        expect(result.confidence).toBe(50);
        expect(result.reason).toBe('LLM disabled');
        expect(result.agrees).toBe(true);
      });
    });

    describe('with timeout', () => {
      it('should handle timeout error gracefully', async () => {
        (global.fetch as jest.Mock).mockImplementationOnce(() => {
          return new Promise((_, reject) => {
            setTimeout(() => {
              const error = new Error('Request timed out');
              error.name = 'AbortError';
              reject(error);
            }, 10);
          });
        });

        const result = await analyzeEntry('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBe(0);
        expect(result.agrees).toBe(false);
        expect(result.reason).toContain('LLM error');
      });
    });

    describe('with rate limit error', () => {
      it('should handle rate limit error', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: {
            get: (name: string) => name === 'retry-after' ? '60' : null,
          },
        });

        const result = await analyzeEntry('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBe(0);
        expect(result.agrees).toBe(false);
        expect(result.reason).toContain('rate limit');
      });
    });

    describe('with 5xx server error', () => {
      it('should retry on 5xx error', async () => {
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  content: '{"action": "LONG", "confidence": 70, "reason": "Retry success"}',
                },
              }],
            }),
          });

        const result = await analyzeEntry('BTCUSDT', 'LONG', mockIndicators, ['EMA bullish stack'], mockKlines);

        expect(result.action).toBe('LONG');
        expect(result.confidence).toBe(70);
        expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + retry
      });
    });
  });

  describe('analyzeExit', () => {
    describe('with valid JSON response', () => {
      it('should parse and return structured result', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: '{"action": "EXIT", "confidence": 80, "reason": "Take profit"}',
              },
            }],
          }),
        });

        const result = await analyzeExit(mockPosition, mockIndicators, mockKlines);

        expect(result.action).toBe('EXIT');
        expect(result.confidence).toBe(80);
        expect(result.reason).toBe('Take profit');
        expect(result.agrees).toBe(true);
      });
    });

    describe('with invalid JSON response', () => {
      it('should fallback to text parsing', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'ACTION: EXIT\nCONFIDENCE: 75\nREASON: Momentum fading',
              },
            }],
          }),
        });

        const result = await analyzeExit(mockPosition, mockIndicators, mockKlines);

        expect(result.action).toBe('EXIT');
        expect(result.confidence).toBeGreaterThanOrEqual(50); // Fallback parsing may vary
        expect(result.reason).toBeTruthy();
      });
    });

    describe('with LLM disabled', () => {
      it('should return default HOLD result when API key is missing', async () => {
        // Mock config with no API key
        jest.doMock('../../src/config', () => ({
          config: {
            llm: {
              enabled: true,
              apiKey: '', // Empty API key disables LLM
              model: 'test-model',
              timeout: 5000,
            },
          },
        }));

        // Re-import to get mocked config
        jest.resetModules();
        const { analyzeExit: analyzeExitDisabled } = await import('../../src/services/signal/llm-analyzer');
        
        const result = await analyzeExitDisabled(mockPosition, mockIndicators, mockKlines);

        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBe(50);
        expect(result.reason).toBe('LLM disabled');
        expect(result.agrees).toBe(false);
      });
    });
  });
});

