/**
 * Paradex REST API Client
 * Implements order management and account operations for Paradex
 */

import crypto from 'crypto';
import { BaseExchangeClient, type ExchangePosition } from './base-exchange-client';
import { SymbolMapper } from './symbol-mapper';
import { executionLogger } from '../../utils/logger';
import { exchangeRequests, exchangeLatency, exchangeErrors } from '../../utils/metrics';
import type { OrderResult } from '../../types';

/**
 * Paradex configuration
 */
interface ParadexConfig {
  apiKey: string;
  secretKey: string;
  restUrl: string;
}

/**
 * Paradex position data
 */
interface ParadexPosition {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entry_price: string;
  mark_price: string;
  unrealized_pnl: string;
  margin: string;
  leverage?: string;
}

/**
 * Paradex account data
 */
interface ParadexAccount {
  equity: string;
  available_balance: string;
  margin_balance: string;
  unrealized_pnl: string;
  positions: ParadexPosition[];
}

/**
 * Paradex order response
 */
interface ParadexOrder {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  size: string;
  price?: string;
  filled_size: string;
  filled_price: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  created_at: number;
}

/**
 * Paradex REST API client
 */
export class ParadexRestClient extends BaseExchangeClient {
  private config: ParadexConfig;
  private precisionCache: Map<string, { min: number; precision: number }> = new Map();

  constructor(config: ParadexConfig) {
    super();
    this.config = config;
  }

  /**
   * Generate signature for authenticated requests
   */
  private sign(timestamp: number, method: string, path: string, body: string = ''): string {
    const message = `${timestamp}${method}${path}${body}`;
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(message)
      .digest('hex');
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, any> = {},
    retries: number = 3
  ): Promise<T> {
    const startTime = Date.now();
    const url = new URL(endpoint, this.config.restUrl);

    for (let attempt = 0; attempt <= retries; attempt++) {
      const timestamp = Date.now();
      
      let body = '';
      let path = url.pathname;

      // For GET requests, add params to query string
      if (method === 'GET' && Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => queryParams.set(k, String(v)));
        path += `?${queryParams.toString()}`;
      } else if (method !== 'GET' && Object.keys(params).length > 0) {
        body = JSON.stringify(params);
      }

      const signature = this.sign(timestamp, method, path, body);

      const headers: Record<string, string> = {
        'X-API-KEY': this.config.apiKey,
        'X-TIMESTAMP': timestamp.toString(),
        'X-SIGNATURE': signature,
        'Content-Type': 'application/json',
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url.toString() + (method === 'GET' && path.includes('?') ? path.substring(path.indexOf('?')) : ''), {
          method,
          headers,
          body: method !== 'GET' && body ? body : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;
        exchangeLatency.observe({ exchange: 'paradex', endpoint }, latency);

        if (!response.ok) {
          const errorBody = await response.text();
          exchangeErrors.inc({ exchange: 'paradex', endpoint, error_type: `http_${response.status}` });
          
          if (attempt < retries) {
            executionLogger.debug({ 
              endpoint, 
              attempt: attempt + 1, 
              error: errorBody 
            }, 'Paradex API error, retrying');
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          
          throw new Error(`Paradex API error ${response.status}: ${errorBody}`);
        }

        exchangeRequests.inc({ exchange: 'paradex', endpoint, status: 'success' });
        return response.json() as Promise<T>;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        const isNetworkError = error.message?.includes('fetch failed') || 
                              error.message?.includes('timeout') ||
                              error.name === 'AbortError';
        
        if (isNetworkError && attempt < retries) {
          executionLogger.debug({ 
            endpoint, 
            attempt: attempt + 1, 
            error: error.message 
          }, 'Network error, retrying');
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        exchangeErrors.inc({ exchange: 'paradex', endpoint, error_type: error.name || 'unknown' });
        throw error;
      }
    }
    
    throw new Error('Request failed after all retries');
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<ParadexAccount> {
    return await this.request<ParadexAccount>('GET', '/v1/account');
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    const account = await this.getAccount();
    
    const balance = parseFloat(account.equity || account.margin_balance || '0');
    const unrealizedPnL = parseFloat(account.unrealized_pnl || '0');
    
    return {
      balance,
      unrealizedPnL,
    };
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    const market = SymbolMapper.toParadex(symbol);
    const ticker = await this.request<{ mark_price: string }>('GET', `/v1/markets/${market}/ticker`);
    return parseFloat(ticker.mark_price);
  }

  /**
   * Get klines (candlestick data)
   * Note: This is a fallback - prefer WebSocket for real-time data
   */
  async getKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
    const market = SymbolMapper.toParadex(symbol);
    
    // Paradex may not have a direct klines endpoint
    // This is a placeholder - implement based on actual API
    executionLogger.warn({ market, interval, limit }, 'Klines from REST API not implemented, use WebSocket');
    
    // Return empty array - WebSocket should be used instead
    return [];
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const market = SymbolMapper.toParadex(symbol);
    
    try {
      await this.request('POST', `/v1/account/leverage`, {
        market,
        leverage,
      });
      executionLogger.debug({ market, leverage }, 'Leverage set');
    } catch (error: any) {
      // Log but don't throw - leverage might already be set
      executionLogger.warn({ market, leverage, error: error.message }, 'Failed to set leverage');
    }
  }

  /**
   * Get all open positions
   */
  async getPositions(): Promise<ExchangePosition[]> {
    const account = await this.getAccount();
    
    return account.positions
      .filter((p) => parseFloat(p.size) !== 0)
      .map((p) => ({
        symbol: SymbolMapper.fromParadex(p.market),
        positionAmt: p.side === 'SHORT' ? `-${p.size}` : p.size,
        entryPrice: p.entry_price,
        unrealizedProfit: p.unrealized_pnl,
        leverage: p.leverage || '1',
        marginType: 'cross',
        isolatedMargin: p.margin,
      }));
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol: string): Promise<ExchangePosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  /**
   * Place market order
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    const market = SymbolMapper.toParadex(symbol);
    const formattedQuantity = this.formatQuantity(symbol, quantity);
    
    try {
      const orderParams: Record<string, any> = {
        market,
        side,
        type: 'MARKET',
        size: formattedQuantity,
      };

      if (reduceOnly) {
        orderParams.reduce_only = true;
      }

      const order = await this.request<ParadexOrder>('POST', '/v1/orders', orderParams);

      const filledPrice = parseFloat(order.filled_price || order.price || '0');
      const filledQty = parseFloat(order.filled_size);

      return {
        success: true,
        orderId: order.id,
        filledPrice,
        filledQuantity: filledQty,
        fees: 0, // Fees calculated separately
      };
    } catch (error: any) {
      executionLogger.error({ 
        market, 
        side, 
        quantity: formattedQuantity, 
        error: error.message 
      }, 'Order failed');
      
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
    const market = SymbolMapper.toParadex(symbol);
    const formattedQuantity = this.formatQuantity(symbol, quantity);
    
    try {
      const orderParams: Record<string, any> = {
        market,
        side,
        type: 'LIMIT',
        size: formattedQuantity,
        price: price.toString(),
      };

      if (reduceOnly) {
        orderParams.reduce_only = true;
      }

      const order = await this.request<ParadexOrder>('POST', '/v1/orders', orderParams);

      const filledPrice = parseFloat(order.filled_price || order.price || price.toString());
      const filledQty = parseFloat(order.filled_size);

      return {
        success: true,
        orderId: order.id,
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
      await this.request('DELETE', `/v1/orders/${orderId}`);
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
      await this.request('GET', `/v1/orders/${orderId}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get minimum quantity and precision for a symbol
   */
  getMinQtyAndPrecision(symbol: string): { min: number; precision: number } {
    // Check cache first
    const cached = this.precisionCache.get(symbol);
    if (cached) {
      return cached;
    }

    // Default precision mapping for common symbols
    const PRECISION_MAP: Record<string, { min: number; precision: number }> = {
      'BTCUSDT': { min: 0.001, precision: 3 },
      'ETHUSDT': { min: 0.01, precision: 2 },
      'SOLUSDT': { min: 0.1, precision: 1 },
      'XRPUSDT': { min: 1, precision: 0 },
      'ADAUSDT': { min: 1, precision: 0 },
      'AVAXUSDT': { min: 0.1, precision: 1 },
      'LINKUSDT': { min: 0.1, precision: 1 },
    };

    const precision = PRECISION_MAP[symbol] || { min: 0.001, precision: 3 };
    this.precisionCache.set(symbol, precision);
    
    return precision;
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
    const { precision } = this.getMinQtyAndPrecision(symbol);
    const rounded = this.roundQuantity(symbol, quantity);
    
    if (precision === 0) {
      return Math.floor(rounded).toString();
    }
    
    return rounded.toFixed(precision);
  }
}
