/**
 * Signal Scorer Unit Tests
 */

import {
  calculateSignalScore,
  validateSignal,
  SignalScore,
  ValidationResult,
} from '../../src/services/signal/signal-scorer';
import type { TechnicalIndicators, Kline, ScalperConfig } from '../../src/types';

// =============================================================================
// TEST DATA
// =============================================================================

const defaultConfig: ScalperConfig = {
  leverage: 10,
  positionSizePercent: 25,
  positionSizeUSD: null,
  minPositionSizeUSD: 10,
  maxPositionSizeUSD: 150,
  maxExposurePercent: 80,
  maxPositions: 4,
  riskPerTradePercent: 2,
  maxDailyLossPercent: 10,
  maxDrawdownPercent: 20,
  dailyProfitTargetPercent: 0,
  tickIntervalMs: 15000,
  scanIntervalTicks: 2,
  maxHoldTimeMinutes: 30,
  takeProfitROE: 10,
  stopLossROE: -3.5,
  minProfitUSD: 0.1,
  trailingActivationROE: 6,
  trailingDistanceROE: 2.5,
  minIvishXConfidence: 5,
  minCombinedConfidence: 55,
  requireLLMAgreement: false,
  minConfidenceWithoutLLM: 50,
  minScoreForSignal: 50,
  rsiPeriod: 14,
  rsiOversold: 35,
  rsiOverbought: 65,
  momentumPeriod: 3,
  minMomentum: 0.2,
  maxMomentum: 3.0,
  volumePeriod: 20,
  minVolumeRatio: 0.3,
  trendSMAFast: 10,
  trendSMASlow: 20,
  klineInterval: '5m',
  klineCount: 60,
  llmEnabled: false,
  llmConfidenceBoost: 15,
  llmExitAnalysisEnabled: false,
  llmExitAnalysisMinutes: 2,
  llmExitConfidenceThreshold: 80,
  bounceDetectionEnabled: true,
  bounceRSIThreshold: 35,
  bounceStochThreshold: 25,
  bounceWilliamsThreshold: -75,
  bounceMinGreenCandles: 2,
  bounceBonusPoints: 20,
};

// Strong bullish indicators
const bullishIndicators: TechnicalIndicators = {
  price: 105,
  rsi: 25, // Oversold
  momentum: 1.5,
  volumeRatio: 1.8, // Volume spike
  trend: 'DOWN', // Counter-trend long
  ema9: 103,
  ema21: 102,
  ema50: 101,
  macd: 0.5,
  macdSignal: 0.3,
  macdHistogram: 0.2,
  macdCrossUp: true, // Bullish cross
  macdCrossDown: false,
  bbUpper: 110,
  bbMiddle: 105,
  bbLower: 100,
  bbPercentB: 0.15, // Near lower band
  stochK: 15, // Oversold
  stochD: 20,
  roc: 2.5, // Positive ROC
  williamsR: -85, // Oversold
  atr: 2,
  atrPercent: 1.9,
};

// Strong bearish indicators
const bearishIndicators: TechnicalIndicators = {
  price: 95,
  rsi: 78, // Overbought
  momentum: -1.5,
  volumeRatio: 1.6,
  trend: 'UP', // Counter-trend short
  ema9: 97,
  ema21: 98,
  ema50: 99,
  macd: -0.5,
  macdSignal: -0.3,
  macdHistogram: -0.2,
  macdCrossUp: false,
  macdCrossDown: true, // Bearish cross
  bbUpper: 100,
  bbMiddle: 95,
  bbLower: 90,
  bbPercentB: 0.9, // Near upper band
  stochK: 88, // Overbought
  stochD: 85,
  roc: -2.8, // Negative ROC
  williamsR: -12, // Overbought
  atr: 2,
  atrPercent: 2.1,
};

// Neutral indicators
const neutralIndicators: TechnicalIndicators = {
  price: 100,
  rsi: 50,
  momentum: 0.1,
  volumeRatio: 1.0,
  trend: 'SIDEWAYS',
  ema9: 100,
  ema21: 100,
  ema50: 100,
  macd: 0,
  macdSignal: 0,
  macdHistogram: 0,
  macdCrossUp: false,
  macdCrossDown: false,
  bbUpper: 105,
  bbMiddle: 100,
  bbLower: 95,
  bbPercentB: 0.5,
  stochK: 50,
  stochD: 50,
  roc: 0.1,
  williamsR: -50,
  atr: 1.5,
  atrPercent: 1.5,
};

// Generate dummy klines
function generateKlines(count: number = 60): Kline[] {
  return Array.from({ length: count }, (_, i) => ({
    openTime: Date.now() - (count - i) * 300000,
    open: 100 + Math.random() * 2 - 1,
    high: 101 + Math.random(),
    low: 99 - Math.random(),
    close: 100 + Math.random() * 2 - 1,
    volume: 1000 + Math.random() * 500,
    closeTime: Date.now() - (count - i - 1) * 300000,
  }));
}

// =============================================================================
// SIGNAL SCORE TESTS
// =============================================================================

describe('Signal Scoring', () => {
  describe('calculateSignalScore', () => {
    test('should generate LONG signal for bullish indicators', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      expect(score.direction).toBe('LONG');
      expect(score.longScore).toBeGreaterThan(score.shortScore);
      expect(score.totalScore).toBeGreaterThan(0);
      expect(score.reasons.length).toBeGreaterThan(0);
    });

    test('should generate SHORT signal for bearish indicators', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bearishIndicators, klines, defaultConfig);

      expect(score.direction).toBe('SHORT');
      expect(score.shortScore).toBeGreaterThan(score.longScore);
      expect(score.totalScore).toBeGreaterThan(0);
    });

    test('should generate NONE for neutral indicators', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(neutralIndicators, klines, defaultConfig);

      // Should be NONE or WAIT when scores are low
      expect(['NONE', 'WAIT']).toContain(score.direction);
    });

    test('should include RSI oversold in reasons', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      const hasRSIReason = score.reasons.some(r => r.toLowerCase().includes('rsi') && r.toLowerCase().includes('oversold'));
      expect(hasRSIReason).toBe(true);
    });

    test('should include MACD cross in reasons', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      const hasMACDReason = score.reasons.some(r => r.toLowerCase().includes('macd'));
      expect(hasMACDReason).toBe(true);
    });

    // Note: Stochastic and Williams %R were removed from scoring as they were
    // redundant with RSI and causing conflicts. They're still used in bounce detection.

    test('should include volume spike in reasons', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      const hasVolumeReason = score.reasons.some(r => r.toLowerCase().includes('volume'));
      expect(hasVolumeReason).toBe(true);
    });

    test('should calculate confidence between 0 and 100', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(100);
    });
  });
});

// =============================================================================
// SIGNAL VALIDATION TESTS
// =============================================================================

describe('Signal Validation', () => {
  describe('validateSignal', () => {
    test('should validate signal with good indicators', () => {
      const klines = generateKlines();
      const score = calculateSignalScore(bullishIndicators, klines, defaultConfig);

      // Modify indicators to pass validation
      const validIndicators: TechnicalIndicators = {
        ...bullishIndicators,
        momentum: 0.5, // Within range
        volumeRatio: 0.5, // Above minimum
        trend: 'DOWN' as const, // Allow counter-trend with RSI oversold
      };

      const validation = validateSignal(score, validIndicators, defaultConfig);

      // Should be valid since RSI is oversold allowing counter-trend
      expect(validation.isValid).toBe(true);
    });

    test('should reject signal with low volume', () => {
      const klines = generateKlines();
      const lowVolumeIndicators: TechnicalIndicators = {
        ...bullishIndicators,
        volumeRatio: 0.1, // Below 0.3 threshold
      };

      const score = calculateSignalScore(lowVolumeIndicators, klines, defaultConfig);
      const validation = validateSignal(score, lowVolumeIndicators, defaultConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons.some(r => r.toLowerCase().includes('volume'))).toBe(true);
    });

    test('should reject signal with momentum too high (chasing)', () => {
      const klines = generateKlines();
      const highMomentumIndicators: TechnicalIndicators = {
        ...bullishIndicators,
        momentum: 5.0, // Above 3.0 threshold - chasing
        volumeRatio: 0.5, // Valid volume
      };

      const score = calculateSignalScore(highMomentumIndicators, klines, defaultConfig);
      const validation = validateSignal(score, highMomentumIndicators, defaultConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons.some(r => r.toLowerCase().includes('momentum'))).toBe(true);
    });

    test('should reject counter-trend SHORT in uptrend without overbought RSI', () => {
      const klines = generateKlines();
      const uptrend: TechnicalIndicators = {
        ...bearishIndicators,
        trend: 'UP',
        rsi: 55, // Not overbought (below 65)
        volumeRatio: 0.5,
        momentum: -0.5,
      };

      // Force a SHORT score
      const score: SignalScore = {
        direction: 'SHORT',
        longScore: 20,
        shortScore: 60,
        totalScore: 60,
        confidence: 40,
        reasons: ['MACD bearish cross'],
      };

      const configWithTrendAlignment = {
        ...defaultConfig,
        requireTrendAlignment: true,
      };

      const validation = validateSignal(score, uptrend, configWithTrendAlignment);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons.some(r => r.toLowerCase().includes('counter-trend'))).toBe(true);
    });

    test('should allow counter-trend LONG in downtrend with oversold RSI', () => {
      const klines = generateKlines();
      const downtrend: TechnicalIndicators = {
        ...bullishIndicators,
        trend: 'DOWN',
        rsi: 25, // Oversold (below 35)
        volumeRatio: 0.5,
        momentum: 0.5,
      };

      const score: SignalScore = {
        direction: 'LONG',
        longScore: 70,
        shortScore: 20,
        totalScore: 70,
        confidence: 50,
        reasons: ['RSI oversold'],
      };

      const validation = validateSignal(score, downtrend, defaultConfig);

      expect(validation.isValid).toBe(true);
    });

    test('should reject signal with score below minimum', () => {
      const klines = generateKlines();

      const score: SignalScore = {
        direction: 'LONG',
        longScore: 30, // Below minScoreForSignal (50)
        shortScore: 10,
        totalScore: 30,
        confidence: 20,
        reasons: [],
      };

      const validation = validateSignal(score, bullishIndicators, defaultConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons.some(r => r.toLowerCase().includes('score'))).toBe(true);
    });
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  test('should handle extreme RSI values', () => {
    const klines = generateKlines();
    const extremeRSI: TechnicalIndicators = {
      ...neutralIndicators,
      rsi: 5, // Extremely oversold
    };

    const score = calculateSignalScore(extremeRSI, klines, defaultConfig);
    expect(score.reasons.some(r => r.toLowerCase().includes('rsi'))).toBe(true);
  });

  // Note: Stochastic scoring was removed as it was redundant with RSI

  test('should handle zero volume ratio', () => {
    const klines = generateKlines();
    const zeroVolume: TechnicalIndicators = {
      ...bullishIndicators,
      volumeRatio: 0,
    };

    const score = calculateSignalScore(zeroVolume, klines, defaultConfig);
    const validation = validateSignal(score, zeroVolume, defaultConfig);

    expect(validation.isValid).toBe(false);
  });

  test('should handle all indicators at extreme bullish levels', () => {
    const klines = generateKlines();
    const allBullish: TechnicalIndicators = {
      price: 100,
      rsi: 10,
      momentum: 2.5,
      volumeRatio: 2.0,
      trend: 'UP',
      ema9: 99,
      ema21: 98,
      ema50: 97,
      macd: 1,
      macdSignal: 0.5,
      macdHistogram: 0.5,
      macdCrossUp: true,
      macdCrossDown: false,
      bbUpper: 105,
      bbMiddle: 100,
      bbLower: 95,
      bbPercentB: 0.1,
      stochK: 5,
      stochD: 8,
      roc: 5,
      williamsR: -95,
      atr: 2,
      atrPercent: 2,
    };

    const score = calculateSignalScore(allBullish, klines, defaultConfig);

    expect(score.direction).toBe('LONG');
    expect(score.longScore).toBeGreaterThan(50); // Adjusted since Stoch/Williams/ROC removed
    expect(score.reasons.length).toBeGreaterThan(3);
  });
});
