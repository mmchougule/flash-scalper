/**
 * Configuration Management
 * Loads and validates environment variables
 */

import * as dotenv from 'dotenv';
import { z } from 'zod';
import type { ScalperConfig, CoinConfig } from '../types';

// Load .env file
dotenv.config();

// =============================================================================
// ENVIRONMENT SCHEMA VALIDATION
// =============================================================================

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  API_PREFIX: z.string().default('/api/v1'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().default('change-this-in-production'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Exchange
  ASTER_API_KEY: z.string().optional(),
  ASTER_SECRET_KEY: z.string().optional(),
  ASTER_BASE_URL: z.string().default('https://fapi.asterdex.com'),

  // Paradex Exchange
  PARADEX_API_KEY: z.string().optional(),
  PARADEX_PRIVATE_KEY: z.string().optional(),
  PARADEX_ACCOUNT_ADDRESS: z.string().optional(),
  PARADEX_JWT: z.string().optional(),
  PARADEX_REST_URL: z.string().default('https://api.testnet.paradex.trade/v1'),
  PARADEX_WS_URL: z.string().default('wss://ws.api.testnet.paradex.trade/v1'),
  PARADEX_MARKETS: z.string().default('BTC-USD-PERP,ETH-USD-PERP'),

  // LLM
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('deepseek/deepseek-chat-v3-0324'),
  LLM_ENABLED: z.string().default('true'),
  LLM_TIMEOUT_MS: z.string().default('10000'),
  // LLM Retry Configuration
  LLM_RETRY_MAX_RETRIES: z.string().default('3'),
  LLM_RETRY_INITIAL_DELAY_MS: z.string().default('100'),
  LLM_RETRY_MAX_DELAY_MS: z.string().default('5000'),
  LLM_RETRY_BACKOFF_MULTIPLIER: z.string().default('2'),
  LLM_RETRY_JITTER: z.string().default('true'),
  // LLM Circuit Breaker Configuration
  LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.string().default('5'),
  LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD: z.string().default('2'),
  LLM_CIRCUIT_BREAKER_TIMEOUT_MS: z.string().default('60000'),
  LLM_CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS: z.string().default('30000'),
  // LLM Rate Limit Configuration
  LLM_RATE_LIMIT_REQUESTS_PER_MINUTE: z.string().default('60'),
  LLM_RATE_LIMIT_BURST_SIZE: z.string().default('60'),

  // Worker
  WORKER_CONCURRENCY: z.string().default('10'),
  SIGNAL_WORKER_INTERVAL_MS: z.string().default('15000'),
  POSITION_CHECK_INTERVAL_MS: z.string().default('5000'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FILE: z.string().optional(),

  // Metrics
  METRICS_ENABLED: z.string().default('true'),
  METRICS_PORT: z.string().default('9090'),

  // Memory System
  MEMORY_ENABLED: z.string().default('true'),
  MEMORY_MAX_TRADES: z.string().default('1000'),
  MEMORY_PERSISTENCE_ENABLED: z.string().default('true'),
  MEMORY_PERSISTENCE_PATH: z.string().default('data/memory'),
  MEMORY_VERSION: z.string().default('1.0.0'),
});

// Parse and validate environment
const env = envSchema.parse(process.env);

// =============================================================================
// CONFIGURATION OBJECT
// =============================================================================

export const config = {
  // Environment
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  nodeEnv: env.NODE_ENV,

  // Server
  port: parseInt(env.PORT, 10),
  apiPrefix: env.API_PREFIX,

  // Redis
  redisUrl: env.REDIS_URL,

  // JWT
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,

  // Exchange
  aster: {
    apiKey: env.ASTER_API_KEY || '',
    secretKey: env.ASTER_SECRET_KEY || '',
    baseUrl: env.ASTER_BASE_URL,
  },

  // Paradex Exchange
  paradex: {
    apiKey: env.PARADEX_API_KEY || '',
    privateKey: env.PARADEX_PRIVATE_KEY || '',
    accountAddress: env.PARADEX_ACCOUNT_ADDRESS || '',
    jwt: env.PARADEX_JWT || '',
    restUrl: env.PARADEX_REST_URL,
    wsUrl: env.PARADEX_WS_URL,
    markets: env.PARADEX_MARKETS.split(',').map(m => m.trim()).filter(m => m.length > 0),
  },

  // LLM
  llm: {
    enabled: env.LLM_ENABLED === 'true',
    apiKey: env.OPENROUTER_API_KEY || '',
    model: env.OPENROUTER_MODEL,
    timeout: parseInt(env.LLM_TIMEOUT_MS, 10),
    // Retry configuration
    retry: {
      maxRetries: parseInt(env.LLM_RETRY_MAX_RETRIES || '3', 10),
      initialDelayMs: parseInt(env.LLM_RETRY_INITIAL_DELAY_MS || '100', 10),
      maxDelayMs: parseInt(env.LLM_RETRY_MAX_DELAY_MS || '5000', 10),
      backoffMultiplier: parseFloat(env.LLM_RETRY_BACKOFF_MULTIPLIER || '2'),
      jitter: env.LLM_RETRY_JITTER !== 'false',
    },
    // Circuit breaker configuration
    circuitBreaker: {
      failureThreshold: parseInt(env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
      successThreshold: parseInt(env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2', 10),
      timeoutMs: parseInt(env.LLM_CIRCUIT_BREAKER_TIMEOUT_MS || '60000', 10),
      halfOpenTimeoutMs: parseInt(env.LLM_CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS || '30000', 10),
    },
    // Rate limiting configuration
    rateLimit: {
      requestsPerMinute: parseInt(env.LLM_RATE_LIMIT_REQUESTS_PER_MINUTE || '60', 10),
      burstSize: parseInt(env.LLM_RATE_LIMIT_BURST_SIZE || '60', 10),
    },
  },

  // Worker
  worker: {
    concurrency: parseInt(env.WORKER_CONCURRENCY, 10),
    signalInterval: parseInt(env.SIGNAL_WORKER_INTERVAL_MS, 10),
    positionCheckInterval: parseInt(env.POSITION_CHECK_INTERVAL_MS, 10),
  },

  // Logging
  logLevel: env.LOG_LEVEL,
  logFile: env.LOG_FILE,

  // Metrics
  metrics: {
    enabled: env.METRICS_ENABLED === 'true',
    port: parseInt(env.METRICS_PORT, 10),
  },

  // Memory System
  memory: {
    enabled: env.MEMORY_ENABLED === 'true',
    maxTrades: parseInt(env.MEMORY_MAX_TRADES, 10),
    persistenceEnabled: env.MEMORY_PERSISTENCE_ENABLED === 'true',
    persistencePath: env.MEMORY_PERSISTENCE_PATH,
    version: env.MEMORY_VERSION,
  },
};

// =============================================================================
// DEFAULT SCALPER CONFIGURATION
// =============================================================================

function getEnvNumber(key: string, defaultVal: number): number {
  const val = process.env[key];
  return val ? parseFloat(val) : defaultVal;
}

function getEnvBoolean(key: string, defaultVal: boolean): boolean {
  const val = process.env[key];
  if (!val) return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

export function loadScalperConfig(): ScalperConfig {
  return {
    // Position Sizing
    leverage: getEnvNumber('SCALPER_LEVERAGE', 10),
    positionSizePercent: getEnvNumber('SCALPER_POSITION_SIZE_PERCENT', 35), // Larger for more aggressive gains
    positionSizeUSD: process.env.SCALPER_POSITION_SIZE_USD
      ? parseFloat(process.env.SCALPER_POSITION_SIZE_USD)
      : null,
    minPositionSizeUSD: getEnvNumber('SCALPER_MIN_POSITION_SIZE_USD', 10),
    maxPositionSizeUSD: getEnvNumber('SCALPER_MAX_POSITION_SIZE_USD', 150),
    maxExposurePercent: getEnvNumber('SCALPER_MAX_EXPOSURE_PERCENT', 80),
    maxPositions: getEnvNumber('SCALPER_MAX_POSITIONS', 20), // Increased from 4 - user request

    // Risk Management
    riskPerTradePercent: getEnvNumber('SCALPER_RISK_PER_TRADE_PERCENT', 2),
    maxDailyLossPercent: getEnvNumber('SCALPER_MAX_DAILY_LOSS_PERCENT', 10),
    maxDrawdownPercent: getEnvNumber('SCALPER_MAX_DRAWDOWN_PERCENT', 20),
    dailyProfitTargetPercent: getEnvNumber('SCALPER_DAILY_PROFIT_TARGET_PERCENT', 0),

    // Timing
    tickIntervalMs: getEnvNumber('SCALPER_TICK_INTERVAL_MS', 3000), // 3s for very fast stop loss checks (was 5s)
    scanIntervalTicks: getEnvNumber('SCALPER_SCAN_INTERVAL_TICKS', 2),
    scanDelayMs: getEnvNumber('SCALPER_SCAN_DELAY_MS', 200),
    maxHoldTimeMinutes: getEnvNumber('SCALPER_MAX_HOLD_TIME_MINUTES', 5), // 5min max - quick scalps only (was 10)
    statusLogInterval: getEnvNumber('SCALPER_STATUS_LOG_INTERVAL', 5),

    // Profit Targets - ULTRA SCALPING: Quick small wins, very tight stops
    takeProfitROE: getEnvNumber('SCALPER_TAKE_PROFIT_ROE', 1.5),      // 1.5% TP - let winners run (was 0.8%)
    takeProfitROEHigh: getEnvNumber('SCALPER_TAKE_PROFIT_ROE_HIGH', 2.5), // 2.5% for high-confidence (was 1.2%)
    stopLossROE: getEnvNumber('SCALPER_STOP_LOSS_ROE', -0.4),       // -0.4% SL - very tight to prevent big losses (was -1.0%)
    minProfitUSD: getEnvNumber('SCALPER_MIN_PROFIT_USD', 0.20),     // $0.20 minimum (lower for quick scalps)
    trailingActivationROE: getEnvNumber('SCALPER_TRAILING_ACTIVATION_ROE', 0.5),  // Activate at 0.5% (was 1%) - quick protection
    trailingDistanceROE: getEnvNumber('SCALPER_TRAILING_DISTANCE_ROE', 0.2),    // 0.2% distance (was 0.5%) - tight trailing
    
    // Advanced Exit Strategy
    partialProfitEnabled: getEnvBoolean('SCALPER_PARTIAL_PROFIT_ENABLED', true),
    partialProfitROE: getEnvNumber('SCALPER_PARTIAL_PROFIT_ROE', 1.0), // Take 50% profit at 1.0% (let rest run to 2.5%, was 0.6%)
    partialProfitPercent: getEnvNumber('SCALPER_PARTIAL_PROFIT_PERCENT', 50), // % to close at partial
    dynamicTPEnabled: getEnvBoolean('SCALPER_DYNAMIC_TP_ENABLED', true), // ATR-based TP
    atrTPMultiplier: getEnvNumber('SCALPER_ATR_TP_MULTIPLIER', 2.5), // Multiplier for ATR-based TP

    // Signal Requirements - STRICT FILTERING FOR BETTER WIN RATE
    // Note: minIvishXConfidence kept for compatibility but IVISHX integration not implemented
    minIvishXConfidence: getEnvNumber('SCALPER_MIN_IVISHX_CONFIDENCE', 5),
    minCombinedConfidence: getEnvNumber('SCALPER_MIN_COMBINED_CONFIDENCE', 58), // BALANCED: 58% - quality signals while allowing trades
    requireLLMAgreement: getEnvBoolean('SCALPER_REQUIRE_LLM_AGREEMENT', false),
    minConfidenceWithoutLLM: getEnvNumber('SCALPER_MIN_CONFIDENCE_WITHOUT_LLM', 50), // BALANCED: 50% - allows signals at 42-45%
    minScoreForSignal: getEnvNumber('SCALPER_MIN_SCORE', 45), // BALANCED: 45pts - allows stronger signals through
    
    // Dynamic Position Sizing
    dynamicPositionSizing: getEnvBoolean('SCALPER_DYNAMIC_POSITION_SIZING', true),
    maxPositionSizeBoost: getEnvNumber('SCALPER_MAX_POSITION_SIZE_BOOST', 1.5), // Up to 50% larger for high confidence
    minPositionSizeReduction: getEnvNumber('SCALPER_MIN_POSITION_SIZE_REDUCTION', 0.7), // Down to 70% for lower confidence
    
    // Performance-Based Adjustments
    performanceAdaptation: getEnvBoolean('SCALPER_PERFORMANCE_ADAPTATION', true),
    recentTradesWindow: getEnvNumber('SCALPER_RECENT_TRADES_WINDOW', 10), // Look at last N trades
    highWinRateThreshold: getEnvNumber('SCALPER_HIGH_WIN_RATE_THRESHOLD', 0.65), // 65%+ = increase aggression

    // Technical Filters - MATCHED TO WORKING QUANT-SCALPER
    rsiPeriod: getEnvNumber('SCALPER_RSI_PERIOD', 14),
    rsiOversold: getEnvNumber('SCALPER_RSI_OVERSOLD', 35),
    rsiOverbought: getEnvNumber('SCALPER_RSI_OVERBOUGHT', 65),
    momentumPeriod: getEnvNumber('SCALPER_MOMENTUM_PERIOD', 3),
    minMomentum: getEnvNumber('SCALPER_MIN_MOMENTUM', 0.001), // FIXED: Was 0.2, too strict - allow tiny momentum
    maxMomentum: getEnvNumber('SCALPER_MAX_MOMENTUM', 3.0),
    volumePeriod: getEnvNumber('SCALPER_VOLUME_PERIOD', 27),
    minVolumeRatio: getEnvNumber('SCALPER_MIN_VOLUME_RATIO', 0.5), // BALANCED: 50% of average - markets rarely sustain 80%
    trendSMAFast: getEnvNumber('SCALPER_TREND_SMA_FAST', 10),
    trendSMASlow: getEnvNumber('SCALPER_TREND_SMA_SLOW', 20),

    // Kline Settings
    klineInterval: process.env.SCALPER_KLINE_INTERVAL || '5m',
    klineCount: getEnvNumber('SCALPER_KLINE_COUNT', 60),
    
    // PHASE 3: Time-of-day filter
    timeOfDayFilter: getEnvBoolean('SCALPER_TIME_OF_DAY_FILTER', false), // Only trade 13-21 UTC (disabled by default for more signals)
    timeOfDayStartHourUTC: getEnvNumber('SCALPER_TIME_OF_DAY_START_HOUR_UTC', 13), // 1 PM UTC
    timeOfDayEndHourUTC: getEnvNumber('SCALPER_TIME_OF_DAY_END_HOUR_UTC', 21), // 9 PM UTC

    // LLM Configuration
    llmEnabled: getEnvBoolean('SCALPER_LLM_ENABLED', true),
    llmConfidenceBoost: getEnvNumber('SCALPER_LLM_CONFIDENCE_BOOST', 15),
    llmExitAnalysisEnabled: getEnvBoolean('SCALPER_LLM_EXIT_ANALYSIS_ENABLED', true),
    llmExitAnalysisMinutes: getEnvNumber('SCALPER_LLM_EXIT_ANALYSIS_MINUTES', 2),
    llmExitConfidenceThreshold: getEnvNumber('SCALPER_LLM_EXIT_CONFIDENCE_THRESHOLD', 80),

    // Bounce Detection
    bounceDetectionEnabled: getEnvBoolean('SCALPER_BOUNCE_ENABLED', true),
    bounceRSIThreshold: getEnvNumber('SCALPER_BOUNCE_RSI_THRESHOLD', 35),
    bounceStochThreshold: getEnvNumber('SCALPER_BOUNCE_STOCH_THRESHOLD', 25),
    bounceWilliamsThreshold: getEnvNumber('SCALPER_BOUNCE_WILLIAMS_THRESHOLD', -75),
    bounceMinGreenCandles: getEnvNumber('SCALPER_BOUNCE_MIN_GREEN_CANDLES', 2),
    bounceBonusPoints: getEnvNumber('SCALPER_BOUNCE_BONUS_POINTS', 20),
    
    // Paper Trading
    paperTradingEnabled: getEnvBoolean('SCALPER_PAPER_TRADING', true),
    paperTradingOnError: getEnvBoolean('SCALPER_PAPER_TRADING_ON_ERROR', true),
    
    // Advanced Signal Quality - BALANCED FOR MORE TRADES
    requireMultiIndicatorConfluence: getEnvBoolean('SCALPER_REQUIRE_MULTI_CONFLUENCE', false), // DISABLED: Allow trades with fewer indicators
    minIndicatorConfluence: getEnvNumber('SCALPER_MIN_INDICATOR_CONFLUENCE', 2), // REDUCED: 2 indicators (was 3) - more opportunities
    requireTrendAlignment: getEnvBoolean('SCALPER_REQUIRE_TREND_ALIGNMENT', false), // DISABLED: Allow counter-trend trades
    requireVolumeConfirmation: getEnvBoolean('SCALPER_REQUIRE_VOLUME_CONFIRMATION', false), // DISABLED: Don't require volume spikes
    minVolumeSpike: getEnvNumber('SCALPER_MIN_VOLUME_SPIKE', 0.2), // REDUCED: 20% (was 40%) - less strict
    marketRegimeFilter: getEnvBoolean('SCALPER_MARKET_REGIME_FILTER', false), // DISABLED: Allow trades in choppy markets
    minTrendStrength: getEnvNumber('SCALPER_MIN_TREND_STRENGTH', 0.2), // REDUCED: 0.2 (was 0.35) - allow weaker trends
    
  // Divergence Detection
  divergenceDetectionEnabled: getEnvBoolean('SCALPER_DIVERGENCE_ENABLED', true),
  divergenceBonusPoints: getEnvNumber('SCALPER_DIVERGENCE_BONUS', 25),
  };
}

// =============================================================================
// ARTIFACT COLLECTION CONFIGURATION
// =============================================================================

export interface ArtifactConfig {
  enabled: boolean;
  baseDir: string;
  version: string;
  logFile?: string;
  cloudStorage?: {
    provider: 'gcp';
    bucket: string;
    projectId: string;
    keyFile?: string;
    publicUrlBase: string;
  };
  runRotationEnabled?: boolean;
  runRotationIntervalHours?: number;
}

export interface StreamBrandingConfig {
  enabled: boolean;
  brandingText: string;
  footerText: string;
}

export function loadArtifactConfig(): ArtifactConfig {
  const enabled = getEnvBoolean('ARTIFACT_COLLECTION_ENABLED', false);
  const baseDir = process.env.ARTIFACT_BASE_DIR || './artifacts';
  const version = process.env.ARTIFACT_VERSION || '1.0.0';
  const logFile = process.env.ARTIFACT_LOG_FILE || '/tmp/scalper-live.log';
  
  // Time-based run rotation (optional)
  const runRotationEnabled = getEnvBoolean('ARTIFACT_RUN_ROTATION_ENABLED', false);
  const runRotationIntervalHours = getEnvNumber('ARTIFACT_RUN_ROTATION_INTERVAL_HOURS', 2);

  let cloudStorage: ArtifactConfig['cloudStorage'] | undefined;
  
  if (enabled && process.env.ARTIFACT_STORAGE_PROVIDER === 'gcp') {
    const bucket = process.env.GCP_STORAGE_BUCKET;
    const projectId = process.env.GCP_STORAGE_PROJECT_ID;
    const keyFile = process.env.GCP_STORAGE_KEY_FILE;
    const publicUrlBase = process.env.GCP_STORAGE_PUBLIC_URL_BASE;

    if (bucket && projectId && publicUrlBase) {
      cloudStorage = {
        provider: 'gcp',
        bucket,
        projectId,
        keyFile, // Optional - can use default credentials if not provided
        publicUrlBase,
      };
    }
  }

  return {
    enabled,
    baseDir,
    version,
    logFile: enabled ? logFile : undefined,
    cloudStorage,
    runRotationEnabled: enabled && runRotationEnabled,
    runRotationIntervalHours: runRotationEnabled ? runRotationIntervalHours : undefined,
  };
}

export function loadStreamBrandingConfig(): StreamBrandingConfig {
  return {
    enabled: getEnvBoolean('STREAM_BRANDING_ENABLED', false),
    brandingText: process.env.STREAM_BRANDING_TEXT || 'Powered by b402',
    footerText: process.env.STREAM_FOOTER_TEXT || 'Replay + logs in bio',
  };
}

// =============================================================================
// DEFAULT COIN LISTS
// =============================================================================

// High volume crypto tokens for scalping
export const DEFAULT_TRENDING_COINS: CoinConfig[] = [
  { symbol: 'SUIUSDT', ivishx: 'sui', boost: 1.2 },
  { symbol: 'TRXUSDT', ivishx: 'tron', boost: 1.1 },
  { symbol: 'LTCUSDT', ivishx: 'litecoin', boost: 1.0 },
  { symbol: 'AAVEUSDT', ivishx: 'aave', boost: 1.2 },
  { symbol: 'UNIUSDT', ivishx: 'uniswap', boost: 1.1 },
  { symbol: 'ASTERUSDT', ivishx: 'aster', boost: 1.3 },
];

// High volume bluechip crypto - best liquidity for scalping
export const DEFAULT_BLUECHIP_COINS: CoinConfig[] = [
  { symbol: 'BTCUSDT', ivishx: 'bitcoin', boost: 1.0 },      // Highest volume
  { symbol: 'ETHUSDT', ivishx: 'ethereum', boost: 1.0 },    // Highest volume
  { symbol: 'SOLUSDT', ivishx: 'solana', boost: 1.1 },       // High volume
  { symbol: 'XRPUSDT', ivishx: 'xrp', boost: 1.1 },         // High volume
  { symbol: 'DOGEUSDT', ivishx: 'dogecoin', boost: 1.2 },   // High volume
  { symbol: 'BNBUSDT', ivishx: 'bnb', boost: 1.0 },         // High volume
  { symbol: 'ADAUSDT', ivishx: 'cardano', boost: 1.1 },    // Good volume
  { symbol: 'AVAXUSDT', ivishx: 'avalanche', boost: 1.1 },  // Good volume
  { symbol: 'LINKUSDT', ivishx: 'chainlink', boost: 1.0 },  // Good volume
];

// Stock futures removed - not supported on Aster DEX
// export const DEFAULT_STOCK_FUTURES: CoinConfig[] = [];

export function loadCoinList(): CoinConfig[] {
  const envCoins = process.env.SCALPER_COINS;
  if (envCoins) {
    try {
      return envCoins.split(',').map((coin) => {
        const [symbol, ivishx, boost] = coin.trim().split(':');
        return {
          symbol: symbol.toUpperCase(),
          ivishx: ivishx.toLowerCase(),
          boost: parseFloat(boost || '1.0'),
        };
      });
    } catch {
      // Fall through to defaults
    }
  }
  return [...DEFAULT_TRENDING_COINS, ...DEFAULT_BLUECHIP_COINS];
}

export default config;
