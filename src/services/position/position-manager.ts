/**
 * Position Manager Service
 * Handles position monitoring, P&L tracking, SL/TP management
 */

import type {
  Position,
  ScalperConfig,
  TechnicalIndicators,
  Kline,
  AgentState,
} from '../../types';
import { AsterClient } from '../execution/exchange-client';
import { closePosition, ClosePositionResult } from '../execution/order-executor';
import { analyzeExit } from '../signal/llm-analyzer';
import { calculateAllIndicators, parseKlines } from '../signal/technical-analysis';
import { positionLogger, logPosition } from '../../utils/logger';
import { updateAgentMetrics } from '../../utils/metrics';

// =============================================================================
// POSITION UPDATE
// =============================================================================

export interface PositionUpdateResult {
  position: Position;
  action: 'hold' | 'close_tp' | 'close_sl' | 'close_trailing' | 'close_time' | 'close_llm' | 'close_partial';
  reason?: string;
}

/**
 * Update position with current price and check exit conditions
 */
export function updatePosition(
  position: Position,
  currentPrice: number,
  config: ScalperConfig
): PositionUpdateResult {
  // Calculate unrealized P&L
  let unrealizedPnl: number;
  if (position.side === 'long') {
    unrealizedPnl = (currentPrice - position.entryPrice) * position.size;
  } else {
    unrealizedPnl = (position.entryPrice - currentPrice) * position.size;
  }

  // Calculate ROE
  const roe = position.marginUsed > 0 ? (unrealizedPnl / position.marginUsed) * 100 : 0;

  // Update position
  position.currentPrice = currentPrice;
  position.unrealizedPnl = unrealizedPnl;
  position.unrealizedROE = roe;
  position.updatedAt = Date.now();

  // Track peak/trough
  if (roe > position.highestROE) {
    position.highestROE = roe;
  }
  if (roe < position.lowestROE) {
    position.lowestROE = roe;
  }

  // Check exit conditions
  const holdTimeMs = Date.now() - position.openedAt;
  const holdTimeMinutes = holdTimeMs / 60000;

  // Use dynamic TP if available, otherwise use config TP
  const takeProfitTarget = position.dynamicTP || position.takeProfit || config.takeProfitROE;

  // 1. Partial Profit Taking (let winners run longer)
  // Only take partial profit if we haven't hit TP yet and position is doing well
  if (config.partialProfitEnabled && 
      !position.partialProfitTaken && 
      position.originalSize &&
      roe >= (config.partialProfitROE || 6) && 
      roe < takeProfitTarget && // Don't take partial if we're at TP (let it hit full TP)
      unrealizedPnl >= config.minProfitUSD) {
    return {
      position,
      action: 'close_partial', // Special action for partial close
      reason: `Partial profit at ${roe.toFixed(2)}% ROE (taking ${config.partialProfitPercent || 50}%)`,
    };
  }

  // 2. Take Profit (full)
  if (roe >= takeProfitTarget && unrealizedPnl >= config.minProfitUSD) {
    return {
      position,
      action: 'close_tp',
      reason: `Take profit at ${roe.toFixed(2)}% ROE (target: ${takeProfitTarget.toFixed(1)}%, $${unrealizedPnl.toFixed(2)})`,
    };
  }

  // 3. Stop Loss - ULTRA-AGGRESSIVE early trigger for quick scalping
  // Trigger at configurable percentage of stop loss to exit VERY quickly (default 90%)
  const earlyTriggerPercent = config.stopLossEarlyTriggerPercent ?? 0.9;
  const stopLossTrigger = config.stopLossROE * earlyTriggerPercent;
  if (roe <= stopLossTrigger) {
    return {
      position,
      action: 'close_sl',
      reason: `Quick stop loss: ${roe.toFixed(2)}% ROE (target: ${config.stopLossROE.toFixed(2)}%, trigger: ${(earlyTriggerPercent * 100).toFixed(0)}%, $${unrealizedPnl.toFixed(2)}) - ultra-fast exit`,
    };
  }
  
  // 3b. Emergency stop loss - if we're 1.5x past SL, exit immediately
  // This catches cases where price gaps past our stop loss (tighter than before)
  if (roe <= config.stopLossROE * 1.5) { // If we're 1.5x past SL, emergency exit (was 2x)
    return {
      position,
      action: 'close_sl',
      reason: `EMERGENCY stop loss: ${roe.toFixed(2)}% ROE (way past ${config.stopLossROE.toFixed(2)}% target) - price gap detected`,
    };
  }

  // 4. PROFIT LOCK STOP: Ultra-aggressive - lock in profits after 0.3% gain
  // Activate at +0.3% and lock in +0.2% profit (quick protection for scalping)
  // This ensures we capture $0.20+ on every winning trade
  const profitLockActivationROE = 0.3; // Activate at 0.3% (was 0.5%) - quicker
  const lockedProfitROE = 0.2; // Lock in 0.2% profit (was 0.3%) - tighter

  if (!position.breakEvenActivated && roe >= profitLockActivationROE) {
    position.breakEvenActivated = true;
    // Calculate price that gives us +1% ROE profit
    // ROE = (priceChange / entryPrice) * leverage * 100
    // priceChange = (ROE / leverage / 100) * entryPrice
    const priceChangeForLockedProfit = (lockedProfitROE / position.leverage / 100) * position.entryPrice;

    if (position.side === 'long') {
      position.breakEvenStopPrice = position.entryPrice + priceChangeForLockedProfit;
    } else {
      position.breakEvenStopPrice = position.entryPrice - priceChangeForLockedProfit;
    }

    positionLogger.info(
      {
        symbol: position.symbol,
        currentROE: roe.toFixed(2),
        lockedROE: lockedProfitROE,
        stopPrice: position.breakEvenStopPrice.toFixed(4),
        entryPrice: position.entryPrice.toFixed(4)
      },
      '🔒 PROFIT LOCK at 3% ROE - minimum +1% guaranteed (let winners run)'
    );
  }

  // Check profit lock stop (before trailing stop check)
  // Only use profit lock if trailing stop hasn't activated yet (trailing is better)
  if (position.breakEvenActivated && position.breakEvenStopPrice && !position.trailingActivated) {
    const profitLockHit =
      (position.side === 'long' && currentPrice <= position.breakEvenStopPrice) ||
      (position.side === 'short' && currentPrice >= position.breakEvenStopPrice);

    if (profitLockHit) {
      return {
        position,
        action: 'close_trailing',
        reason: `Profit lock hit at ${roe.toFixed(2)}% ROE (locked +${lockedProfitROE}% from peak ${position.highestROE.toFixed(2)}%)`,
      };
    }
  }

  // 5. PEAK PROTECTION: Let winners run, exit on larger reversals
  // Exit if we reverse 0.5% from peak above 1.0% (allows winners to run)
  // For smaller peaks (0.3-1.0%), allow 0.3% reversal
  if (position.highestROE >= 1.0 && roe < position.highestROE - 0.5) {
    // We hit at least 1% profit, but now we're down 0.5% from peak
    // Exit to lock in remaining profit (at least 0.5% if we were at 1%+)
    return {
      position,
      action: 'close_trailing',
      reason: `Peak protection: Reversed ${(position.highestROE - roe).toFixed(2)}% from peak ${position.highestROE.toFixed(2)}% (current: ${roe.toFixed(2)}%)`,
    };
  } else if (position.highestROE >= 0.3 && position.highestROE < 1.0 && roe < position.highestROE - 0.3) {
    // Smaller peaks: allow 0.3% reversal
    return {
      position,
      action: 'close_trailing',
      reason: `Peak protection: Reversed ${(position.highestROE - roe).toFixed(2)}% from peak ${position.highestROE.toFixed(2)}% (current: ${roe.toFixed(2)}%)`,
    };
  }

  // 6. Trailing Stop (earlier activation for bigger wins)
  if (!position.trailingActivated && roe >= config.trailingActivationROE) {
    position.trailingActivated = true;
    position.trailingStopPrice = calculateTrailingStopPrice(position, currentPrice, config);
    positionLogger.debug(
      { symbol: position.symbol, trailingStopPrice: position.trailingStopPrice },
      'Trailing stop activated'
    );
  }

  if (position.trailingActivated && position.trailingStopPrice) {
    // Update trailing stop if price moved favorably
    const newTrailingStop = calculateTrailingStopPrice(position, currentPrice, config);

    if (position.side === 'long' && newTrailingStop > position.trailingStopPrice) {
      position.trailingStopPrice = newTrailingStop;
    } else if (position.side === 'short' && newTrailingStop < position.trailingStopPrice) {
      position.trailingStopPrice = newTrailingStop;
    }

    // Check if trailing stop hit
    const trailingHit =
      (position.side === 'long' && currentPrice <= position.trailingStopPrice) ||
      (position.side === 'short' && currentPrice >= position.trailingStopPrice);

    if (trailingHit) {
      return {
        position,
        action: 'close_trailing',
        reason: `Trailing stop at ${roe.toFixed(2)}% ROE (peak: ${position.highestROE.toFixed(2)}%)`,
      };
    }
  }

  // 7. Time-based exit - SIMPLIFIED: Only exit if not profitable after 5 minutes
  // Let winners run, exit losers quickly
  if (holdTimeMinutes >= 5 && roe < 0.2 && unrealizedPnl < 0.10) {
    // Held for 5+ minutes with minimal/no profit - exit to free capital
    return {
      position,
      action: 'close_time',
      reason: `Time exit: ${roe.toFixed(2)}% ROE after ${holdTimeMinutes.toFixed(1)}min (not profitable, free capital)`,
    };
  }
  
  // 8. Break-even protection: Move to BE after 0.3% profit
  if (!position.breakEvenActivated && roe >= 0.3) {
    position.breakEvenActivated = true;
    position.breakEvenStopPrice = position.entryPrice;
    positionLogger.debug(
      { symbol: position.symbol, currentROE: roe.toFixed(2) },
      'Break-even activated (micro-scalp)'
    );
  }
  
  // Exit at break-even if we hit it after being in profit
  if (position.breakEvenActivated && position.breakEvenStopPrice) {
    const atBreakEven = Math.abs(currentPrice - position.breakEvenStopPrice) / position.entryPrice < 0.001;
    if (atBreakEven && roe < 0.1) {
      return {
        position,
        action: 'close_trailing',
        reason: `Break-even exit: Position returned to entry after profit (micro-scalp protection)`,
      };
    }
  }

  // 8. Max Hold Time
  if (holdTimeMinutes >= config.maxHoldTimeMinutes) {
    return {
      position,
      action: 'close_time',
      reason: `Max hold time (${holdTimeMinutes.toFixed(1)}min) at ${roe.toFixed(2)}% ROE`,
    };
  }

  return { position, action: 'hold' };
}

/**
 * Calculate trailing stop price based on ROE percentage
 *
 * For a trailingDistanceROE of 2.5% with 10x leverage:
 * - The price distance = (ROE% / leverage%) * entryPrice
 * - So 2.5% ROE @ 10x = 0.25% price move from current price
 */
function calculateTrailingStopPrice(
  position: Position,
  currentPrice: number,
  config: ScalperConfig
): number {
  // Convert ROE percentage to price distance
  // ROE = (priceChange / entryPrice) * leverage * 100
  // So priceChange = (ROE / leverage / 100) * entryPrice
  const priceDistance = (config.trailingDistanceROE / position.leverage / 100) * position.entryPrice;

  if (position.side === 'long') {
    return currentPrice - priceDistance;
  } else {
    return currentPrice + priceDistance;
  }
}

// =============================================================================
// LLM EXIT ANALYSIS
// =============================================================================

/**
 * Check if position should be closed based on LLM analysis
 */
export async function checkLLMExit(
  position: Position,
  indicators: TechnicalIndicators,
  klines: Kline[],
  config: ScalperConfig
): Promise<{ shouldExit: boolean; reason?: string }> {
  if (!config.llmExitAnalysisEnabled) {
    return { shouldExit: false };
  }

  const holdTimeMinutes = (Date.now() - position.openedAt) / 60000;

  // Only analyze after minimum time
  if (holdTimeMinutes < config.llmExitAnalysisMinutes) {
    return { shouldExit: false };
  }

  const llmResult = await analyzeExit(position, indicators, klines);

  if (llmResult.action === 'EXIT' && llmResult.confidence >= config.llmExitConfidenceThreshold) {
    return {
      shouldExit: true,
      reason: `LLM exit (${llmResult.confidence}%): ${llmResult.reason}`,
    };
  }

  return { shouldExit: false };
}

// =============================================================================
// POSITION SYNC
// =============================================================================

/**
 * Sync local positions with exchange
 * Now also imports external positions so they get managed (SL/TP)
 */
export async function syncPositions(
  client: AsterClient,
  localPositions: Map<string, Position>,
  agentId: string,
  config?: ScalperConfig
): Promise<{ synced: string[]; closed: string[]; opened: string[]; imported: string[] }> {
  const synced: string[] = [];
  const closed: string[] = [];
  const opened: string[] = [];
  const imported: string[] = [];

  try {
    const exchangePositions = await client.getPositions();
    positionLogger.debug({ count: exchangePositions.length }, 'Fetched positions from exchange');
    const exchangeSymbols = new Set(exchangePositions.map((p: any) => p.symbol));
    const localSymbols = new Set(localPositions.keys());

    // Check for positions closed externally
    for (const symbol of localSymbols) {
      if (!exchangeSymbols.has(symbol)) {
        positionLogger.info({ symbol, agentId }, 'Position closed externally');
        closed.push(symbol);
        localPositions.delete(symbol);
      } else {
        synced.push(symbol);
      }
    }

    // Import external positions so they get managed (SL/TP applied)
    for (const exchPos of exchangePositions) {
      if (!localSymbols.has(exchPos.symbol)) {
        opened.push(exchPos.symbol);

        // Import this position so it gets managed!
        const positionAmt = parseFloat(exchPos.positionAmt);
        const entryPrice = parseFloat(exchPos.entryPrice);
        const leverage = parseFloat(exchPos.leverage) || 10;
        const size = Math.abs(positionAmt);
        const marginUsed = (size * entryPrice) / leverage;

        const importedPosition: Position = {
          id: `imported-${exchPos.symbol}-${Date.now()}`,
          symbol: exchPos.symbol,
          side: positionAmt > 0 ? 'long' : 'short',
          size,
          originalSize: size,
          entryPrice,
          currentPrice: entryPrice,
          leverage,
          marginUsed,
          unrealizedPnl: parseFloat(exchPos.unrealizedProfit) || 0,
          unrealizedROE: 0,
          highestROE: 0,
          lowestROE: 0,
          openedAt: Date.now(),
          updatedAt: Date.now(),
          agentId,
          isExternal: true, // Flag to know this wasn't opened by scalper
        };

        // Calculate current ROE
        if (marginUsed > 0) {
          importedPosition.unrealizedROE = (importedPosition.unrealizedPnl / marginUsed) * 100;
          importedPosition.highestROE = importedPosition.unrealizedROE;
          importedPosition.lowestROE = importedPosition.unrealizedROE;
        }

        localPositions.set(exchPos.symbol, importedPosition);
        imported.push(exchPos.symbol);

        positionLogger.info(
          {
            symbol: exchPos.symbol,
            side: importedPosition.side,
            size: importedPosition.size,
            entryPrice: importedPosition.entryPrice,
            roe: importedPosition.unrealizedROE.toFixed(2),
            agentId
          },
          'External position IMPORTED for management'
        );
      }
    }
  } catch (error: any) {
    positionLogger.warn({ error: error.message }, 'Position sync failed');
  }

  return { synced, closed, opened, imported };
}

// =============================================================================
// RISK MANAGEMENT
// =============================================================================

export interface RiskCheck {
  canTrade: boolean;
  reason?: string;
}

/**
 * Check daily loss limits
 */
export function checkDailyLimits(state: AgentState, config: ScalperConfig): RiskCheck {
  // Check daily loss limit
  const dailyLossPercent =
    ((state.dailyStartEquity - state.equity) / state.dailyStartEquity) * 100;

  if (dailyLossPercent >= config.maxDailyLossPercent) {
    return {
      canTrade: false,
      reason: `Daily loss limit: ${dailyLossPercent.toFixed(2)}% >= ${config.maxDailyLossPercent}%`,
    };
  }

  // Check drawdown
  const drawdownPercent = state.startingEquity > 0
    ? ((state.startingEquity - state.equity) / state.startingEquity) * 100
    : 0;

  if (drawdownPercent >= config.maxDrawdownPercent) {
    return {
      canTrade: false,
      reason: `Max drawdown: ${drawdownPercent.toFixed(2)}% >= ${config.maxDrawdownPercent}%`,
    };
  }

  // Check daily profit target (if set)
  if (config.dailyProfitTargetPercent > 0) {
    const dailyProfitPercent =
      ((state.equity - state.dailyStartEquity) / state.dailyStartEquity) * 100;

    if (dailyProfitPercent >= config.dailyProfitTargetPercent) {
      return {
        canTrade: false,
        reason: `Daily profit target: ${dailyProfitPercent.toFixed(2)}% >= ${config.dailyProfitTargetPercent}%`,
      };
    }
  }

  return { canTrade: true };
}

/**
 * Reset daily stats at start of new day
 */
export function checkDailyReset(state: AgentState): boolean {
  const lastTradeDate = new Date(state.lastTradeTime).toDateString();
  const currentDate = new Date().toDateString();

  if (lastTradeDate !== currentDate) {
    state.dailyStartEquity = state.equity;
    state.dailyPnL = 0;
    state.lastTradeTime = Date.now();
    positionLogger.info({ equity: state.equity }, 'Daily stats reset');
    return true;
  }

  return false;
}

// =============================================================================
// POSITION MONITORING LOOP
// =============================================================================

export interface MonitorResult {
  position: Position;
  action: string;
  closed: boolean;
  closeResult?: ClosePositionResult;
}

/**
 * Monitor all positions and handle exits
 */
export async function monitorPositions(
  client: AsterClient,
  positions: Map<string, Position>,
  config: ScalperConfig,
  agentId: string,
  userId: string,
  state?: AgentState // Optional state for updating stats
): Promise<MonitorResult[]> {
  // CRITICAL: Check positions more frequently for stop loss
  // If we have positions, prioritize monitoring them
  if (positions.size === 0) {
    return [];
  }
  const results: MonitorResult[] = [];

  for (const [symbol, position] of positions) {
    try {
      // Get current price
      const currentPrice = await client.getPrice(symbol);

      // Update position
      const updateResult = updatePosition(position, currentPrice, config);

      // Log position status
      logPosition(agentId, {
        symbol,
        side: position.side,
        roe: position.unrealizedROE,
        pnl: position.unrealizedPnl,
        peakROE: position.highestROE,
      });

      // Handle exit conditions
      if (updateResult.action !== 'hold') {
        // Handle partial profit taking
        if (updateResult.action === 'close_partial' && config.partialProfitEnabled && position.originalSize) {
          const partialPercent = config.partialProfitPercent || 50;
          const partialSize = (position.size * partialPercent) / 100;
          const roundedPartialSize = client.roundQuantity(symbol, partialSize);
          
          // Only partial close if we can round to a valid quantity
          if (roundedPartialSize >= client.getMinQtyAndPrecision(symbol).min) {
            const closeSide = position.side === 'long' ? 'SELL' : 'BUY';
            const orderResult = await client.placeMarketOrder(symbol, closeSide, roundedPartialSize, true);
            
            if (orderResult.success && orderResult.filledPrice) {
              // Calculate partial PnL
              const partialPnl = position.side === 'long'
                ? (orderResult.filledPrice - position.entryPrice) * roundedPartialSize
                : (position.entryPrice - orderResult.filledPrice) * roundedPartialSize;
              
              // Update position size
              position.size -= roundedPartialSize;
              position.marginUsed = (position.size * position.currentPrice) / position.leverage;
              position.partialProfitTaken = true;
              
              // Update stats if state provided
              if (state) {
                state.dailyPnL += partialPnl;
                state.totalPnL += partialPnl;
              }
              
              positionLogger.info({
                symbol,
                partialSize: roundedPartialSize,
                partialPnl,
                remainingSize: position.size,
                reason: updateResult.reason,
              }, 'Partial profit taken');
              
              results.push({
                position,
                action: 'close_partial',
                closed: false, // Position still open
                closeResult: {
                  success: true,
                  realizedPnl: partialPnl,
                },
              });
              continue; // Don't close full position
            }
          }
        }
        
        // Full close
        const closeResult = await closePosition({
          client,
          position,
          reason: updateResult.reason || updateResult.action,
          agentId,
          userId,
          config, // Pass config for paper trading
        });

        if (closeResult.success) {
          positions.delete(symbol);
        }

        results.push({
          position,
          action: updateResult.action,
          closed: closeResult.success,
          closeResult,
        });
      } else {
        // Check LLM exit if enabled
        if (config.llmExitAnalysisEnabled) {
          const klines = await client.getKlines(symbol, config.klineInterval, config.klineCount);
          const parsedKlines = parseKlines(klines);
          const indicators = calculateAllIndicators(parsedKlines, config);

          if (indicators) {
            const llmExit = await checkLLMExit(position, indicators, parsedKlines, config);

            if (llmExit.shouldExit) {
              const closeResult = await closePosition({
                client,
                position,
                reason: llmExit.reason || 'LLM exit signal',
                agentId,
                userId,
                config, // Pass config for paper trading
              });

              if (closeResult.success) {
                positions.delete(symbol);
              }

              results.push({
                position,
                action: 'close_llm',
                closed: closeResult.success,
                closeResult,
              });
              continue;
            }
          }
        }

        results.push({
          position,
          action: 'hold',
          closed: false,
        });
      }
    } catch (error: any) {
      positionLogger.error({ symbol, error: error.message }, 'Position monitoring error');
      results.push({
        position,
        action: 'error',
        closed: false,
      });
    }
  }

  return results;
}

export default {
  updatePosition,
  checkLLMExit,
  syncPositions,
  checkDailyLimits,
  checkDailyReset,
  monitorPositions,
};
