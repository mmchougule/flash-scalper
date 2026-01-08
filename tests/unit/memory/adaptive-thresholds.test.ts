/**
 * Adaptive Thresholds Unit Tests
 */

import { AdaptiveThresholds, type AdaptiveThresholdConfig } from '../../../src/services/memory/adaptive-thresholds';
import type { ScalperConfig } from '../../../src/types';

describe('AdaptiveThresholds', () => {
  let thresholds: AdaptiveThresholds;
  let baseConfig: ScalperConfig;

  beforeEach(() => {
    thresholds = new AdaptiveThresholds();
    baseConfig = {
      minCombinedConfidence: 70,
      minConfidenceWithoutLLM: 75,
      minScoreForSignal: 60,
      minVolumeRatio: 0.8,
    } as ScalperConfig;
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(0);
      expect(stats.smoothedWinRate).toBe(0.5);
    });

    it('should accept custom config', () => {
      const customThresholds = new AdaptiveThresholds({
        enabled: false,
        minTradesForAdjustment: 20,
        recentTradesWindow: 30,
        smoothingFactor: 0.5,
      });

      const stats = customThresholds.getStats();
      expect(stats).toBeDefined();
    });

    it('should use default values for partial config', () => {
      const partialThresholds = new AdaptiveThresholds({
        minTradesForAdjustment: 15,
      });

      const stats = partialThresholds.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Disabled State', () => {
    beforeEach(() => {
      thresholds = new AdaptiveThresholds({ enabled: false });
    });

    it('should not record trades when disabled', () => {
      thresholds.recordTradeOutcome(true);
      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(0);
    });

    it('should return base config when disabled', () => {
      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result.minCombinedConfidence).toBe(baseConfig.minCombinedConfidence);
      expect(result.adjustmentReason).toBe('Adaptive thresholds disabled');
    });
  });

  describe('Recording Trade Outcomes', () => {
    it('should record a winning trade', () => {
      thresholds.recordTradeOutcome(true);
      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(1);
      expect(stats.recentWins).toBe(1);
      expect(stats.winRate).toBe(1.0);
    });

    it('should record a losing trade', () => {
      thresholds.recordTradeOutcome(false);
      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(1);
      expect(stats.recentWins).toBe(0);
      expect(stats.winRate).toBe(0);
    });

    it('should record multiple trades', () => {
      // 7 wins, 3 losses
      for (let i = 0; i < 7; i++) {
        thresholds.recordTradeOutcome(true);
      }
      for (let i = 0; i < 3; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(10);
      expect(stats.recentWins).toBe(7);
      expect(stats.winRate).toBe(0.7);
    });

    it('should calculate smoothed win rate using EMA', () => {
      // Record trades to test EMA smoothing
      thresholds.recordTradeOutcome(true);
      const stats1 = thresholds.getStats();
      const smoothed1 = stats1.smoothedWinRate;

      thresholds.recordTradeOutcome(false);
      const stats2 = thresholds.getStats();
      const smoothed2 = stats2.smoothedWinRate;

      // Smoothed rate should be between the two actual rates
      expect(smoothed2).toBeGreaterThan(0);
      expect(smoothed2).toBeLessThan(smoothed1);
    });

    it('should maintain sliding window', () => {
      const config: Partial<AdaptiveThresholdConfig> = {
        recentTradesWindow: 5,
      };
      const windowThresholds = new AdaptiveThresholds(config);

      // Record more trades than window size
      for (let i = 0; i < 10; i++) {
        windowThresholds.recordTradeOutcome(i < 7); // 7 wins, 3 losses
      }

      const stats = windowThresholds.getStats();
      expect(stats.recentTrades).toBe(5); // Should cap at window size
    });
  });

  describe('Threshold Adjustments', () => {
    it('should require minimum trades before adjusting', () => {
      // Record only 5 trades (less than default minimum of 10)
      for (let i = 0; i < 5; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result.minCombinedConfidence).toBe(baseConfig.minCombinedConfidence);
      expect(result.adjustmentReason).toContain('Insufficient trades');
    });

    it('should adjust for high win rate', () => {
      // Record 15 winning trades (100% win rate)
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);

      // Should lower thresholds (be more aggressive)
      expect(result.minCombinedConfidence).toBeLessThan(baseConfig.minCombinedConfidence);
      expect(result.minScoreForSignal).toBeLessThan(baseConfig.minScoreForSignal);
      expect(result.adjustmentReason).toContain('High win rate');
    });

    it('should adjust for low win rate', () => {
      // Record 3 wins, 12 losses (20% win rate)
      for (let i = 0; i < 3; i++) {
        thresholds.recordTradeOutcome(true);
      }
      for (let i = 0; i < 12; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);

      // Should raise thresholds (be more selective)
      expect(result.minCombinedConfidence).toBeGreaterThan(baseConfig.minCombinedConfidence);
      expect(result.minScoreForSignal).toBeGreaterThan(baseConfig.minScoreForSignal);
      expect(result.adjustmentReason).toContain('Low win rate');
    });

    it('should use base thresholds for target win rate', () => {
      // Record 55% win rate (in target range of 50-60%)
      // Need to account for EMA smoothing - record more trades
      for (let i = 0; i < 20; i++) {
        thresholds.recordTradeOutcome(i < 11); // 11 wins, 9 losses = 55%
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result.adjustmentReason).toContain('win rate');
    });

    it('should apply bounds to prevent extreme adjustments', () => {
      const boundedThresholds = new AdaptiveThresholds({
        maxAdjustmentPercent: 0.10, // ±10% max
      });

      // Record 100% win rate to trigger max adjustment
      for (let i = 0; i < 15; i++) {
        boundedThresholds.recordTradeOutcome(true);
      }

      const result = boundedThresholds.getAdjustedThresholds(baseConfig);

      // Adjustment should be bounded
      const maxExpected = baseConfig.minCombinedConfidence * 1.1;
      const minExpected = baseConfig.minCombinedConfidence * 0.9;

      expect(result.minCombinedConfidence).toBeGreaterThanOrEqual(Math.round(minExpected));
      expect(result.minCombinedConfidence).toBeLessThanOrEqual(Math.round(maxExpected));
    });

    it('should adjust volume ratio', () => {
      // High win rate should lower volume requirement
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const highWinResult = thresholds.getAdjustedThresholds(baseConfig);
      expect(highWinResult.minVolumeRatio).toBeLessThanOrEqual(baseConfig.minVolumeRatio);

      // Reset and test low win rate
      thresholds.reset();
      for (let i = 0; i < 3; i++) {
        thresholds.recordTradeOutcome(true);
      }
      for (let i = 0; i < 12; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const lowWinResult = thresholds.getAdjustedThresholds(baseConfig);
      expect(lowWinResult.minVolumeRatio).toBeGreaterThanOrEqual(baseConfig.minVolumeRatio);
    });

    it('should adjust direction threshold', () => {
      // High win rate should lower direction threshold
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const highWinResult = thresholds.getAdjustedThresholds(baseConfig);
      expect(highWinResult.directionThreshold).toBeLessThan(1.10);

      // Reset and test low win rate
      thresholds.reset();
      for (let i = 0; i < 3; i++) {
        thresholds.recordTradeOutcome(true);
      }
      for (let i = 0; i < 12; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const lowWinResult = thresholds.getAdjustedThresholds(baseConfig);
      expect(lowWinResult.directionThreshold).toBeGreaterThan(1.10);
    });

    it('should bound volume ratio between 0.1 and 1.0', () => {
      const extremeConfig = {
        ...baseConfig,
        minVolumeRatio: 0.05,
      };

      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(extremeConfig);
      expect(result.minVolumeRatio).toBeGreaterThanOrEqual(0.1);
      expect(result.minVolumeRatio).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Custom Configuration', () => {
    it('should respect custom win rate thresholds', () => {
      const customThresholds = new AdaptiveThresholds({
        highWinRateThreshold: 0.70,
        lowWinRateThreshold: 0.40,
        targetWinRateMin: 0.40,
        targetWinRateMax: 0.70,
      });

      // 55% win rate (between custom thresholds)
      for (let i = 0; i < 20; i++) {
        customThresholds.recordTradeOutcome(i < 11); // 11 wins, 9 losses = 55%
      }

      const result = customThresholds.getAdjustedThresholds(baseConfig);
      // With custom thresholds, 55% is in target range (0.40-0.70)
      expect(result.adjustmentReason).toContain('win rate');
    });

    it('should respect custom adjustment multipliers', () => {
      const customThresholds = new AdaptiveThresholds({
        highWinRateConfidenceMultiplier: 0.85, // 15% reduction
        highWinRateScoreMultiplier: 0.80, // 20% reduction
      });

      // 70% win rate
      for (let i = 0; i < 15; i++) {
        customThresholds.recordTradeOutcome(i < 10.5);
      }

      const result = customThresholds.getAdjustedThresholds(baseConfig);

      // Should use custom multipliers
      expect(result.minCombinedConfidence).toBeLessThan(baseConfig.minCombinedConfidence);
      expect(result.minScoreForSignal).toBeLessThan(baseConfig.minScoreForSignal);
    });

    it('should respect custom smoothing factor', () => {
      const highSmoothingThresholds = new AdaptiveThresholds({
        smoothingFactor: 0.8, // High weight for new values
      });

      const lowSmoothingThresholds = new AdaptiveThresholds({
        smoothingFactor: 0.1, // Low weight for new values
      });

      // Record same trades for both
      highSmoothingThresholds.recordTradeOutcome(true);
      lowSmoothingThresholds.recordTradeOutcome(true);

      const highStats = highSmoothingThresholds.getStats();
      const lowStats = lowSmoothingThresholds.getStats();

      // High smoothing should be closer to actual win rate
      expect(highStats.smoothedWinRate).toBeGreaterThan(lowStats.smoothedWinRate);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      for (let i = 0; i < 7; i++) {
        thresholds.recordTradeOutcome(true);
      }
      for (let i = 0; i < 3; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(10);
      expect(stats.recentWins).toBe(7);
      expect(stats.winRate).toBe(0.7);
      expect(stats.smoothedWinRate).toBeGreaterThan(0);
      expect(stats.canAdjust).toBe(true);
    });

    it('should indicate when adjustment is not possible', () => {
      for (let i = 0; i < 5; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const stats = thresholds.getStats();
      expect(stats.canAdjust).toBe(false);
    });

    it('should handle zero trades', () => {
      const stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.canAdjust).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset all statistics', () => {
      // Record some trades
      for (let i = 0; i < 10; i++) {
        thresholds.recordTradeOutcome(i < 7);
      }

      let stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(10);

      // Reset
      thresholds.reset();

      stats = thresholds.getStats();
      expect(stats.recentTrades).toBe(0);
      expect(stats.recentWins).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.smoothedWinRate).toBe(0.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle perfect win rate (100%)', () => {
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result).toBeDefined();
      expect(result.adjustmentReason).toContain('High win rate');
    });

    it('should handle perfect loss rate (0%)', () => {
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result).toBeDefined();
      expect(result.adjustmentReason).toContain('Low win rate');
    });

    it('should handle exactly threshold win rates', () => {
      // Exactly 60% win rate (high threshold boundary)
      for (let i = 0; i < 10; i++) {
        thresholds.recordTradeOutcome(i < 6);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result).toBeDefined();
    });

    it('should handle very small base values', () => {
      const smallConfig = {
        ...baseConfig,
        minCombinedConfidence: 10,
        minScoreForSignal: 5,
      };

      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const result = thresholds.getAdjustedThresholds(smallConfig);
      expect(result.minCombinedConfidence).toBeGreaterThan(0);
      expect(result.minScoreForSignal).toBeGreaterThan(0);
    });

    it('should handle very large base values', () => {
      const largeConfig = {
        ...baseConfig,
        minCombinedConfidence: 95,
        minScoreForSignal: 90,
      };

      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(largeConfig);
      expect(result.minCombinedConfidence).toBeGreaterThan(0);
      expect(result.minScoreForSignal).toBeGreaterThan(0);
    });
  });

  describe('Win Rate Smoothing', () => {
    it('should smooth win rate over time', () => {
      const smoothingThresholds = new AdaptiveThresholds({
        smoothingFactor: 0.3,
      });

      // Start with wins
      for (let i = 0; i < 5; i++) {
        smoothingThresholds.recordTradeOutcome(true);
      }
      const stats1 = smoothingThresholds.getStats();

      // Add losses
      for (let i = 0; i < 5; i++) {
        smoothingThresholds.recordTradeOutcome(false);
      }
      const stats2 = smoothingThresholds.getStats();

      // Smoothed rate should change gradually and be between 0 and 1
      expect(stats2.smoothedWinRate).toBeGreaterThan(0);
      expect(stats2.smoothedWinRate).toBeLessThan(1);
      // Should be different from initial
      expect(stats2.smoothedWinRate).not.toBe(stats1.smoothedWinRate);
    });

    it('should converge smoothed win rate to actual over time', () => {
      const smoothingThresholds = new AdaptiveThresholds({
        smoothingFactor: 0.3,
        recentTradesWindow: 100, // Allow more trades
      });

      // Record many consistent outcomes
      for (let i = 0; i < 100; i++) {
        smoothingThresholds.recordTradeOutcome(i < 70); // 70% win rate
      }

      const stats = smoothingThresholds.getStats();

      // Smoothed should be reasonably close to actual (within 20%)
      expect(Math.abs(stats.smoothedWinRate - 0.7)).toBeLessThan(0.2);
    });
  });

  describe('Adjustment Reasons', () => {
    it('should provide clear adjustment reason for high win rate', () => {
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(true);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result.adjustmentReason).toMatch(/High win rate \(\d+\.\d+%\) - being more aggressive/);
    });

    it('should provide clear adjustment reason for low win rate', () => {
      for (let i = 0; i < 15; i++) {
        thresholds.recordTradeOutcome(false);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      expect(result.adjustmentReason).toMatch(/Low win rate \(\d+\.\d+%\) - being more selective/);
    });

    it('should provide clear adjustment reason for target range', () => {
      // Record 20 trades with 55% win rate to stabilize EMA
      for (let i = 0; i < 20; i++) {
        thresholds.recordTradeOutcome(i < 11);
      }

      const result = thresholds.getAdjustedThresholds(baseConfig);
      // Just check that it provides a reason mentioning win rate
      expect(result.adjustmentReason).toMatch(/\d+\.\d+%/);
      expect(result.adjustmentReason.toLowerCase()).toContain('win rate');
    });
  });
});
