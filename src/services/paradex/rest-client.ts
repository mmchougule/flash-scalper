/**
 * Paradex REST API Client
 * Handles HTTP requests to Paradex perpetual futures exchange
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';
import type {
  ParadexAuth,
  ParadexAccount,
  ParadexPosition,
  ParadexOrder,
  ParadexOrderRequest,
  ParadexFill,
  ParadexMarketInfo,
  ParadexTicker,
  ParadexAPIResponse,
  ParadexPaginatedResponse,
} from './types';

// =============================================================================
// PARADEX REST CLIENT
// =============================================================================

export class ParadexRestClient {
  private baseUrl: string;
  private auth: ParadexAuth;
  private jwtToken?: string;
  private jwtExpiry?: number;

  constructor(auth: ParadexAuth, baseUrl: string = 'https://api.testnet.paradex.trade/v1') {
    this.auth = auth;
    this.baseUrl = baseUrl;
  }

  // =============================================================================
  // AUTHENTICATION
  // =============================================================================

  /**
   * Get JWT token for authenticated requests
   * Tokens are cached and refreshed when needed
   */
  private async getJWT(): Promise<string> {
    // Return cached token if still valid
    if (this.jwtToken && this.jwtExpiry && Date.now() < this.jwtExpiry - 60000) {
      return this.jwtToken;
    }

    // Request new JWT token
    const timestamp = Date.now();
    const message = `paradex-auth:${this.auth.accountAddress}:${timestamp}`;
    const signature = this.signMessage(message);

    const response = await this.request<{ jwt: string; expires_at: number }>(
      'POST',
      '/auth/jwt',
      {
        account: this.auth.accountAddress,
        timestamp,
        signature,
      },
      false
    );

    if (response.success && response.data) {
      this.jwtToken = response.data.jwt;
      this.jwtExpiry = response.data.expires_at;
      return this.jwtToken;
    }

    throw new Error('Failed to obtain JWT token');
  }

  /**
   * Sign a message with the private key
   */
  private signMessage(message: string): string {
    const hash = crypto.createHash('sha256').update(message).digest();
    const sign = crypto.createSign('SHA256');
    sign.update(hash);
    return sign.sign(this.auth.privateKey, 'hex');
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any,
    authenticated: boolean = true,
    retries: number = 3
  ): Promise<ParadexAPIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add JWT token for authenticated requests
        if (authenticated) {
          const jwt = await this.getJWT();
          headers['Authorization'] = `Bearer ${jwt}`;
        }

        const options: RequestInit = {
          method,
          headers,
        };

        if (body && (method === 'POST' || method === 'PUT')) {
          options.body = JSON.stringify(body);
        } else if (body && method === 'GET') {
          // Append query params for GET
          const params = new URLSearchParams(body);
          const queryUrl = `${url}?${params.toString()}`;
          const response = await fetch(queryUrl, options);
          return this.handleResponse<T>(response);
        }

        const response = await fetch(url, options);
        return this.handleResponse<T>(response);
      } catch (error: any) {
        if (attempt === retries) {
          logger.error({ error: error.message, endpoint, method }, 'Paradex API request failed');
          return {
            success: false,
            error: error.message,
            timestamp: Date.now(),
          };
        }
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    return {
      success: false,
      error: 'Request failed after all retries',
      timestamp: Date.now(),
    };
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(response: Response): Promise<ParadexAPIResponse<T>> {
    const timestamp = Date.now();

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as T,
      timestamp,
    };
  }

  // =============================================================================
  // MARKET DATA ENDPOINTS (PUBLIC)
  // =============================================================================

  /**
   * Get all available markets
   */
  async getMarkets(): Promise<ParadexAPIResponse<ParadexMarketInfo[]>> {
    return this.request<ParadexMarketInfo[]>('GET', '/markets', undefined, false);
  }

  /**
   * Get market info for a specific market
   */
  async getMarket(market: string): Promise<ParadexAPIResponse<ParadexMarketInfo>> {
    return this.request<ParadexMarketInfo>('GET', `/markets/${market}`, undefined, false);
  }

  /**
   * Get ticker for a market
   */
  async getTicker(market: string): Promise<ParadexAPIResponse<ParadexTicker>> {
    return this.request<ParadexTicker>('GET', `/tickers/${market}`, undefined, false);
  }

  /**
   * Get all tickers
   */
  async getTickers(): Promise<ParadexAPIResponse<ParadexTicker[]>> {
    return this.request<ParadexTicker[]>('GET', '/tickers', undefined, false);
  }

  // =============================================================================
  // ACCOUNT ENDPOINTS (AUTHENTICATED)
  // =============================================================================

  /**
   * Get account information
   */
  async getAccount(): Promise<ParadexAPIResponse<ParadexAccount>> {
    return this.request<ParadexAccount>('GET', '/account');
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    const response = await this.getAccount();
    
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get account balance');
    }

    return {
      balance: parseFloat(response.data.equity),
      unrealizedPnL: parseFloat(response.data.unrealized_pnl),
    };
  }

  // =============================================================================
  // POSITION ENDPOINTS (AUTHENTICATED)
  // =============================================================================

  /**
   * Get all positions
   */
  async getPositions(): Promise<ParadexAPIResponse<ParadexPosition[]>> {
    return this.request<ParadexPosition[]>('GET', '/positions');
  }

  /**
   * Get position for a specific market
   */
  async getPosition(market: string): Promise<ParadexAPIResponse<ParadexPosition | null>> {
    const response = await this.getPositions();
    
    if (!response.success || !response.data) {
      return {
        success: response.success,
        error: response.error,
        data: null,
        timestamp: response.timestamp,
      };
    }

    const position = response.data.find((p) => p.market === market);
    return {
      success: true,
      data: position || null,
      timestamp: response.timestamp,
    };
  }

  // =============================================================================
  // ORDER ENDPOINTS (AUTHENTICATED)
  // =============================================================================

  /**
   * Place an order
   */
  async placeOrder(orderRequest: ParadexOrderRequest): Promise<ParadexAPIResponse<ParadexOrder>> {
    return this.request<ParadexOrder>('POST', '/orders', orderRequest);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<ParadexAPIResponse<ParadexOrder>> {
    return this.request<ParadexOrder>('DELETE', `/orders/${orderId}`);
  }

  /**
   * Cancel all orders for a market
   */
  async cancelAllOrders(market?: string): Promise<ParadexAPIResponse<{ cancelled_count: number }>> {
    const body = market ? { market } : undefined;
    return this.request<{ cancelled_count: number }>('DELETE', '/orders', body);
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<ParadexAPIResponse<ParadexOrder>> {
    return this.request<ParadexOrder>('GET', `/orders/${orderId}`);
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(market?: string): Promise<ParadexAPIResponse<ParadexOrder[]>> {
    const params = market ? { market, status: 'open' } : { status: 'open' };
    return this.request<ParadexOrder[]>('GET', '/orders', params);
  }

  /**
   * Get order history
   */
  async getOrderHistory(
    market?: string,
    cursor?: string,
    limit: number = 100
  ): Promise<ParadexAPIResponse<ParadexPaginatedResponse<ParadexOrder>>> {
    const params: any = { limit };
    if (market) params.market = market;
    if (cursor) params.cursor = cursor;
    return this.request<ParadexPaginatedResponse<ParadexOrder>>('GET', '/orders/history', params);
  }

  // =============================================================================
  // FILL ENDPOINTS (AUTHENTICATED)
  // =============================================================================

  /**
   * Get fills (trade history)
   */
  async getFills(
    market?: string,
    cursor?: string,
    limit: number = 100
  ): Promise<ParadexAPIResponse<ParadexPaginatedResponse<ParadexFill>>> {
    const params: any = { limit };
    if (market) params.market = market;
    if (cursor) params.cursor = cursor;
    return this.request<ParadexPaginatedResponse<ParadexFill>>('GET', '/fills', params);
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Place a market order
   */
  async placeMarketOrder(
    market: string,
    side: 'buy' | 'sell',
    size: string,
    reduceOnly: boolean = false
  ): Promise<ParadexAPIResponse<ParadexOrder>> {
    return this.placeOrder({
      market,
      side,
      type: 'market',
      size,
      reduce_only: reduceOnly,
    });
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    market: string,
    side: 'buy' | 'sell',
    size: string,
    price: string,
    reduceOnly: boolean = false,
    postOnly: boolean = false
  ): Promise<ParadexAPIResponse<ParadexOrder>> {
    return this.placeOrder({
      market,
      side,
      type: 'limit',
      size,
      price,
      reduce_only: reduceOnly,
      post_only: postOnly,
    });
  }

  /**
   * Get current price for a market
   */
  async getPrice(market: string): Promise<number> {
    const response = await this.getTicker(market);
    
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get price');
    }

    return parseFloat(response.data.last_price);
  }
}
