/**
 * Exchange Client - Aster Exchange API Wrapper
 * Handles all exchange communication with proper error handling
 */

import crypto from 'crypto';
import { config } from '../../config';
import { executionLogger } from '../../utils/logger';
import { exchangeRequests, exchangeLatency, exchangeErrors } from '../../utils/metrics';
import type { OrderRequest, OrderResult, ExchangeCredentials } from '../../types';
import { BaseExchangeClient, type ExchangePosition } from './base-exchange-client';

// =============================================================================
// TYPES
// =============================================================================

interface AsterConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

interface AsterPosition extends ExchangePosition {
  marginType: string;
  isolatedMargin: string;
}

interface AsterAsset {
  asset: string;
  walletBalance: string;
  unrealizedProfit?: string;
  marginBalance?: string;
  availableBalance?: string;
  [key: string]: any;
}

interface AsterAccount {
  totalWalletBalance?: string;
  availableBalance?: string;
  totalUnrealizedProfit?: string;
  totalEquity?: string; // Some exchanges use this
  equity?: string; // Alternative field name
  accountEquity?: string; // Another alternative
  totalMarginBalance?: string; // Margin balance (wallet + unrealized PnL)
  assets?: AsterAsset[]; // Assets array - balance might be here
  [key: string]: any; // Allow additional fields
  positions: AsterPosition[];
}

// =============================================================================
// ASTER CLIENT
// =============================================================================

export class AsterClient extends BaseExchangeClient {
  private config: AsterConfig;
  private exchangeInfoCache: Map<string, { min: number; precision: number }> = new Map();
  private exchangeInfoLoaded: boolean = false;

  constructor(credentials?: Partial<AsterConfig>) {
    super();
    this.config = {
      apiKey: credentials?.apiKey || config.aster.apiKey,
      secretKey: credentials?.secretKey || config.aster.secretKey,
      baseUrl: credentials?.baseUrl || config.aster.baseUrl,
    };
  }

  /**
   * Generate signature for authenticated requests
   */
  private sign(queryString: string): string {
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make authenticated API request with retry logic
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, any> = {},
    signed: boolean = true,
    retries: number = 3
  ): Promise<T> {
    const startTime = Date.now();
    const url = new URL(endpoint, this.config.baseUrl);

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Calculate timestamp right before request to avoid recvWindow issues
      const timestamp = Date.now();
      
      // Create fresh params object for each attempt to avoid stale timestamps
      const requestParams: Record<string, any> = { ...params };
      
      // Add timestamp and recvWindow for signed requests
      if (signed) {
        requestParams.timestamp = timestamp;
        requestParams.recvWindow = 60000; // 60 second window to allow for network delays
      }

      // Build query string
      const urlParams = new URLSearchParams();
      Object.entries(requestParams).forEach(([k, v]) => urlParams.set(k, String(v)));
      const queryString = urlParams.toString();

      // Add signature
      if (signed && queryString) {
        requestParams.signature = this.sign(queryString);
      }

      // For Binance-compatible APIs, all methods send params as URL query params (including POST)
      const requestUrl = new URL(endpoint, this.config.baseUrl);
      Object.entries(requestParams).forEach(([k, v]) => requestUrl.searchParams.set(k, String(v)));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(requestUrl.toString(), {
          method,
          headers: {
            'X-MBX-APIKEY': this.config.apiKey,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;
        exchangeLatency.observe({ exchange: 'aster', endpoint }, latency);

        if (!response.ok) {
          const errorBody = await response.text();
          exchangeErrors.inc({ exchange: 'aster', endpoint, error_type: `http_${response.status}` });
          
          // Check for timestamp errors - retry with fresh timestamp
          if ((errorBody.includes('recvWindow') || errorBody.includes('-1021')) && attempt < retries) {
            executionLogger.debug({ 
              endpoint, 
              attempt: attempt + 1, 
              error: errorBody 
            }, 'Timestamp error, retrying with fresh timestamp');
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
            // Will retry on next loop iteration - don't throw
          } else {
            throw new Error(`API error ${response.status}: ${errorBody}`);
          }
        }

        exchangeRequests.inc({ exchange: 'aster', endpoint, status: 'success' });
        return response.json() as Promise<T>;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Check if it's a timeout or network error that we should retry
        const errorMsg = fetchError.message || 'Unknown error';
        const isNetworkError = errorMsg.includes('fetch failed') || 
                              errorMsg.includes('ECONNREFUSED') ||
                              errorMsg.includes('ENOTFOUND') ||
                              errorMsg.includes('timeout') ||
                              errorMsg.includes('aborted') ||
                              fetchError.name === 'AbortError';
        
        const shouldRetry = isNetworkError && attempt < retries;
        
        if (shouldRetry) {
          executionLogger.debug({ 
            endpoint, 
            attempt: attempt + 1, 
            error: errorMsg 
          }, 'Network error, retrying');
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        }
        
        if (!shouldRetry) {
          // Last attempt or non-retryable error
          exchangeErrors.inc({ exchange: 'aster', endpoint, error_type: fetchError.name || 'unknown' });
          
          if (isNetworkError) {
            executionLogger.error({ 
              error: errorMsg, 
              endpoint,
              baseUrl: this.config.baseUrl,
              url: requestUrl.toString(),
              message: 'Network/connectivity issue - check API endpoint and network connection'
            }, 'Exchange request failed - network error');
          } else {
            executionLogger.error({ error: errorMsg, endpoint }, 'Exchange request failed');
          }
          
          // If this is the last attempt, throw the error
          if (attempt === retries) {
            throw fetchError;
          }
          // Otherwise continue to next retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    // Should never reach here, but TypeScript needs it
    throw new Error('Request failed after all retries');
  }

  // =============================================================================
  // ACCOUNT ENDPOINTS
  // =============================================================================

  /**
   * Get account information
   * Note: Using v1 endpoint (Binance-compatible), v4 may not exist
   */
  async getAccount(): Promise<AsterAccount> {
    try {
      const account = await this.request<AsterAccount>('GET', '/fapi/v1/account');
      
      // Load exchange info on first account fetch if not already loaded
      if (!this.exchangeInfoLoaded) {
        this.getExchangeInfo().catch(() => {
          // Silently fail, will use hardcoded mapping
        });
      }
      return account;
    } catch (error: any) {
      // Fallback to v2 if v1 fails
      if (error.message?.includes('fetch failed') || error.message?.includes('404')) {
        executionLogger.warn({ error: error.message }, 'v1 account endpoint failed, trying v2');
        const account = await this.request<AsterAccount>('GET', '/fapi/v2/account');
        
        // Load exchange info on first account fetch if not already loaded
        if (!this.exchangeInfoLoaded) {
          this.getExchangeInfo().catch(() => {
            // Silently fail, will use hardcoded mapping
          });
        }
        return account;
      }
      throw error;
    }
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    const ticker = await this.request<{ price: string }>('GET', '/fapi/v1/ticker/price', { symbol }, false);
    return parseFloat(ticker.price);
  }

  /**
   * Get klines (candlestick data)
   */
  async getKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
    return await this.request('GET', '/fapi/v1/klines', { symbol, interval, limit }, false);
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
      await this.request('POST', '/fapi/v1/leverage', { symbol, leverage });
      executionLogger.debug({ symbol, leverage }, 'Leverage set');
    } catch (error: any) {
      // Ignore if leverage already set
      if (!error.message?.includes('No need to change')) {
        throw error;
      }
    }
  }

  /**
   * Get exchange information and cache precision requirements
   */
  async getExchangeInfo(): Promise<void> {
    if (this.exchangeInfoLoaded) {
      return;
    }

    try {
      const response = await this.request<{
        symbols: Array<{
          symbol: string;
          filters: Array<{
            filterType: string;
            stepSize?: string;
            minQty?: string;
          }>;
        }>;
      }>('GET', '/fapi/v1/exchangeInfo', {}, false);

      for (const symbolInfo of response.symbols) {
        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        if (lotSizeFilter) {
          const stepSize = lotSizeFilter.stepSize || '1';
          const minQty = parseFloat(lotSizeFilter.minQty || '0.001');
          
          // Calculate precision from stepSize
          // e.g., "0.1" = 1 decimal, "0.01" = 2 decimals, "1" = 0 decimals
          let precision = 0;
          if (stepSize.includes('.')) {
            const decimalPart = stepSize.split('.')[1];
            precision = decimalPart.replace(/0+$/, '').length;
          }

          this.exchangeInfoCache.set(symbolInfo.symbol, {
            min: minQty,
            precision,
          });
        }
      }

      this.exchangeInfoLoaded = true;
      executionLogger.debug({ 
        symbolsLoaded: this.exchangeInfoCache.size 
      }, 'Exchange info loaded and cached');
    } catch (error: any) {
      executionLogger.warn({ 
        error: error.message 
      }, 'Failed to load exchange info, using hardcoded precision mapping');
      // Continue with hardcoded mapping
    }
  }

  // =============================================================================
  // ORDER ENDPOINTS
  // =============================================================================

  /**
   * Place market order
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    const formattedQuantity = this.formatQuantity(symbol, quantity);
    try {
      const orderParams: Record<string, any> = {
        symbol,
        side,
        type: 'MARKET',
        quantity: formattedQuantity,
      };

      if (reduceOnly) {
        orderParams.reduceOnly = 'true';
      }

      const order = await this.request<{
        orderId: number;
        price: string;
        executedQty: string;
        cumQuote: string;
        status: string;
      }>('POST', '/fapi/v1/order', orderParams);

      const filledPrice = parseFloat(order.price) || 0;
      const filledQty = parseFloat(order.executedQty);

      return {
        success: true,
        orderId: order.orderId.toString(),
        filledPrice,
        filledQuantity: filledQty,
        fees: 0, // Fees calculated separately
      };
    } catch (error: any) {
      executionLogger.error({ symbol, side, quantity: formattedQuantity, error: error.message }, 'Order failed');
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Place limit order
   */
  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    const formattedQuantity = this.formatQuantity(symbol, quantity);
    try {
      const orderParams: Record<string, any> = {
        symbol,
        side,
        type: 'LIMIT',
        quantity: formattedQuantity,
        price: price.toString(),
        timeInForce: 'GTC',
      };

      if (reduceOnly) {
        orderParams.reduceOnly = 'true';
      }

      const order = await this.request<{
        orderId: number;
        price: string;
        executedQty: string;
        status: string;
      }>('POST', '/fapi/v1/order', orderParams);

      const filledPrice = parseFloat(order.price) || price;
      const filledQty = parseFloat(order.executedQty);

      return {
        success: true,
        orderId: order.orderId.toString(),
        filledPrice,
        filledQuantity: filledQty,
        fees: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    try {
      await this.request('DELETE', '/fapi/v1/order', { symbol, orderId });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if order exists
   */
  async orderExists(symbol: string, orderId: string): Promise<boolean> {
    try {
      await this.request('GET', '/fapi/v1/order', { symbol, orderId });
      return true;
    } catch (error) {
      return false;
    }
  }

  // =============================================================================
  // POSITION ENDPOINTS
  // =============================================================================

  /**
   * Get all positions
   */
  async getPositions(): Promise<AsterPosition[]> {
    const account = await this.getAccount();
    return account.positions.filter((p) => parseFloat(p.positionAmt) !== 0);
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol: string): Promise<AsterPosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    const account = await this.getAccount();
    
    // Try multiple field names - different exchanges use different field names
    let balance = 0;
    let unrealizedPnL = 0;
    
    // Priority 1: Check assets array for USDT/USD balance (most accurate)
    if (account.assets && Array.isArray(account.assets)) {
      const usdtAsset = account.assets.find((a: AsterAsset) => 
        a.asset === 'USDT' || a.asset === 'USD' || a.asset === 'BUSD' || a.asset === 'USDC' || a.asset === 'USDF'
      );
      
      if (usdtAsset) {
        const marginBal = parseFloat(usdtAsset.marginBalance || '0');
        const walletBal = parseFloat(usdtAsset.walletBalance || '0');
        const availBal = parseFloat(usdtAsset.availableBalance || '0');
        
        // Use the highest non-zero value (marginBalance includes unrealized PnL, so it's the account equity)
        const assetBalance = marginBal > 0 ? marginBal : (walletBal > 0 ? walletBal : availBal);
        
        if (assetBalance > 0) {
          balance = assetBalance;
        }
        
        if (usdtAsset.unrealizedProfit) {
          unrealizedPnL = parseFloat(usdtAsset.unrealizedProfit);
        }
      }
    }
    
    // Priority 2: Use totalMarginBalance (wallet + unrealized PnL) - this is the account equity
    if (balance === 0 && account.totalMarginBalance) {
      balance = parseFloat(account.totalMarginBalance);
    }
    
    // Priority 3: Try other equity fields
    if (balance === 0 && account.totalEquity) {
      balance = parseFloat(account.totalEquity);
    } else if (balance === 0 && account.accountEquity) {
      balance = parseFloat(account.accountEquity);
    } else if (balance === 0 && account.equity) {
      balance = parseFloat(account.equity);
    }
    
    // Priority 4: Fallback to wallet balance fields
    if (balance === 0 && account.totalWalletBalance) {
      balance = parseFloat(account.totalWalletBalance);
    } else if (balance === 0 && account.availableBalance) {
      balance = parseFloat(account.availableBalance);
    }
    
    // Get unrealized PnL if not already set
    if (unrealizedPnL === 0 && account.totalUnrealizedProfit) {
      unrealizedPnL = parseFloat(account.totalUnrealizedProfit);
    }
    
    if (balance === 0) {
      executionLogger.error(
        {
          totalWalletBalance: account.totalWalletBalance,
          totalMarginBalance: (account as any).totalMarginBalance,
          availableBalance: account.availableBalance,
          usdtAsset: account.assets?.find((a: AsterAsset) => a.asset === 'USDT'),
        },
        'Balance is 0 - could not find balance in any known field'
      );
    }
    
    return {
      balance,
      unrealizedPnL,
    };
  }

  /**
   * Get minimum quantity and precision for a symbol
   */
  getMinQtyAndPrecision(symbol: string): { min: number; precision: number } {
    // First check cached exchange info
    const cached = this.exchangeInfoCache.get(symbol);
    if (cached) {
      return cached;
    }

    // Fallback to hardcoded precision mapping
    const PRECISION_MAP: Record<string, { min: number; precision: number }> = {
      'BTCUSDT': { min: 0.001, precision: 3 },
      'ETHUSDT': { min: 0.01, precision: 2 },
      'SOLUSDT': { min: 0.1, precision: 1 },
      'XRPUSDT': { min: 1, precision: 0 },
      'DOGEUSDT': { min: 1, precision: 0 },
      'BNBUSDT': { min: 0.01, precision: 2 },
      'ADAUSDT': { min: 1, precision: 0 },
      'AVAXUSDT': { min: 0.1, precision: 1 },
      'LINKUSDT': { min: 0.1, precision: 1 },
      'SUIUSDT': { min: 1, precision: 0 },
      'TRXUSDT': { min: 1, precision: 0 },
      'LTCUSDT': { min: 0.01, precision: 2 },
      'AAVEUSDT': { min: 0.1, precision: 1 }, // Fixed: precision 1, not 2
      'UNIUSDT': { min: 0.1, precision: 1 },
      'ASTERUSDT': { min: 1, precision: 0 },
    };

    return PRECISION_MAP[symbol] || { min: 0.001, precision: 3 };
  }

  /**
   * Round quantity to symbol's precision
   */
  roundQuantity(symbol: string, quantity: number): number {
    const { precision, min } = this.getMinQtyAndPrecision(symbol);
    
    if (precision === 0) {
      return Math.max(min, Math.floor(quantity));
    }
    
    const multiplier = Math.pow(10, precision);
    const rounded = Math.floor(quantity * multiplier) / multiplier;
    return Math.max(min, rounded);
  }

  /**
   * Format quantity as string with correct precision
   */
  formatQuantity(symbol: string, quantity: number): string {
    const { precision, min } = this.getMinQtyAndPrecision(symbol);
    const rounded = this.roundQuantity(symbol, quantity);
    
    if (precision === 0) {
      return Math.floor(rounded).toString();
    }
    
    return rounded.toFixed(precision);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createAsterClient(credentials?: ExchangeCredentials): AsterClient {
  if (credentials) {
    return new AsterClient(credentials);
  }
  return new AsterClient();
}
