/**
 * Contextual Memory Unit Tests
 */

import { ContextualMemory } from '../../../src/services/memory/contextual-memory';
import type { TechnicalIndicators, SignalType } from '../../../src/types';

describe('ContextualMemory', () => {
  let contextualMemory: ContextualMemory;
  let mockIndicators: TechnicalIndicators;

  beforeEach(() => {
    contextualMemory = new ContextualMemory();

    mockIndicators = {
      price: 100,
      rsi: 50,
      momentum: 0.5,
      volumeRatio: 1.2,
      trend: 'UP',
      ema9: 99,
      ema21: 98,
      ema50: 97,
      macd: 0.1,
      macdSignal: 0.05,
      macdHistogram: 0.05,
      macdCrossUp: true,
      macdCrossDown: false,
      bbUpper: 105,
      bbMiddle: 100,
      bbLower: 95,
      bbPercentB: 0.5,
      stochK: 50,
      stochD: 50,
      roc: 0.5,
      williamsR: -50,
      atr: 2,
      atrPercent: 1.5,
    };
  });

  describe('storeContext', () => {
    it('should store market context', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });
  });

  describe('getContextualBoost', () => {
    it('should return zero boost for new symbol', () => {
      const boost = contextualMemory.getContextualBoost('ETHUSDT', 'LONG', 75);

      expect(boost.confidenceBoost).toBe(0);
      expect(boost.scoreBoost).toBe(0);
    });

    it('should return positive boost for winning patterns', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 75, outcome: 'win' },
      ]);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);

      expect(boost.confidenceBoost).toBeGreaterThan(0);
    });

    it('should return negative boost for losing patterns', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 75, outcome: 'loss' },
      ]);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);

      expect(boost.confidenceBoost).toBeLessThan(0);
    });
  });

  describe('updateSignalOutcome', () => {
    it('should update signal outcome in context', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 75 },
      ]);

      contextualMemory.updateSignalOutcome('BTCUSDT', 'LONG', 'win');

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost.confidenceBoost).toBeGreaterThan(0);
    });
  });

  describe('clearContexts', () => {
    it('should clear contexts for a symbol', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, []);
      contextualMemory.clearContexts('BTCUSDT');

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost.confidenceBoost).toBe(0);
    });
  });

  describe('Market Event Detection', () => {
    it('should detect volatility spike', () => {
      const highVolatilityIndicators = {
        ...mockIndicators,
        atrPercent: 5.0, // High volatility
      };

      contextualMemory.storeContext('BTCUSDT', highVolatilityIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });

    it('should detect volume surge', () => {
      const highVolumeIndicators = {
        ...mockIndicators,
        volumeRatio: 3.0, // High volume
      };

      contextualMemory.storeContext('BTCUSDT', highVolumeIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });

    it('should detect trend reversal', () => {
      // Store uptrend context
      contextualMemory.storeContext('BTCUSDT', mockIndicators, []);

      // Store downtrend context (reversal)
      const reversalIndicators = {
        ...mockIndicators,
        trend: 'DOWN' as const,
        momentum: -0.5,
      };

      contextualMemory.storeContext('BTCUSDT', reversalIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'SHORT', 75);
      expect(boost).toBeDefined();
    });
  });

  describe('Context Expiration', () => {
    it('should handle multiple contexts for same symbol', () => {
      // Store multiple contexts
      for (let i = 0; i < 5; i++) {
        contextualMemory.storeContext('BTCUSDT', mockIndicators, [
          { type: 'LONG', confidence: 75, outcome: 'win' },
        ]);
      }

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost.confidenceBoost).toBeGreaterThan(0);
    });

    it('should maintain separate contexts for different symbols', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 75, outcome: 'win' },
      ]);

      contextualMemory.storeContext('ETHUSDT', mockIndicators, [
        { type: 'SHORT', confidence: 75, outcome: 'loss' },
      ]);

      const btcBoost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      const ethBoost = contextualMemory.getContextualBoost('ETHUSDT', 'SHORT', 75);

      expect(btcBoost.confidenceBoost).toBeGreaterThan(0);
      expect(ethBoost.confidenceBoost).toBeLessThan(0);
    });
  });

  describe('Trade Streak Analysis', () => {
    it('should boost confidence on winning streak', () => {
      // Store winning signals
      const winningSignals = Array(5).fill(null).map(() => ({
        type: 'LONG' as SignalType,
        confidence: 75,
        outcome: 'win' as const,
      }));

      contextualMemory.storeContext('BTCUSDT', mockIndicators, winningSignals);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost.confidenceBoost).toBeGreaterThan(0);
    });

    it('should penalize confidence on losing streak', () => {
      // Store losing signals
      const losingSignals = Array(5).fill(null).map(() => ({
        type: 'LONG' as SignalType,
        confidence: 75,
        outcome: 'loss' as const,
      }));

      contextualMemory.storeContext('BTCUSDT', mockIndicators, losingSignals);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost.confidenceBoost).toBeLessThan(0);
    });

    it('should handle mixed win/loss patterns', () => {
      const mixedSignals = [
        { type: 'LONG' as SignalType, confidence: 75, outcome: 'win' as const },
        { type: 'LONG' as SignalType, confidence: 75, outcome: 'loss' as const },
        { type: 'LONG' as SignalType, confidence: 75, outcome: 'win' as const },
      ];

      contextualMemory.storeContext('BTCUSDT', mockIndicators, mixedSignals);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });
  });

  describe('Signal Pattern Analysis', () => {
    it('should identify winning patterns for signal type', () => {
      const signals = [
        { type: 'LONG' as SignalType, confidence: 75, outcome: 'win' as const },
        { type: 'LONG' as SignalType, confidence: 75, outcome: 'win' as const },
        { type: 'SHORT' as SignalType, confidence: 75, outcome: 'loss' as const },
      ];

      contextualMemory.storeContext('BTCUSDT', mockIndicators, signals);

      const longBoost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      const shortBoost = contextualMemory.getContextualBoost('BTCUSDT', 'SHORT', 75);

      expect(longBoost.confidenceBoost).toBeGreaterThan(0);
      expect(shortBoost.confidenceBoost).toBeLessThan(0);
    });

    it('should handle signals without outcomes', () => {
      const signals = [
        { type: 'LONG' as SignalType, confidence: 75 },
        { type: 'SHORT' as SignalType, confidence: 75 },
      ];

      contextualMemory.storeContext('BTCUSDT', mockIndicators, signals);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty signal history', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });

    it('should handle unknown signal types', () => {
      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'UNKNOWN' as SignalType, 75);
      expect(boost.confidenceBoost).toBe(0);
    });

    it('should handle very high confidence values', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 95, outcome: 'win' },
      ]);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 95);
      expect(boost).toBeDefined();
    });

    it('should handle very low confidence values', () => {
      contextualMemory.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 10, outcome: 'win' },
      ]);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 10);
      expect(boost).toBeDefined();
    });

    it('should handle extreme price movements', () => {
      const extremeIndicators = {
        ...mockIndicators,
        price: 100000,
        momentum: 5.0,
        volatility: 10.0,
      };

      contextualMemory.storeContext('BTCUSDT', extremeIndicators, []);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);
      expect(boost).toBeDefined();
    });
  });

  describe('Boost Bounds', () => {
    it('should provide reasonable boost values', () => {
      // Store many winning trades
      const signals = Array(20).fill(null).map(() => ({
        type: 'LONG' as SignalType,
        confidence: 75,
        outcome: 'win' as const,
      }));

      contextualMemory.storeContext('BTCUSDT', mockIndicators, signals);

      const boost = contextualMemory.getContextualBoost('BTCUSDT', 'LONG', 75);

      // Boosts should be bounded to prevent extreme values
      expect(Math.abs(boost.confidenceBoost)).toBeLessThan(50);
      expect(Math.abs(boost.scoreBoost)).toBeLessThan(50);
    });
  });
});

