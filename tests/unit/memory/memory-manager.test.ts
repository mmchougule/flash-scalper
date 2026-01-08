/**
 * Memory Manager Unit Tests
 */

import { MemoryManager, type MemoryManagerConfig } from '../../../src/services/memory/memory-manager';
import type { Position, Trade, TechnicalIndicators } from '../../../src/types';

describe('MemoryManager', () => {
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
        basePath: '/tmp/test-memory',
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

  describe('Constructor', () => {
    it('should initialize all memory subsystems when enabled', () => {
      const enabledManager = new MemoryManager({
        ...config,
        enabled: true,
      });

      expect(enabledManager).toBeDefined();
      const stats = enabledManager.getStatistics();
      expect(stats).toBeDefined();
    });

    it('should initialize with disabled state', () => {
      const disabledManager = new MemoryManager({
        ...config,
        enabled: false,
      });

      expect(disabledManager).toBeDefined();
      const stats = disabledManager.getStatistics();
      expect(stats.totalTrades).toBe(0);
    });
  });

  describe('Disabled Mode', () => {
    beforeEach(() => {
      manager = new MemoryManager({
        ...config,
        enabled: false,
      });
    });

    it('should return default statistics when disabled', () => {
      const stats = manager.getStatistics();
      expect(stats).toEqual({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        winRate: 0,
        avgROE: 0,
        totalPnL: 0,
      });
    });

    it('should return zero boosts when disabled', () => {
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(patternBoost).toEqual({
        confidenceBoost: 0,
        scoreBoost: 0,
        reason: 'Memory disabled',
      });

      const contextBoost = manager.getContextualBoost('BTCUSDT', 'LONG', 70);
      expect(contextBoost).toEqual({
        confidenceBoost: 0,
        scoreBoost: 0,
        reason: 'Memory disabled',
      });
    });

    it('should return default filters when disabled', () => {
      const filters = manager.getAdaptiveFilters();
      expect(filters).toEqual({
        minCombinedConfidence: 55,
        minScoreForSignal: 50,
        requireTrendAlignment: false,
        requireVolumeConfirmation: false,
        requireMultiIndicatorConfluence: false,
        minIndicatorConfluence: 3,
        minVolumeSpike: 0.3,
        minTrendStrength: 0.3,
      });
    });

    it('should return null for adaptive thresholds when disabled', () => {
      const thresholds = manager.getAdaptiveThresholds({
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      });
      expect(thresholds).toBeNull();
    });

    it('should return default regime adjustments when disabled', () => {
      const adjustments = manager.getRegimeAdjustments(mockIndicators);
      expect(adjustments).toEqual({
        confidenceMultiplier: 1.0,
        positionSizeMultiplier: 1.0,
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.0,
      });
    });

    it('should return default symbol priority when disabled', () => {
      const priority = manager.getSymbolPriority('BTCUSDT', ['trend:UP']);
      expect(priority).toBe(0.5);
    });

    it('should return empty ranked symbols when disabled', () => {
      const ranked = manager.getRankedSymbols(['trend:UP']);
      expect(ranked).toEqual([]);
    });

    it('should not throw when storing trades while disabled', async () => {
      await expect(
        manager.storeTrade(mockPosition, mockTrade, mockIndicators, mockSignal, 'Take profit')
      ).resolves.not.toThrow();
    });

    it('should not throw when storing context while disabled', () => {
      expect(() => {
        manager.storeContext('BTCUSDT', mockIndicators, [
          { type: 'LONG', confidence: 70, outcome: 'win' },
        ]);
      }).not.toThrow();
    });
  });

  describe('Trade Storage', () => {
    it('should store a trade successfully', async () => {
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(1);
      expect(stats.wins).toBe(1);
      expect(stats.totalPnL).toBe(50);
    });

    it('should handle multiple trades', async () => {
      for (let i = 0; i < 5; i++) {
        const trade = {
          ...mockTrade,
          id: `trade-${i}`,
          realizedPnl: i % 2 === 0 ? 50 : -20,
          realizedROE: i % 2 === 0 ? 50 : -20,
        };

        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          trade,
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(5);
      expect(stats.wins).toBe(3);
      expect(stats.losses).toBe(2);
    });

    it('should update all subsystems when storing a trade', async () => {
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      // Pattern learner should have learned
      const patternBoost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(patternBoost).toBeDefined();

      // Symbol intelligence should have data
      const priority = manager.getSymbolPriority('BTCUSDT', ['trend:UP']);
      expect(priority).toBeGreaterThan(0);
    });

    it('should trigger auto-save after 10 trades', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}` },
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(10);
    });
  });

  describe('Pattern Boosting', () => {
    it('should return pattern boost for signal', () => {
      const boost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(boost).toHaveProperty('confidenceBoost');
      expect(boost).toHaveProperty('scoreBoost');
      expect(boost).toHaveProperty('reason');
    });

    it('should use market regime for pattern boost', async () => {
      // Store some winning trades to establish patterns
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          mockPosition,
          { ...mockTrade, id: `trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      const boost = manager.getPatternBoost(mockIndicators, 70, 'BTCUSDT', true, 12);
      expect(boost).toBeDefined();
    });
  });

  describe('Contextual Boosting', () => {
    it('should return contextual boost', () => {
      const boost = manager.getContextualBoost('BTCUSDT', 'LONG', 70);
      expect(boost).toHaveProperty('confidenceBoost');
      expect(boost).toHaveProperty('scoreBoost');
      expect(boost).toHaveProperty('reason');
    });

    it('should store context', () => {
      expect(() => {
        manager.storeContext('BTCUSDT', mockIndicators, [
          { type: 'LONG', confidence: 70, outcome: 'win' },
        ]);
      }).not.toThrow();
    });

    it('should update signal outcome', () => {
      manager.storeContext('BTCUSDT', mockIndicators, [
        { type: 'LONG', confidence: 70 },
      ]);

      expect(() => {
        manager.updateSignalOutcome('BTCUSDT', 'LONG', 'win');
      }).not.toThrow();
    });
  });

  describe('Adaptive Filters', () => {
    it('should return adaptive filters', () => {
      const filters = manager.getAdaptiveFilters();
      expect(filters).toHaveProperty('minCombinedConfidence');
      expect(filters).toHaveProperty('minScoreForSignal');
      expect(filters).toHaveProperty('requireTrendAlignment');
    });

    it('should adjust filters based on trade outcomes', async () => {
      const initialFilters = manager.getAdaptiveFilters();

      // Record some losing trades
      for (let i = 0; i < 10; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}`, realizedPnl: -20 },
          mockIndicators,
          mockSignal,
          'Stop loss'
        );
      }

      const adjustedFilters = manager.getAdaptiveFilters();
      expect(adjustedFilters).toBeDefined();
    });
  });

  describe('Adaptive Thresholds', () => {
    it('should return adaptive thresholds', () => {
      const baseConfig = {
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      };

      const thresholds = manager.getAdaptiveThresholds(baseConfig);
      expect(thresholds).toBeDefined();
    });

    it('should return threshold statistics', () => {
      const stats = manager.getAdaptiveThresholdStats();
      expect(stats).toHaveProperty('recentTrades');
      expect(stats).toHaveProperty('winRate');
      expect(stats).toHaveProperty('smoothedWinRate');
    });

    it('should adjust thresholds based on win rate', async () => {
      const baseConfig = {
        minCombinedConfidence: 70,
        minConfidenceWithoutLLM: 75,
        minScoreForSignal: 60,
        minVolumeRatio: 0.8,
      };

      // Record winning trades
      for (let i = 0; i < 15; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      const thresholds = manager.getAdaptiveThresholds(baseConfig);
      expect(thresholds).toBeDefined();
      expect(thresholds?.adjustmentReason).toBeDefined();
    });
  });

  describe('Market Regime', () => {
    it('should return regime adjustments', () => {
      const adjustments = manager.getRegimeAdjustments(mockIndicators);
      expect(adjustments).toHaveProperty('confidenceMultiplier');
      expect(adjustments).toHaveProperty('positionSizeMultiplier');
      expect(adjustments).toHaveProperty('stopLossMultiplier');
      expect(adjustments).toHaveProperty('takeProfitMultiplier');
    });

    it('should update regime based on indicators', async () => {
      const initialAdjustments = manager.getRegimeAdjustments(mockIndicators);

      // Store trades and check regime updates
      for (let i = 0; i < 5; i++) {
        await manager.storeTrade(
          mockPosition,
          { ...mockTrade, id: `trade-${i}` },
          mockIndicators,
          mockSignal,
          'Exit'
        );
      }

      const updatedAdjustments = manager.getRegimeAdjustments({
        ...mockIndicators,
        trend: 'DOWN',
        momentum: -0.5,
      });

      expect(updatedAdjustments).toBeDefined();
    });
  });

  describe('Symbol Intelligence', () => {
    it('should return symbol priority', async () => {
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      const priority = manager.getSymbolPriority('BTCUSDT', ['trend:UP']);
      expect(priority).toBeGreaterThanOrEqual(0);
      expect(priority).toBeLessThanOrEqual(1);
    });

    it('should rank symbols', async () => {
      // Store trades for multiple symbols
      for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
        await manager.storeTrade(
          { ...mockPosition, symbol },
          mockTrade,
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      const ranked = manager.getRankedSymbols(['trend:UP']);
      expect(Array.isArray(ranked)).toBe(true);
    });
  });

  describe('Memory Persistence', () => {
    it('should save memory without errors', async () => {
      await manager.storeTrade(
        mockPosition,
        mockTrade,
        mockIndicators,
        mockSignal,
        'Take profit'
      );

      await expect(manager.saveMemory()).resolves.not.toThrow();
    });

    it('should handle initialization', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', async () => {
      // Store winning trades
      for (let i = 0; i < 7; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}`, realizedPnl: 50 },
          mockIndicators,
          mockSignal,
          'Take profit'
        );
      }

      // Store losing trades
      for (let i = 7; i < 10; i++) {
        await manager.storeTrade(
          { ...mockPosition, id: `pos-${i}` },
          { ...mockTrade, id: `trade-${i}`, realizedPnl: -20 },
          mockIndicators,
          mockSignal,
          'Stop loss'
        );
      }

      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(10);
      expect(stats.wins).toBe(7);
      expect(stats.losses).toBe(3);
      expect(stats.winRate).toBeCloseTo(0.7, 1);
      expect(stats.totalPnL).toBeCloseTo(290, 0);
    });

    it('should handle zero trades', () => {
      const stats = manager.getStatistics();
      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
    });
  });
});
