/**
 * Base Exchange Client - Abstract interface for exchange clients
 */

import type { OrderResult } from '../../types';

/**
 * Position data from exchange
 */
export interface ExchangePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  unrealizedProfit: string;
  leverage: string;
  marginType?: string;
  isolatedMargin?: string;
}

/**
 * Abstract base class for exchange clients
 * All exchange implementations must extend this class
 */
export abstract class BaseExchangeClient {
  /**
   * Get account balance
   */
  abstract getBalance(): Promise<{ balance: number; unrealizedPnL: number }>;

  /**
   * Get current price for a symbol
   */
  abstract getPrice(symbol: string): Promise<number>;

  /**
   * Get klines (candlestick data)
   */
  abstract getKlines(symbol: string, interval: string, limit: number): Promise<any[]>;

  /**
   * Set leverage for a symbol
   */
  abstract setLeverage(symbol: string, leverage: number): Promise<void>;

  /**
   * Get all open positions
   */
  abstract getPositions(): Promise<ExchangePosition[]>;

  /**
   * Get position for a specific symbol
   */
  abstract getPosition(symbol: string): Promise<ExchangePosition | null>;

  /**
   * Place market order
   */
  abstract placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly?: boolean
  ): Promise<OrderResult>;

  /**
   * Place limit order
   */
  abstract placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    reduceOnly?: boolean
  ): Promise<OrderResult>;

  /**
   * Cancel order
   */
  abstract cancelOrder(symbol: string, orderId: string): Promise<boolean>;

  /**
   * Check if order exists
   */
  abstract orderExists(symbol: string, orderId: string): Promise<boolean>;

  /**
   * Get minimum quantity and precision for a symbol
   */
  abstract getMinQtyAndPrecision(symbol: string): { min: number; precision: number };

  /**
   * Round quantity to symbol's precision
   */
  abstract roundQuantity(symbol: string, quantity: number): number;

  /**
   * Format quantity as string with correct precision
   */
  abstract formatQuantity(symbol: string, quantity: number): string;
}
