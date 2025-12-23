/**
 * Multi-Exchange Order Executor
 * 
 * Executes orders across multiple exchanges with intelligent routing
 */

import { AsterClient } from './exchange-client';
import { ParadexClient } from './paradex-client';
import { exchangeManager, ExchangeType } from './exchange-abstraction';
import { config } from '../../config';
import { executionLogger } from '../../utils/logger';
import type { OrderResult, Signal } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderExecutionOptions {
  exchange?: ExchangeType;
  useLimit?: boolean;
  limitPriceOffset?: number; // Percentage offset from current price
  postOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
}

export interface ExecutionResult extends OrderResult {
  exchange: ExchangeType;
  executionTime: number;
}

// =============================================================================
// MULTI-EXCHANGE EXECUTOR
// =============================================================================

export class MultiExchangeExecutor {
  private initialized: boolean = false;

  /**
   * Initialize all configured exchanges
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    executionLogger.info('Initializing multi-exchange executor...');

    // Initialize Aster (if configured)
    if (config.aster.apiKey && config.aster.secretKey) {
      try {
        const asterClient = new AsterClient();
        exchangeManager.registerExchange('aster', asterClient);
        exchangeManager.setDefaultExchange('aster');
        executionLogger.info('✅ Aster exchange registered');
      } catch (error: any) {
        executionLogger.warn({ error: error.message }, 'Failed to initialize Aster');
      }
    }

    // Initialize Paradex (if configured)
    const paradexConfig = (config as any).paradex;
    if (paradexConfig?.enabled && paradexConfig?.privateKey) {
      try {
        const paradexClient = new ParadexClient({
          enabled: true,
          environment: paradexConfig.environment,
          privateKey: paradexConfig.privateKey,
          apiBaseUrl: paradexConfig.apiBaseUrl,
        });

        await paradexClient.initialize();
        exchangeManager.registerExchange('paradex', paradexClient);
        
        // Set Paradex as default if Aster not available
        if (!exchangeManager.hasExchange('aster')) {
          exchangeManager.setDefaultExchange('paradex');
        }
        
        executionLogger.info('✅ Paradex exchange registered');
      } catch (error: any) {
        executionLogger.warn({ error: error.message }, 'Failed to initialize Paradex');
      }
    }

    const availableExchanges = exchangeManager.getAvailableExchanges();
    executionLogger.info({ exchanges: availableExchanges }, 'Multi-exchange executor initialized');

    if (availableExchanges.length === 0) {
      throw new Error('No exchanges configured. Please configure at least one exchange.');
    }

    this.initialized = true;
  }

  /**
   * Execute order based on signal
   */
  async executeSignal(
    signal: Signal,
    positionSizeUSD: number,
    options: OrderExecutionOptions = {}
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const exchange = options.exchange || exchangeManager.getAvailableExchanges()[0];

    executionLogger.info({
      signal: signal.type,
      symbol: signal.symbol,
      confidence: signal.confidence,
      exchange,
    }, 'Executing signal');

    try {
      // Get current price
      const currentPrice = await exchangeManager.getPrice(signal.symbol, exchange);
      
      // Calculate quantity
      const quantity = positionSizeUSD / currentPrice;
      
      // Determine order side
      const side: 'BUY' | 'SELL' = signal.type === 'LONG' ? 'BUY' : 'SELL';

      // Execute order
      let result: OrderResult;

      if (options.useLimit && options.limitPriceOffset !== undefined) {
        // Place limit order with offset
        const limitPrice = currentPrice * (1 + options.limitPriceOffset / 100);
        result = await exchangeManager.placeLimitOrder(
          signal.symbol,
          side,
          quantity,
          limitPrice,
          exchange,
          options.reduceOnly
        );
      } else {
        // Place market order
        result = await exchangeManager.placeMarketOrder(
          signal.symbol,
          side,
          quantity,
          exchange,
          options.reduceOnly
        );
      }

      const executionTime = Date.now() - startTime;

      return {
        ...result,
        exchange,
        executionTime,
      };
    } catch (error: any) {
      executionLogger.error({
        error: error.message,
        signal: signal.type,
        symbol: signal.symbol,
        exchange,
      }, 'Order execution failed');

      return {
        success: false,
        error: error.message,
        exchange,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Close position on specified exchange
   */
  async closePosition(
    symbol: string,
    exchange: ExchangeType,
    reason: string = 'Manual close'
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    executionLogger.info({
      symbol,
      exchange,
      reason,
    }, 'Closing position');

    try {
      // Get current position
      const client = exchangeManager.getExchange(exchange);
      const position = await client.getPosition(symbol);

      if (!position) {
        throw new Error(`No position found for ${symbol} on ${exchange}`);
      }

      // Determine close side (opposite of position)
      const side: 'BUY' | 'SELL' = position.side === 'LONG' ? 'SELL' : 'BUY';
      const quantity = Math.abs(parseFloat(position.size || position.positionAmt));

      // Execute market order to close
      const result = await exchangeManager.placeMarketOrder(
        symbol,
        side,
        quantity,
        exchange,
        true // reduceOnly
      );

      const executionTime = Date.now() - startTime;

      executionLogger.info({
        symbol,
        exchange,
        side,
        quantity,
        success: result.success,
      }, 'Position close order placed');

      return {
        ...result,
        exchange,
        executionTime,
      };
    } catch (error: any) {
      executionLogger.error({
        error: error.message,
        symbol,
        exchange,
      }, 'Position close failed');

      return {
        success: false,
        error: error.message,
        exchange,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Place stop-loss order
   */
  async placeStopLoss(
    symbol: string,
    stopPrice: number,
    quantity: number,
    exchange?: ExchangeType
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const targetExchange = exchange || exchangeManager.getAvailableExchanges()[0];

    executionLogger.info({
      symbol,
      stopPrice,
      quantity,
      exchange: targetExchange,
    }, 'Placing stop-loss order');

    // For now, we'll simulate stop-loss with a limit order
    // In Phase 3, we'll add proper stop-loss order support
    try {
      const client = exchangeManager.getExchange(targetExchange);
      const position = await client.getPosition(symbol);

      if (!position) {
        throw new Error('No position found for stop-loss');
      }

      const side: 'BUY' | 'SELL' = position.side === 'LONG' ? 'SELL' : 'BUY';

      const result = await exchangeManager.placeLimitOrder(
        symbol,
        side,
        quantity,
        stopPrice,
        targetExchange,
        true // reduceOnly
      );

      return {
        ...result,
        exchange: targetExchange,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        exchange: targetExchange,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get all positions across all exchanges
   */
  async getAllPositions(): Promise<Map<ExchangeType, any[]>> {
    if (!this.initialized) {
      await this.initialize();
    }

    return exchangeManager.getAllPositions();
  }

  /**
   * Get total balance across all exchanges
   */
  async getTotalBalance(): Promise<{ balance: number; unrealizedPnL: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    return exchangeManager.getTotalBalance();
  }

  /**
   * Get available exchanges
   */
  getAvailableExchanges(): ExchangeType[] {
    return exchangeManager.getAvailableExchanges();
  }

  /**
   * Check if exchange is available
   */
  hasExchange(type: ExchangeType): boolean {
    return exchangeManager.hasExchange(type);
  }

  /**
   * Get exchange manager instance
   */
  getExchangeManager() {
    return exchangeManager;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const multiExchangeExecutor = new MultiExchangeExecutor();
