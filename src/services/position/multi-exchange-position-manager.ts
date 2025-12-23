/**
 * Multi-Exchange Position Manager
 * 
 * Manages positions across multiple exchanges with unified monitoring
 */

import { exchangeManager, ExchangeType } from '../execution/exchange-abstraction';
import { multiExchangeExecutor } from '../execution/multi-exchange-executor';
import { executionLogger } from '../../utils/logger';
import type { Position, ScalperConfig } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export interface UnifiedPosition {
  id: string;
  exchange: ExchangeType;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedROE: number;
  highestROE: number;
  lowestROE: number;
  liquidationPrice?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openedAt: number;
  updatedAt: number;
}

export interface PositionMonitorResult {
  action: 'hold' | 'close' | 'update_trailing';
  reason?: string;
  shouldClose?: boolean;
  newStopLoss?: number;
}

// =============================================================================
// MULTI-EXCHANGE POSITION MANAGER
// =============================================================================

export class MultiExchangePositionManager {
  /**
   * Get all positions across all exchanges in unified format
   */
  async getAllUnifiedPositions(): Promise<UnifiedPosition[]> {
    const allPositions: UnifiedPosition[] = [];
    const positionsByExchange = await multiExchangeExecutor.getAllPositions();

    for (const [exchange, positions] of positionsByExchange.entries()) {
      for (const pos of positions) {
        const unifiedPos = this.convertToUnifiedPosition(pos, exchange);
        if (unifiedPos) {
          allPositions.push(unifiedPos);
        }
      }
    }

    return allPositions;
  }

  /**
   * Convert exchange-specific position to unified format
   */
  private convertToUnifiedPosition(
    position: any,
    exchange: ExchangeType
  ): UnifiedPosition | null {
    try {
      // Handle different position formats
      const symbol = position.symbol || position.market;
      const size = Math.abs(parseFloat(position.size || position.positionAmt || '0'));

      if (size === 0) {
        return null;
      }

      const entryPrice = parseFloat(position.entry_price || position.entryPrice || '0');
      const markPrice = parseFloat(position.mark_price || position.currentPrice || '0');
      const unrealizedPnl = parseFloat(position.unrealized_pnl || position.unrealizedProfit || '0');

      // Determine side
      let side: 'long' | 'short';
      if (position.side) {
        side = position.side.toLowerCase() === 'long' ? 'long' : 'short';
      } else {
        const posAmt = parseFloat(position.positionAmt || '0');
        side = posAmt > 0 ? 'long' : 'short';
      }

      // Calculate ROE
      const marginUsed = parseFloat(position.margin || position.marginUsed || '0');
      const unrealizedROE = marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0;

      return {
        id: `${exchange}-${symbol}-${Date.now()}`,
        exchange,
        symbol,
        side,
        size,
        entryPrice,
        currentPrice: markPrice,
        leverage: parseFloat(position.leverage || '1'),
        marginUsed,
        unrealizedPnl,
        unrealizedROE,
        highestROE: unrealizedROE,
        lowestROE: unrealizedROE,
        liquidationPrice: position.liquidation_price ? parseFloat(position.liquidation_price) : undefined,
        stopLoss: null,
        takeProfit: null,
        openedAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error: any) {
      executionLogger.error({
        error: error.message,
        exchange,
        position,
      }, 'Failed to convert position to unified format');
      return null;
    }
  }

  /**
   * Monitor position and determine if action is needed
   */
  async monitorPosition(
    position: UnifiedPosition,
    config: ScalperConfig
  ): Promise<PositionMonitorResult> {
    const { unrealizedROE, openedAt, currentPrice, entryPrice } = position;

    // Check stop-loss
    if (unrealizedROE <= config.stopLossROE) {
      return {
        action: 'close',
        shouldClose: true,
        reason: `Stop-loss hit: ${unrealizedROE.toFixed(2)}% ROE <= ${config.stopLossROE}%`,
      };
    }

    // Check take-profit
    const targetTP = position.takeProfit || config.takeProfitROE;
    if (unrealizedROE >= targetTP) {
      return {
        action: 'close',
        shouldClose: true,
        reason: `Take-profit hit: ${unrealizedROE.toFixed(2)}% ROE >= ${targetTP}%`,
      };
    }

    // Check max hold time
    const holdTimeMinutes = (Date.now() - openedAt) / 60000;
    if (holdTimeMinutes >= config.maxHoldTimeMinutes) {
      return {
        action: 'close',
        shouldClose: true,
        reason: `Max hold time exceeded: ${holdTimeMinutes.toFixed(1)} minutes >= ${config.maxHoldTimeMinutes} minutes`,
      };
    }

    // Check trailing stop
    if (
      config.trailingActivationROE &&
      unrealizedROE >= config.trailingActivationROE
    ) {
      const trailingDistance = config.trailingDistanceROE || 0.2;
      const newStopLoss = currentPrice * (1 - trailingDistance / 100);

      return {
        action: 'update_trailing',
        reason: `Trailing stop activated at ${unrealizedROE.toFixed(2)}% ROE`,
        newStopLoss,
      };
    }

    return {
      action: 'hold',
      reason: 'Position within acceptable parameters',
    };
  }

  /**
   * Close position on specific exchange
   */
  async closePosition(
    position: UnifiedPosition,
    reason: string
  ): Promise<boolean> {
    try {
      executionLogger.info({
        exchange: position.exchange,
        symbol: position.symbol,
        side: position.side,
        size: position.size,
        pnl: position.unrealizedPnl,
        reason,
      }, 'Closing position');

      const result = await multiExchangeExecutor.closePosition(
        position.symbol,
        position.exchange,
        reason
      );

      if (result.success) {
        executionLogger.info({
          exchange: position.exchange,
          symbol: position.symbol,
          orderId: result.orderId,
          filledPrice: result.filledPrice,
        }, 'Position closed successfully');
        return true;
      } else {
        executionLogger.error({
          exchange: position.exchange,
          symbol: position.symbol,
          error: result.error,
        }, 'Failed to close position');
        return false;
      }
    } catch (error: any) {
      executionLogger.error({
        error: error.message,
        exchange: position.exchange,
        symbol: position.symbol,
      }, 'Error closing position');
      return false;
    }
  }

  /**
   * Monitor all positions and take necessary actions
   */
  async monitorAllPositions(
    config: ScalperConfig
  ): Promise<Map<string, PositionMonitorResult>> {
    const results = new Map<string, PositionMonitorResult>();
    const positions = await this.getAllUnifiedPositions();

    for (const position of positions) {
      try {
        const result = await this.monitorPosition(position, config);
        results.set(position.id, result);

        // Execute close action if needed
        if (result.shouldClose && result.reason) {
          await this.closePosition(position, result.reason);
        }
      } catch (error: any) {
        executionLogger.error({
          error: error.message,
          position: position.id,
        }, 'Error monitoring position');
      }
    }

    return results;
  }

  /**
   * Get position summary across all exchanges
   */
  async getPositionSummary(): Promise<{
    totalPositions: number;
    byExchange: Map<ExchangeType, number>;
    totalUnrealizedPnL: number;
    totalMarginUsed: number;
  }> {
    const positions = await this.getAllUnifiedPositions();

    const byExchange = new Map<ExchangeType, number>();
    let totalUnrealizedPnL = 0;
    let totalMarginUsed = 0;

    for (const pos of positions) {
      byExchange.set(pos.exchange, (byExchange.get(pos.exchange) || 0) + 1);
      totalUnrealizedPnL += pos.unrealizedPnl;
      totalMarginUsed += pos.marginUsed;
    }

    return {
      totalPositions: positions.length,
      byExchange,
      totalUnrealizedPnL,
      totalMarginUsed,
    };
  }

  /**
   * Calculate total exposure across all exchanges
   */
  async calculateTotalExposure(): Promise<number> {
    const positions = await this.getAllUnifiedPositions();
    return positions.reduce((total, pos) => {
      return total + (pos.size * pos.currentPrice);
    }, 0);
  }

  /**
   * Check if can open new position considering all exchanges
   */
  async canOpenNewPosition(
    config: ScalperConfig,
    positionSizeUSD: number
  ): Promise<{ canOpen: boolean; reason?: string }> {
    const positions = await this.getAllUnifiedPositions();

    // Check max positions limit
    if (positions.length >= config.maxPositions) {
      return {
        canOpen: false,
        reason: `Maximum positions reached: ${positions.length}/${config.maxPositions}`,
      };
    }

    // Check total exposure
    const totalBalance = await multiExchangeExecutor.getTotalBalance();
    const totalExposure = await this.calculateTotalExposure();
    const maxExposure = (totalBalance.balance * config.maxExposurePercent) / 100;

    if (totalExposure + positionSizeUSD > maxExposure) {
      return {
        canOpen: false,
        reason: `Max exposure exceeded: ${totalExposure.toFixed(2)} + ${positionSizeUSD.toFixed(2)} > ${maxExposure.toFixed(2)}`,
      };
    }

    return {
      canOpen: true,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const multiExchangePositionManager = new MultiExchangePositionManager();
