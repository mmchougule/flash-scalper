/**
 * Structured Logging with Pino
 * Supports JSON logging for production, pretty print for development
 */

import pino from 'pino';
import { config } from '../config';

// Check if pretty printing is requested (via env var or development mode)
const usePretty = config.isDevelopment || process.env.LOG_PRETTY === 'true';

// Create child loggers for different services
const baseLogger = pino({
  level: config.logLevel || 'info',
  base: {
    service: 'flashscalper',
    version: '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(usePretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  }),
});

// Service-specific loggers
export const logger = baseLogger;
export const signalLogger = baseLogger.child({ module: 'signal' });
export const executionLogger = baseLogger.child({ module: 'execution' });
export const positionLogger = baseLogger.child({ module: 'position' });
export const workerLogger = baseLogger.child({ module: 'worker' });
export const apiLogger = baseLogger.child({ module: 'api' });

// Trade-specific logger with additional context
export function createTradeLogger(agentId: string, userId: string) {
  return baseLogger.child({
    module: 'trade',
    agentId,
    userId,
  });
}

// Helper for logging trades with consistent format
export interface TradeLogEntry {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'open' | 'close';
  quantity: number;
  price: number;
  pnl?: number;
  reason: string;
}

export function logTrade(agentId: string, userId: string, trade: TradeLogEntry) {
  const tradeLogger = createTradeLogger(agentId, userId);

  if (trade.type === 'open') {
    tradeLogger.info(
      {
        event: 'trade_open',
        ...trade,
      },
      `OPEN ${trade.side.toUpperCase()} ${trade.symbol} ${trade.quantity} @ $${trade.price}`
    );
  } else {
    tradeLogger.info(
      {
        event: 'trade_close',
        ...trade,
      },
      `CLOSE ${trade.symbol} ${trade.quantity} @ $${trade.price} | PnL: $${trade.pnl?.toFixed(2) || 0}`
    );
  }
}

// Signal detection logger
export interface SignalLogEntry {
  symbol: string;
  direction: string;
  confidence: number;
  score: number;
  reasons: string[];
}

export function logSignal(agentId: string, signal: SignalLogEntry) {
  signalLogger.info(
    {
      event: 'signal_detected',
      agentId,
      ...signal,
    },
    `SIGNAL: ${signal.symbol} ${signal.direction} | Score: ${signal.score}/100 | Confidence: ${signal.confidence}%`
  );
}

// Position update logger
export interface PositionLogEntry {
  symbol: string;
  side: string;
  roe: number;
  pnl: number;
  peakROE: number;
}

export function logPosition(agentId: string, position: PositionLogEntry) {
  positionLogger.debug(
    {
      event: 'position_update',
      agentId,
      ...position,
    },
    `${position.symbol}: ${position.side.toUpperCase()} | ROE: ${position.roe >= 0 ? '+' : ''}${position.roe.toFixed(2)}% | $${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} | Peak: ${position.peakROE.toFixed(2)}%`
  );
}

// Tick status logger
export interface TickLogEntry {
  tickCount: number;
  equity: number;
  exposure: number;
  maxExposure: number;
  positionCount: number;
  maxPositions: number;
  dailyPnL: number;
  drawdown: number;
  winRate: number;
}

export function logTick(agentId: string, tick: TickLogEntry) {
  logger.info(
    {
      event: 'tick',
      agentId,
      ...tick,
    },
    `Tick #${tick.tickCount} | Equity: $${tick.equity.toFixed(2)} | Exposure: $${tick.exposure.toFixed(2)}/$${tick.maxExposure.toFixed(0)} | Positions: ${tick.positionCount}/${tick.maxPositions} | Daily P&L: $${tick.dailyPnL >= 0 ? '+' : ''}${tick.dailyPnL.toFixed(2)} | Drawdown: ${tick.drawdown != null && !isNaN(tick.drawdown) ? tick.drawdown.toFixed(2) : '0.00'}% | Win: ${tick.winRate.toFixed(0)}%`
  );
}

export default logger;
