/**
 * Paradex Kline Builder
 * Aggregates real-time trades into candlestick (kline) data
 */

import type { ParadexTrade } from './paradex-websocket-client';
import { executionLogger } from '../../utils/logger';

/**
 * Kline interval in milliseconds
 */
const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * Kline (candlestick) data structure
 * Note: Using internal definition to avoid circular dependency
 */
interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Builds klines from real-time trade data
 */
export class ParadexKlineBuilder {
  private klines: Map<string, Kline[]> = new Map(); // market -> klines
  private currentKline: Map<string, Kline> = new Map(); // market -> current kline
  private interval: string;
  private intervalMs: number;
  private maxKlines: number;

  constructor(interval: string = '5m', maxKlines: number = 100) {
    this.interval = interval;
    this.intervalMs = INTERVAL_MS[interval] || INTERVAL_MS['5m'];
    this.maxKlines = maxKlines;
  }

  /**
   * Process a trade and update klines
   */
  processTrade(trade: ParadexTrade): void {
    const market = trade.market;
    const price = parseFloat(trade.price);
    const size = parseFloat(trade.size);
    const timestamp = trade.timestamp;

    // Get or create current kline
    let currentKline = this.currentKline.get(market);
    const klineStartTime = this.getKlineStartTime(timestamp);

    // Check if we need to start a new kline
    if (!currentKline || currentKline.openTime !== klineStartTime) {
      // Close previous kline if exists
      if (currentKline) {
        this.closeKline(market, currentKline);
      }

      // Start new kline
      currentKline = {
        openTime: klineStartTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size,
        closeTime: klineStartTime + this.intervalMs - 1,
      };

      this.currentKline.set(market, currentKline);
    } else {
      // Update current kline
      currentKline.high = Math.max(currentKline.high, price);
      currentKline.low = Math.min(currentKline.low, price);
      currentKline.close = price;
      currentKline.volume += size;
    }
  }

  /**
   * Get klines for a market
   * Returns in Binance-compatible format: [openTime, open, high, low, close, volume, closeTime, ...]
   */
  getKlines(market: string, limit?: number): any[] {
    const klines = this.klines.get(market) || [];
    const currentKline = this.currentKline.get(market);

    // Combine closed klines with current kline
    let allKlines = [...klines];
    if (currentKline) {
      allKlines.push(currentKline);
    }

    // Apply limit
    const limitToUse = limit || this.maxKlines;
    if (allKlines.length > limitToUse) {
      allKlines = allKlines.slice(-limitToUse);
    }

    // Convert to Binance-compatible format
    return allKlines.map((kline) => [
      kline.openTime,
      kline.open.toString(),
      kline.high.toString(),
      kline.low.toString(),
      kline.close.toString(),
      kline.volume.toString(),
      kline.closeTime,
      '0', // Quote asset volume (not used)
      0,   // Number of trades (not tracked)
      '0', // Taker buy base asset volume (not tracked)
      '0', // Taker buy quote asset volume (not tracked)
      '0', // Ignore
    ]);
  }

  /**
   * Get the most recent kline
   */
  getCurrentKline(market: string): Kline | null {
    return this.currentKline.get(market) || null;
  }

  /**
   * Close a kline and add it to history
   */
  private closeKline(market: string, kline: Kline): void {
    let marketKlines = this.klines.get(market);
    
    if (!marketKlines) {
      marketKlines = [];
      this.klines.set(market, marketKlines);
    }

    marketKlines.push(kline);

    // Limit history size
    if (marketKlines.length > this.maxKlines) {
      marketKlines.shift();
    }

    executionLogger.debug(
      {
        market,
        openTime: kline.openTime,
        open: kline.open,
        close: kline.close,
        high: kline.high,
        low: kline.low,
        volume: kline.volume,
      },
      'Kline closed'
    );
  }

  /**
   * Get the start time for a kline containing the given timestamp
   */
  private getKlineStartTime(timestamp: number): number {
    return Math.floor(timestamp / this.intervalMs) * this.intervalMs;
  }

  /**
   * Check if enough data is available
   */
  hasEnoughData(market: string, requiredKlines: number): boolean {
    const klines = this.klines.get(market) || [];
    const currentKline = this.currentKline.get(market);
    const totalKlines = klines.length + (currentKline ? 1 : 0);
    return totalKlines >= requiredKlines;
  }

  /**
   * Get the number of available klines for a market
   */
  getKlineCount(market: string): number {
    const klines = this.klines.get(market) || [];
    const currentKline = this.currentKline.get(market);
    return klines.length + (currentKline ? 1 : 0);
  }

  /**
   * Clear all klines for a market
   */
  clearMarket(market: string): void {
    this.klines.delete(market);
    this.currentKline.delete(market);
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.klines.clear();
    this.currentKline.clear();
  }
}
