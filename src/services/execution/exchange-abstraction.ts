/**
 * Exchange Abstraction Layer
 * 
 * Provides a unified interface for trading across multiple exchanges
 * (Aster, Paradex, etc.)
 */

import type { OrderResult } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export type ExchangeType = 'aster' | 'paradex';

export interface ExchangeClient {
  // Market Data
  getPrice(symbol: string): Promise<number>;
  getBalance(): Promise<{ balance: number; unrealizedPnL: number }>;
  
  // Order Execution
  placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly?: boolean
  ): Promise<OrderResult>;
  
  placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    reduceOnly?: boolean
  ): Promise<OrderResult>;
  
  cancelOrder(symbol: string, orderId: string): Promise<boolean>;
  
  // Position Management
  getPositions(): Promise<any[]>;
  getPosition(symbol: string): Promise<any | null>;
  
  // Utilities
  formatQuantity(symbol: string, quantity: number): string;
  formatPrice?(symbol: string, price: number): string;
  roundQuantity(symbol: string, quantity: number): number;
  getMinQtyAndPrecision(symbol: string): { min: number; precision: number };
}

// =============================================================================
// EXCHANGE MANAGER
// =============================================================================

export class ExchangeManager {
  private clients: Map<ExchangeType, ExchangeClient> = new Map();
  private defaultExchange: ExchangeType = 'aster';

  /**
   * Register an exchange client
   */
  registerExchange(type: ExchangeType, client: ExchangeClient): void {
    this.clients.set(type, client);
  }

  /**
   * Get exchange client
   */
  getExchange(type: ExchangeType): ExchangeClient {
    const client = this.clients.get(type);
    if (!client) {
      throw new Error(`Exchange ${type} not registered`);
    }
    return client;
  }

  /**
   * Set default exchange
   */
  setDefaultExchange(type: ExchangeType): void {
    if (!this.clients.has(type)) {
      throw new Error(`Exchange ${type} not registered`);
    }
    this.defaultExchange = type;
  }

  /**
   * Get default exchange
   */
  getDefaultExchange(): ExchangeClient {
    return this.getExchange(this.defaultExchange);
  }

  /**
   * Get all registered exchanges
   */
  getAvailableExchanges(): ExchangeType[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if exchange is registered
   */
  hasExchange(type: ExchangeType): boolean {
    return this.clients.has(type);
  }

  /**
   * Place market order on specified exchange (or default)
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    exchange?: ExchangeType,
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    const client = exchange ? this.getExchange(exchange) : this.getDefaultExchange();
    return client.placeMarketOrder(symbol, side, quantity, reduceOnly);
  }

  /**
   * Place limit order on specified exchange (or default)
   */
  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    exchange?: ExchangeType,
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    const client = exchange ? this.getExchange(exchange) : this.getDefaultExchange();
    return client.placeLimitOrder(symbol, side, quantity, price, reduceOnly);
  }

  /**
   * Get price from specified exchange (or default)
   */
  async getPrice(symbol: string, exchange?: ExchangeType): Promise<number> {
    const client = exchange ? this.getExchange(exchange) : this.getDefaultExchange();
    return client.getPrice(symbol);
  }

  /**
   * Get balance from specified exchange (or default)
   */
  async getBalance(exchange?: ExchangeType): Promise<{ balance: number; unrealizedPnL: number }> {
    const client = exchange ? this.getExchange(exchange) : this.getDefaultExchange();
    return client.getBalance();
  }

  /**
   * Get positions from specified exchange (or default)
   */
  async getPositions(exchange?: ExchangeType): Promise<any[]> {
    const client = exchange ? this.getExchange(exchange) : this.getDefaultExchange();
    return client.getPositions();
  }

  /**
   * Get positions from ALL registered exchanges
   */
  async getAllPositions(): Promise<Map<ExchangeType, any[]>> {
    const positions = new Map<ExchangeType, any[]>();

    for (const [type, client] of this.clients.entries()) {
      try {
        const exchangePositions = await client.getPositions();
        positions.set(type, exchangePositions);
      } catch (error: any) {
        console.error(`Failed to fetch positions from ${type}:`, error.message);
        positions.set(type, []);
      }
    }

    return positions;
  }

  /**
   * Get total balance across all exchanges
   */
  async getTotalBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    let totalBalance = 0;
    let totalPnL = 0;

    for (const [type, client] of this.clients.entries()) {
      try {
        const balance = await client.getBalance();
        totalBalance += balance.balance;
        totalPnL += balance.unrealizedPnL;
      } catch (error: any) {
        console.error(`Failed to fetch balance from ${type}:`, error.message);
      }
    }

    return {
      balance: totalBalance,
      unrealizedPnL: totalPnL,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const exchangeManager = new ExchangeManager();
