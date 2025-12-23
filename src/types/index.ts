/**
 * FlashScalper - Type Definitions
 * Multi-tenant scalable trading platform
 */

// =============================================================================
// CORE TRADING TYPES
// =============================================================================

export type Side = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type PositionStatus = 'open' | 'closing' | 'closed';
export type AgentStatus = 'running' | 'paused' | 'stopped' | 'error';
export type TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';
export type SignalType = 'LONG' | 'SHORT' | 'WAIT' | 'NONE';

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface ScalperConfig {
  // Position Sizing
  leverage: number;
  positionSizePercent: number;
  positionSizeUSD: number | null;
  minPositionSizeUSD: number;
  maxPositionSizeUSD: number;
  maxExposurePercent: number;
  maxPositions: number;

  // Risk Management
  riskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxDrawdownPercent: number;
  dailyProfitTargetPercent: number;

  // Timing
  tickIntervalMs: number;
  scanIntervalTicks: number;
  scanDelayMs?: number;
  maxHoldTimeMinutes: number;
  statusLogInterval?: number;

  // Profit Targets
  takeProfitROE: number;
  takeProfitROEHigh?: number; // For high-confidence signals
  stopLossROE: number;
  minProfitUSD: number;
  trailingActivationROE: number;
  trailingDistanceROE: number;
  
  // Advanced Exit Strategy
  partialProfitEnabled?: boolean;
  partialProfitROE?: number;
  partialProfitPercent?: number;
  dynamicTPEnabled?: boolean;
  atrTPMultiplier?: number;

  // Signal Requirements
  minIvishXConfidence: number;
  minCombinedConfidence: number;
  requireLLMAgreement: boolean;
  minConfidenceWithoutLLM: number;
  minScoreForSignal: number;
  
  // Dynamic Position Sizing
  dynamicPositionSizing?: boolean;
  maxPositionSizeBoost?: number;
  minPositionSizeReduction?: number;
  
  // Performance-Based Adjustments
  performanceAdaptation?: boolean;
  recentTradesWindow?: number;
  highWinRateThreshold?: number;
  
  // Paper Trading
  paperTradingEnabled?: boolean;
  paperTradingOnError?: boolean;
  
  // Advanced Signal Quality (Quant)
  requireMultiIndicatorConfluence?: boolean;
  minIndicatorConfluence?: number;
  requireTrendAlignment?: boolean;
  requireVolumeConfirmation?: boolean;
  minVolumeSpike?: number;
  marketRegimeFilter?: boolean;
  minTrendStrength?: number;
  
  // Divergence Detection
  divergenceDetectionEnabled?: boolean;
  divergenceBonusPoints?: number;
  
  // PHASE 3: Time-of-day filter
  timeOfDayFilter?: boolean;
  timeOfDayStartHourUTC?: number;
  timeOfDayEndHourUTC?: number;

  // Technical Filters
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  momentumPeriod: number;
  minMomentum: number;
  maxMomentum: number;
  volumePeriod: number;
  minVolumeRatio: number;
  trendSMAFast: number;
  trendSMASlow: number;

  // Kline Settings
  klineInterval: string;
  klineCount: number;

  // LLM Configuration
  llmEnabled: boolean;
  llmConfidenceBoost: number;
  llmExitAnalysisEnabled: boolean;
  llmExitAnalysisMinutes: number;
  llmExitConfidenceThreshold: number;

  // Bounce Detection
  bounceDetectionEnabled: boolean;
  bounceRSIThreshold: number;
  bounceStochThreshold: number;
  bounceWilliamsThreshold: number;
  bounceMinGreenCandles: number;
  bounceBonusPoints: number;
}

export interface CoinConfig {
  symbol: string;
  ivishx: string; // Coin identifier (e.g., 'bitcoin', 'ethereum') - metadata only, IVISHX API not implemented
  boost: number; // Confidence boost multiplier for this coin
  paradexMarket?: string; // Paradex market name (e.g., 'ETH-USD-PERP')
}

// =============================================================================
// MARKET DATA TYPES
// =============================================================================

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  klines: Kline[];
  timestamp: number;
}

export interface TechnicalIndicators {
  // Basic
  price: number;
  rsi: number;
  momentum: number;
  volumeRatio: number;
  trend: TrendDirection;

  // EMAs
  ema9: number;
  ema21: number;
  ema50: number;

  // MACD
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdCrossUp: boolean;
  macdCrossDown: boolean;

  // Bollinger Bands
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPercentB: number;

  // Stochastic
  stochK: number;
  stochD: number;

  // Other
  roc: number;
  williamsR: number;
  atr: number;
  atrPercent: number;
  trendStrength?: number; // 0-1, market regime strength
  divergence?: {
    hasDivergence: boolean;
    type: 'bullish' | 'bearish' | null;
    strength: number;
    reason: string;
  };
}

export interface CandlePattern {
  pattern: string;
  bullish: boolean;
}

// =============================================================================
// SIGNAL TYPES
// =============================================================================

export interface Signal {
  id: string;
  symbol: string;
  type: SignalType;
  confidence: number;
  source: 'technical' | 'llm' | 'ivishx' | 'combined';
  reasons: string[];
  indicators: Partial<TechnicalIndicators>;
  timestamp: number;
  expiresAt: number;
  // PHASE 2: Support/resistance levels for limit order placement
  supportResistance?: {
    support: number;
    resistance: number;
    pivotPoint: number;
    r1: number;
    r2: number;
    s1: number;
    s2: number;
  };
}

export interface SignalAnalysis {
  symbol: string;
  direction: SignalType;
  ivishxConfidence: number;
  llmConfidence: number;
  combinedConfidence: number;
  technicalScore: number;
  rsi: number;
  momentum: number;
  volumeRatio: number;
  trend: TrendDirection;
  price: number;
  reasons: string[];
  candlePattern?: CandlePattern;
  bounceDetected: boolean;
  bounceStrength: number;
}

export interface LLMAnalysis {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'EXIT';
  confidence: number;
  reason: string;
  agrees: boolean;
}

// =============================================================================
// POSITION TYPES
// =============================================================================

export interface Position {
  id: string;
  agentId: string;
  userId?: string; // Optional for imported positions
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedROE: number;
  highestROE: number;
  lowestROE: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  trailingActivated?: boolean;
  trailingStopPrice?: number | null;
  ivishxConfidence?: number;
  llmConfidence?: number;
  entryReason?: string[];
  openedAt: number;
  updatedAt: number;
  maxHoldTime?: number;
  // Enhanced tracking
  originalSize?: number; // For partial profit tracking
  partialProfitTaken?: boolean; // Track if partial profit was taken
  dynamicTP?: number; // Dynamic take profit based on ATR/momentum
  isExternal?: boolean; // True if position was imported from exchange (not opened by scalper)
  // Smart exit management
  breakEvenActivated?: boolean; // True when position reached +4% ROE and stop moved to breakeven
  breakEvenStopPrice?: number; // Entry price - ensures no loss after reaching +4%
  // Memory system: Entry signal data for learning
  entryIndicators?: TechnicalIndicators; // Technical indicators at entry
  entrySignalConfidence?: number; // Signal confidence at entry
  entrySignalScore?: number; // Signal score at entry
  entrySignalReasons?: string[]; // Signal reasons at entry
  entryLLMAgreed?: boolean; // Whether LLM agreed with signal at entry
}

export interface PositionUpdate {
  positionId: string;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedROE: number;
  action: 'hold' | 'close' | 'update_trailing';
  reason?: string;
}

// =============================================================================
// TRADE TYPES
// =============================================================================

export interface Trade {
  id: string;
  positionId: string;
  agentId: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: 'open' | 'close' | 'partial_close';
  quantity: number;
  price: number;
  realizedPnl: number;
  fees: number;
  reason: string;
  executedAt: number;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  leverage?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  filledPrice?: number;
  filledQuantity?: number;
  fees?: number;
  error?: string;
}

// =============================================================================
// AGENT STATE TYPES
// =============================================================================

export interface AgentState {
  agentId: string;
  userId: string;
  status: AgentStatus;
  config: ScalperConfig;
  equity: number;
  startingEquity: number;
  dailyStartEquity: number;
  dailyPnL: number;
  totalPnL: number;
  positions: Map<string, Position> | Record<string, Position>;
  tickCount: number;
  lastScanTick: number;
  lastSyncTick: number;
  totalTrades: number;
  winningTrades: number;
  lastTradeTime: number;
  lastTickTime: number;
  error?: string;
}

export interface AgentStats {
  agentId: string;
  userId: string;
  equity: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  totalPnL: number;
  totalPnLPercent: number;
  drawdown: number;
  drawdownPercent: number;
  positionCount: number;
  maxPositions: number;
  exposure: number;
  maxExposure: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  tickCount: number;
  uptime: number;
  status: AgentStatus;
}

// =============================================================================
// JOB QUEUE TYPES
// =============================================================================

export type JobType =
  | 'signal_scan'
  | 'position_check'
  | 'execute_order'
  | 'close_position'
  | 'sync_positions'
  | 'llm_analysis';

export interface BaseJob {
  jobId: string;
  type: JobType;
  agentId: string;
  userId: string;
  priority: number;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
}

export interface SignalScanJob extends BaseJob {
  type: 'signal_scan';
  payload: {
    symbols: string[];
    config: ScalperConfig;
  };
}

export interface PositionCheckJob extends BaseJob {
  type: 'position_check';
  payload: {
    positionId: string;
    config: ScalperConfig;
  };
}

export interface ExecuteOrderJob extends BaseJob {
  type: 'execute_order';
  payload: {
    order: OrderRequest;
    signal: Signal;
    credentials: ExchangeCredentials;
  };
}

export interface ClosePositionJob extends BaseJob {
  type: 'close_position';
  payload: {
    positionId: string;
    reason: string;
    credentials: ExchangeCredentials;
  };
}

export type TradingJob =
  | SignalScanJob
  | PositionCheckJob
  | ExecuteOrderJob
  | ClosePositionJob;

// =============================================================================
// USER & AUTH TYPES
// =============================================================================

export interface User {
  id: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  subscription: 'free' | 'basic' | 'pro' | 'enterprise';
}

export interface ExchangeCredentials {
  id: string;
  userId: string;
  exchange: 'aster' | 'binance' | 'bybit' | 'paradex';
  apiKey: string;
  secretKey: string;
  bearerToken?: string; // For Paradex WebSocket authentication
  isActive: boolean;
}

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  strategyType: 'scalper' | 'grid' | 'momentum';
  isActive: boolean;
  settings: ScalperConfig;
  credentialsId: string;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// API TYPES
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================================================
// WEBSOCKET EVENT TYPES
// =============================================================================

export type WebSocketEventType =
  | 'agent_tick'
  | 'position_update'
  | 'trade_executed'
  | 'signal_detected'
  | 'agent_error'
  | 'agent_status';

export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  agentId: string;
  userId: string;
  payload: T;
  timestamp: number;
}

// =============================================================================
// LLM ERROR TYPES
// =============================================================================

export class LLMTimeoutError extends Error {
  constructor(message: string = 'LLM request timed out') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

export class LLMValidationError extends Error {
  constructor(message: string = 'LLM response validation failed', public readonly response?: any) {
    super(message);
    this.name = 'LLMValidationError';
  }
}

export class LLMRateLimitError extends Error {
  constructor(
    message: string = 'LLM rate limit exceeded',
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMServiceError extends Error {
  constructor(
    message: string = 'LLM service error',
    public readonly statusCode?: number,
    public readonly response?: any
  ) {
    super(message);
    this.name = 'LLMServiceError';
  }
}
