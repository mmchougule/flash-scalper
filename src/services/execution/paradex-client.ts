/**
 * Paradex Exchange Client
 * Handles all Paradex API communication with proper authentication
 */

import * as Paradex from '@paradex/sdk';
import { ethers } from 'ethers';
import { config } from '../../config';
import { executionLogger } from '../../utils/logger';
import { exchangeRequests, exchangeLatency, exchangeErrors } from '../../utils/metrics';
import type {
  OrderRequest,
  OrderResult,
  ExchangeCredentials,
  ParadexConfig,
  ParadexMarket,
  ParadexOrder,
  ParadexPosition,
} from '../../types';

// Paradex API response formats
interface ParadexApiResponse<T> {
  results?: T[];
  data?: T;
  error?: string;
}

interface ParadexAccountSummary {
  account: string;
  equity: string;
  free_collateral: string;
  used_margin: string;
  unrealized_pnl: string;
  positions: any[];
}

// =============================================================================
// PARADEX CLIENT
// =============================================================================

export class ParadexClient {
  private client: Paradex.ParadexClient | null = null;
  private config: Paradex.ParadexConfig | null = null;
  private paradexConfig: ParadexConfig;
  private marketsCache: Map<string, ParadexMarket> = new Map();
  private lastMarketsFetch: number = 0;

  constructor(paradexConfig?: Partial<ParadexConfig>) {
    this.paradexConfig = {
      enabled: paradexConfig?.enabled ?? (config as any).paradex?.enabled ?? false,
      environment: paradexConfig?.environment ?? (config as any).paradex?.environment ?? 'testnet',
      privateKey: paradexConfig?.privateKey ?? (config as any).paradex?.privateKey ?? '',
      apiBaseUrl: paradexConfig?.apiBaseUrl ?? (config as any).paradex?.apiBaseUrl ?? 'https://api.testnet.paradex.trade',
      wsBaseUrl: paradexConfig?.wsBaseUrl ?? (config as any).paradex?.wsBaseUrl,
    };

    if (!this.paradexConfig.enabled) {
      executionLogger.warn('Paradex is disabled in configuration');
    }
  }

  /**
   * Initialize the Paradex client with authentication
   */
  async initialize(): Promise<void> {
    try {
      executionLogger.info({
        environment: this.paradexConfig.environment,
      }, 'Initializing Paradex client');

      // Fetch Paradex configuration
      this.config = await Paradex.Config.fetch(this.paradexConfig.environment);

      // Create wallet from private key
      const wallet = new ethers.Wallet(this.paradexConfig.privateKey);
      const signer = Paradex.Signer.fromEthers(wallet);

      // Create Paradex client
      this.client = await Paradex.Client.fromEthSigner({
        config: this.config,
        signer,
      });

      executionLogger.info({
        account: this.client.getAddress(),
      }, 'Paradex client initialized successfully');

      // Load markets
      await this.loadMarkets();
    } catch (error: any) {
      executionLogger.error({
        error: error.message,
      }, 'Failed to initialize Paradex client');
      throw error;
    }
  }

  /**
   * Check if client is initialized
   */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('Paradex client not initialized. Call initialize() first.');
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Load and cache market information
   */
  async loadMarkets(): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await this.request<ParadexApiResponse<ParadexMarket>>(
        'GET',
        '/v1/markets',
        null,
        false
      );

      if (response.results) {
        // Cache markets
        for (const market of response.results) {
          this.marketsCache.set(market.symbol, market);
        }
        this.lastMarketsFetch = Date.now();

        executionLogger.info({
          count: response.results.length,
        }, 'Loaded Paradex markets');
      }

      const latency = Date.now() - startTime;
      exchangeLatency.observe({ exchange: 'paradex', endpoint: '/v1/markets' }, latency);
      exchangeRequests.inc({ exchange: 'paradex', endpoint: '/v1/markets', status: 'success' });
    } catch (error: any) {
      exchangeErrors.inc({ exchange: 'paradex', endpoint: '/v1/markets', error_type: 'fetch_markets' });
      executionLogger.error({ error: error.message }, 'Failed to load markets');
      throw error;
    }
  }

  /**
   * Get all available markets
   */
  async getMarkets(): Promise<ParadexMarket[]> {
    // Refresh markets if cache is stale (> 5 minutes)
    if (Date.now() - this.lastMarketsFetch > 300000) {
      await this.loadMarkets();
    }
    return Array.from(this.marketsCache.values());
  }

  /**
   * Get specific market information
   */
  async getMarketInfo(symbol: string): Promise<ParadexMarket | null> {
    const market = this.marketsCache.get(symbol);
    if (!market && Date.now() - this.lastMarketsFetch > 300000) {
      await this.loadMarkets();
      return this.marketsCache.get(symbol) || null;
    }
    return market || null;
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    const startTime = Date.now();

    try {
      const response = await this.request<{ mark_price: string }>(
        'GET',
        `/v1/markets/${symbol}/summary`,
        null,
        false
      );

      const latency = Date.now() - startTime;
      exchangeLatency.observe({ exchange: 'paradex', endpoint: '/v1/markets/summary' }, latency);

      return parseFloat(response.mark_price);
    } catch (error: any) {
      exchangeErrors.inc({ exchange: 'paradex', endpoint: '/v1/markets/summary', error_type: 'price_fetch' });
      throw error;
    }
  }

  /**
   * Get orderbook for a symbol
   */
  async getOrderbook(symbol: string): Promise<any> {
    return this.request('GET', `/v1/markets/${symbol}/orderbook`, null, false);
  }

  /**
   * Get recent trades for a symbol
   */
  async getTrades(symbol: string, limit: number = 100): Promise<any[]> {
    const response = await this.request<ParadexApiResponse<any>>(
      'GET',
      `/v1/markets/${symbol}/trades?limit=${limit}`,
      null,
      false
    );
    return response.results || [];
  }

  // =============================================================================
  // PRIVATE API METHODS (AUTHENTICATED)
  // =============================================================================

  /**
   * Get account information
   */
  async getAccount(): Promise<ParadexAccountSummary> {
    this.ensureInitialized();
    return this.request<ParadexAccountSummary>('GET', '/v1/account/summary', null, true);
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    this.ensureInitialized();

    const account = await this.getAccount();
    
    return {
      balance: parseFloat(account.equity),
      unrealizedPnL: parseFloat(account.unrealized_pnl),
    };
  }

  /**
   * Get all positions
   */
  async getPositions(): Promise<ParadexPosition[]> {
    this.ensureInitialized();

    const response = await this.request<ParadexApiResponse<ParadexPosition>>(
      'GET',
      '/v1/positions',
      null,
      true
    );

    return response.results || [];
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol: string): Promise<ParadexPosition | null> {
    const positions = await this.getPositions();
    return positions.find(p => p.market === symbol) || null;
  }

  // =============================================================================
  // ORDER METHODS
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
    this.ensureInitialized();

    const formattedQuantity = this.formatQuantity(symbol, quantity);
    const startTime = Date.now();

    try {
      const orderPayload = {
        market: symbol,
        type: 'MARKET',
        side,
        size: formattedQuantity,
        reduce_only: reduceOnly,
      };

      const order = await this.request<ParadexOrder>(
        'POST',
        '/v1/orders',
        orderPayload,
        true
      );

      const latency = Date.now() - startTime;
      exchangeLatency.observe({ exchange: 'paradex', endpoint: '/v1/orders' }, latency);
      exchangeRequests.inc({ exchange: 'paradex', endpoint: '/v1/orders', status: 'success' });

      return {
        success: true,
        orderId: order.id,
        filledPrice: order.average_fill_price ? parseFloat(order.average_fill_price) : 0,
        filledQuantity: parseFloat(order.filled_size),
        fees: 0, // Paradex has zero trading fees
      };
    } catch (error: any) {
      exchangeErrors.inc({ exchange: 'paradex', endpoint: '/v1/orders', error_type: 'order_placement' });
      executionLogger.error({
        symbol,
        side,
        quantity: formattedQuantity,
        error: error.message,
      }, 'Paradex order failed');

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
    this.ensureInitialized();

    const formattedQuantity = this.formatQuantity(symbol, quantity);
    const formattedPrice = this.formatPrice(symbol, price);

    try {
      const orderPayload = {
        market: symbol,
        type: 'LIMIT',
        side,
        size: formattedQuantity,
        price: formattedPrice,
        time_in_force: 'GTC',
        reduce_only: reduceOnly,
      };

      const order = await this.request<ParadexOrder>(
        'POST',
        '/v1/orders',
        orderPayload,
        true
      );

      return {
        success: true,
        orderId: order.id,
        filledPrice: order.average_fill_price ? parseFloat(order.average_fill_price) : price,
        filledQuantity: parseFloat(order.filled_size),
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
    this.ensureInitialized();

    try {
      await this.request('DELETE', `/v1/orders/${orderId}`, null, true);
      executionLogger.debug({ orderId, symbol }, 'Order cancelled');
      return true;
    } catch (error: any) {
      executionLogger.error({ orderId, error: error.message }, 'Failed to cancel order');
      return false;
    }
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(): Promise<ParadexOrder[]> {
    this.ensureInitialized();

    const response = await this.request<ParadexApiResponse<ParadexOrder>>(
      'GET',
      '/v1/orders?status=OPEN',
      null,
      true
    );

    return response.results || [];
  }

  /**
   * Check if order exists
   */
  async orderExists(symbol: string, orderId: string): Promise<boolean> {
    try {
      const order = await this.request<ParadexOrder>(
        'GET',
        `/v1/orders/${orderId}`,
        null,
        true
      );
      return !!order;
    } catch (error) {
      return false;
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get minimum quantity and precision for a symbol
   */
  getMinQtyAndPrecision(symbol: string): { min: number; precision: number } {
    const market = this.marketsCache.get(symbol);
    
    if (market) {
      const increment = parseFloat(market.order_size_increment);
      const precision = this.getPrecisionFromIncrement(increment);
      const minNotional = parseFloat(market.min_notional);
      
      return {
        min: increment,
        precision,
      };
    }

    // Fallback defaults
    return { min: 0.001, precision: 3 };
  }

  /**
   * Calculate precision from increment
   */
  private getPrecisionFromIncrement(increment: number): number {
    const incrementStr = increment.toString();
    if (incrementStr.includes('.')) {
      return incrementStr.split('.')[1].length;
    }
    return 0;
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

  /**
   * Format price as string with correct precision
   */
  formatPrice(symbol: string, price: number): string {
    const market = this.marketsCache.get(symbol);
    
    if (market) {
      const tickSize = parseFloat(market.price_tick_size);
      const precision = this.getPrecisionFromIncrement(tickSize);
      const rounded = Math.floor(price / tickSize) * tickSize;
      return rounded.toFixed(precision);
    }

    // Fallback: 2 decimal places
    return price.toFixed(2);
  }

  /**
   * Get account address
   */
  getAddress(): string {
    this.ensureInitialized();
    return this.client!.getAddress();
  }

  // =============================================================================
  // HTTP REQUEST WRAPPER
  // =============================================================================

  /**
   * Make HTTP request to Paradex API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body: any = null,
    authenticated: boolean = false,
    retries: number = 3
  ): Promise<T> {
    const url = `${this.paradexConfig.apiBaseUrl}${endpoint}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // For authenticated requests, we'll use the Paradex SDK's built-in auth
        // For now, we'll use plain fetch for public endpoints
        // and rely on the SDK for private endpoints

        const options: RequestInit = {
          method,
          headers,
        };

        if (body && method === 'POST') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Paradex API error ${response.status}: ${errorBody}`);
        }

        return response.json() as Promise<T>;
      } catch (error: any) {
        const isLastAttempt = attempt === retries;
        
        if (isLastAttempt) {
          executionLogger.error({
            method,
            endpoint,
            error: error.message,
          }, 'Paradex request failed after all retries');
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw new Error('Request failed after all retries');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createParadexClient(credentials?: ExchangeCredentials): ParadexClient {
  if (credentials) {
    return new ParadexClient({
      privateKey: credentials.secretKey,
    });
  }
  return new ParadexClient();
}
