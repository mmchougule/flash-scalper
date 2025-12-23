/**
 * Symbol Mapper - Converts between internal and exchange-specific symbol formats
 */

/**
 * Symbol mapping utilities for different exchanges
 */
export class SymbolMapper {
  /**
   * Convert internal symbol to Paradex market format
   * @param symbol Internal symbol (e.g., 'ETHUSDT')
   * @returns Paradex market name (e.g., 'ETH-USD-PERP')
   */
  static toParadex(symbol: string): string {
    // Remove USDT suffix and format for Paradex
    const base = symbol.replace(/USDT$/, '');
    return `${base}-USD-PERP`;
  }

  /**
   * Convert Paradex market format to internal symbol
   * @param market Paradex market name (e.g., 'ETH-USD-PERP')
   * @returns Internal symbol (e.g., 'ETHUSDT')
   */
  static fromParadex(market: string): string {
    // Extract base currency and add USDT
    const base = market.split('-')[0];
    return `${base}USDT`;
  }

  /**
   * Get Paradex market from coin config
   * @param symbol Internal symbol
   * @param paradexMarket Optional paradex market override from config
   * @returns Paradex market name
   */
  static getParadexMarket(symbol: string, paradexMarket?: string): string {
    return paradexMarket || this.toParadex(symbol);
  }
}
