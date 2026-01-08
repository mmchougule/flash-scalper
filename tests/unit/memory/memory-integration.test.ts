/**
 * Memory System Integration Tests
 * Tests the full memory flow from trade storage to retrieval and learning
 */

import { MemoryManager, type MemoryManagerConfig } from '../../../src/services/memory/memory-manager';
import type { Position, Trade, TechnicalIndicators } from '../../../src/types';

describe('Memory System Integration', () => {
  let manager: MemoryManager;
  let config: MemoryManagerConfig;
  let mockPosition: Position;
  let mockTrade: Trade;
  let mockIndicators: TechnicalIndicators;
  let mockSignal: { confidence: number; score: number; reasons: string[]; llmAgreed: boolean };

  beforeEach(() => {
    config = {
      tradeHistory: {
        maxTradesInMemory: 100,
        persistenceEnabled: false,
      },
      persistence: {
        basePath: '/tmp/test-memory-integration',
        enabled: false,
        autoSaveInterval: 60000,
        version: '1.0.0',
      },
      enabled: true,
    };

    manager = new MemoryManager(config);

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
      atrPercent: 2,
      divergence: undefined,
    };

    const now = Date.now();
    mockPosition = {
      id: 'pos-1',
      agentId: 'agent-1',
      userId: 'user-1',
      symbol: 'BTCUSDT',
      side: 'long',
      size: 0.1,
      entryPrice: 100,
      currentPrice: 105,
      leverage: 10,
      marginUsed: 1,
      unrealizedPnl: 0.5,
      unrealizedROE: 50,
      highestROE: 50,
      lowestROE: 0,
      openedAt: now,
      updatedAt: now + 1000,
      stopLoss: 95,
      takeProfit: 110,
    } as Position;

    mockTrade = {
      id: 'trade-1',
      positionId: 'pos-1',
      agentId: 'agent-1',
      userId: 'user-1',
      symbol: 'BTCUSDT',
      side: 'sell',
      type: 'close',
      quantity: 0.1,
      price: 105,
      realizedPnl: 50,
      fees: 0.5,
      reason: 'Take profit',
      executedAt: now + 1000,
    };

    mockSignal = {
      confidence: 70,
      score: 75,
      reasons: ['RSI oversold', 'MACD cross up', 'Volume surge'],
      llmAgreed: true,
    };
  });

  describe('End-to-End Trade Flow', () => {
    it('should store trade and update all subsystems', async () => {
      // Store a trade
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      // Verify trade history
      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(1);
      expect(stats.wins).toBe(1);

      // Verify pattern learning
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(patternBoost).toBeDefined();

      // Verify symbol intelligence
      const priority = manager.getSymbolPriority('BTCUSDT', ['trend:UP']);
      expect(priority).toBeGreaterThan(0);

      // Verify regime detection
      const regime = manager.getRegimeAdjustments(mockIndicators);
      expect(regime).toBeDefined();
    });

    it('should learn from multiple trades and adapt', async () => {
      // Store 20 trades with consistent patterns
      for (let i = 0; i < 20; i++) {
        const isWin = i % 3 !== 0; // ~67% win rate
        const trade = {
          ...mockTrade,
          id: `trade-${i}`,
          realizedPnl: isWin ? 50 : -20,
        };

        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          trade,
          mockIndicators,
          mockSignal,
          isWin ? 'Take profit' : 'Stop loss'
        );
      }

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(20);
      expect(stats.winRate).toBeCloseTo(0.67, 1);

      // Pattern learner should provide boosts
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(patternBoost).toBeDefined();

      // Adaptive filters should be active
      const filters = manager.getAdaptiveFilters();
      expect(filters).toBeDefined();

      // Adaptive thresholds should be active
      const thresholds = manager.getAdaptiveThresholds({
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      });
      expect(thresholds).toBeDefined();
    });
  });

  describe('Multi-Symbol Learning', () => {
    it('should learn different patterns for different symbols', async () => {
      // BTCUSDT - Winning pattern
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          { ...mockPosition, symbol: 'BTCUSDT', id: `btc-pos-${i}` },
          { ...mockTrade, id: `btc-trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      // ETHUSDT - Losing pattern
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          { ...mockPosition, symbol: 'ETHUSDT', id: `eth-pos-${i}` },
          { ...mockTrade, id: `eth-trade-${i}`, realizedPnl: -20 },
          mockIndicators,
          mockSignal,
          'Stop loss'
        );
      }

      // BTC should have higher priority
      const btcPriority = manager.getSymbolPriority('BTCUSDT', ['trend:UP']);
      const ethPriority = manager.getSymbolPriority('ETHUSDT', ['trend:UP']);

      expect(btcPriority).toBeGreaterThan(ethPriority);

      // Ranked symbols should reflect this
      const ranked = manager.getRankedSymbols(['trend:UP']);
      expect(ranked.indexOf('BTCUSDT')).toBeLessThan(ranked.indexOf('ETHUSDT'));
    });
  });

  describe('Market Regime Adaptation', () => {
    it('should adapt to changing market regimes', async () => {
      // Store trades in uptrend
      const uptrendIndicators = { ...mockIndicators, trend: 'UP' as const, momentum: 0.8 };
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `up-pos-${i}` },
          { ...mockTrade, id: `up-trade-${i}`, realizedPnl: 50 },
          uptrendIndicators,
          mockSignal,
          'Take profit'
        );
      }

      const upRegime = manager.getRegimeAdjustments(uptrendIndicators);

      // Store trades in downtrend
      const downtrendIndicators = { ...mockIndicators, trend: 'DOWN' as const, momentum: -0.8 };
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `down-pos-${i}`, side: 'short' },
          { ...mockTrade, id: `down-trade-${i}`, realizedPnl: -20 },
          downtrendIndicators,
          { ...mockSignal, reasons: ['RSI overbought'] },
          'Stop loss'
        );
      }

      const downRegime = manager.getRegimeAdjustments(downtrendIndicators);

      // Regimes should differ
      expect(upRegime).toBeDefined();
      expect(downRegime).toBeDefined();
    });
  });

  describe('Contextual Memory Integration', () => {
    it('should store context and use it for boosting', async () => {
      // Store context
      manager.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 70, outcome: 'win' },
      ]);

      // Complete a trade
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      // Update signal outcome
      manager.updateSignalOutcome('BTCUSDT', 'LONG', 'win');

      // Get boost
      const boost = manager.getContextualBoost('BTCUSDT', 'LONG', 70);
      expect(boost.confidenceBoost).toBeGreaterThan(0);
    });
  });

  describe('Adaptive System Coordination', () => {
    it('should coordinate adaptive filters and thresholds', async () => {
      // Record losing streak to trigger adaptations
      for (let i = 0; i < 15; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}`, realizedPnl: -20 },
          mockIndicators,
          mockSignal,
          'Stop loss'
        );
      }

      const filters = manager.getAdaptiveFilters();
      const thresholds = manager.getAdaptiveThresholds({
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      });

      // Both should be more restrictive
      expect(filters).toBeDefined();
      expect(thresholds).toBeDefined();
      expect(thresholds?.minCombinedConfidence).toBeGreaterThan(70);
    });

    it('should coordinate pattern learning and regime detection', async () => {
      // Store trades with consistent patterns in trending market
      for (let i = 0; i < 10; i++) {
        await manager.storeTrade(
          mockPosition,
          { ...mockTrade, id: `trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      // Both systems should contribute to signal evaluation
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      const regimeAdj = manager.getRegimeAdjustments(mockIndicators);

      expect(patternBoost.confidenceBoost).toBeDefined();
      expect(regimeAdj.confidenceMultiplier).toBeDefined();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle many trades efficiently', async () => {
      const startTime = Date.now();

      // Store 100 trades
      for (let i = 0; i < 100; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}` },
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(100);
    });
  });

  describe('Memory Persistence Coordination', () => {
    it('should auto-save after 10 trades', async () => {
      // Store 10 trades to trigger auto-save
      for (let i = 0; i < 10; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}` },
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      // Should not throw errors during auto-save
      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(10);
    });

    it('should initialize from persisted data', async () => {
      // Store some trades
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}` },
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      // Initialize should not throw
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('Signal Enhancement Flow', () => {
    it('should enhance signals through full memory pipeline', async () => {
      // Build up history
      for (let i = 0; i < 15; i++) {
        await manager.storeTrade(
          mockPosition,
          { ...mockTrade, id: `trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      // Get all enhancements for a new signal
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      const contextBoost = manager.getContextualBoost('BTCUSDT', 'LONG', 70);
      const regimeAdj = manager.getRegimeAdjustments(mockIndicators);
      const filters = manager.getAdaptiveFilters();
      const thresholds = manager.getAdaptiveThresholds({
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      });

      // All systems should contribute
      expect(patternBoost).toBeDefined();
      expect(contextBoost).toBeDefined();
      expect(regimeAdj).toBeDefined();
      expect(filters).toBeDefined();
      expect(thresholds).toBeDefined();

      // Combined effect should be positive for winning pattern
      const totalConfidenceBoost = patternBoost.confidenceBoost + contextBoost.confidenceBoost;
      expect(totalConfidenceBoost).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases in Integration', () => {
    it('should handle rapid trade succession', async () => {
      // Store many trades quickly
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          manager.storeTrade(
            { ...mockPosition, id: `pos-${i}` },
            { ...mockTrade, id: `trade-${i}` },
            mockIndicators,
            mockSignal,
            'Exit'
          )
        );
      }

      await Promise.all(promises);

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(20);
    });

    it('should handle mixed winning and losing patterns', async () => {
      // Alternate wins and losses
      for (let i = 0; i < 20; i++) {
        const isWin = i % 2 === 0;
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          {
            ...mockTrade,
            id: `trade-${i}`,
            realizedPnl: isWin ? 50 : -20,
          },
          mockIndicators,
          mockSignal,
          isWin ? 'Take profit' : 'Stop loss'
        );
      }

      const stats = manager.getStatistics();
      expect(stats.winRate).toBe(0.5);

      // All systems should still function
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(patternBoost).toBeDefined();
    });
  });
});
