/**
 * Position Manager Unit Tests
 */

import {
  updatePosition,
  checkDailyLimits,
  checkDailyReset,
} from '../../src/services/position/position-manager';
import type { Position, AgentState, ScalperConfig } from '../../src/types';

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

function createTestPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'test-pos-1',
    agentId: 'test-agent',
    userId: 'test-user',
    symbol: 'BTCUSDT',
    side: 'long',
    size: 0.001,
    entryPrice: 100000,
    currentPrice: 100000,
    leverage: 10,
    marginUsed: 10, // $100 notional / 10x leverage = $10 margin
    unrealizedPnl: 0,
    unrealizedROE: 0,
    highestROE: 0,
    lowestROE: 0,
    stopLoss: null,
    takeProfit: null,
    trailingActivated: false,
    trailingStopPrice: null,
    ivishxConfidence: 7,
    llmConfidence: 65,
    entryReason: ['RSI oversold', 'MACD bullish cross'],
    openedAt: Date.now(),
    updatedAt: Date.now(),
    maxHoldTime: 30 * 60 * 1000, // 30 minutes
    ...overrides,
  };
}

function createTestAgentState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agentId: 'test-agent',
    userId: 'test-user',
    status: 'running',
    config: defaultConfig,
    equity: 1000,
    startingEquity: 1000,
    dailyStartEquity: 1000,
    dailyPnL: 0,
    totalPnL: 0,
    positions: new Map(),
    tickCount: 0,
    lastScanTick: 0,
    lastSyncTick: 0,
    totalTrades: 0,
    winningTrades: 0,
    lastTradeTime: Date.now(),
    lastTickTime: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// UPDATE POSITION TESTS
// =============================================================================

describe('Position Manager', () => {
  describe('updatePosition', () => {
    test('should calculate positive P&L for winning long', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10, // $100 / 10x = $10
      });

      const result = updatePosition(position, 110, defaultConfig); // 10% price increase

      expect(result.position.currentPrice).toBe(110);
      expect(result.position.unrealizedPnl).toBe(10); // (110-100) * 1 = $10
      expect(result.position.unrealizedROE).toBe(100); // $10 / $10 margin = 100%
      expect(result.action).toBe('close_tp'); // Should trigger take profit at 100% ROE
    });

    test('should calculate positive P&L for winning short', () => {
      const position = createTestPosition({
        side: 'short',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
      });

      const result = updatePosition(position, 90, defaultConfig); // 10% price decrease

      expect(result.position.unrealizedPnl).toBe(10); // (100-90) * 1 = $10
      expect(result.position.unrealizedROE).toBe(100);
    });

    test('should calculate negative P&L for losing long', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
      });

      const result = updatePosition(position, 95, defaultConfig); // 5% price decrease

      expect(result.position.unrealizedPnl).toBe(-5); // (95-100) * 1 = -$5
      expect(result.position.unrealizedROE).toBe(-50); // -$5 / $10 = -50%
    });

    test('should trigger stop loss when ROE reaches threshold', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
      });

      // Price drops 0.5% -> ROE = -5% (with 10x leverage)
      // Stop loss is -3.5%
      const result = updatePosition(position, 99.5, defaultConfig);

      // ROE = (99.5-100)/100 * 10 * 100 = -5%
      expect(result.position.unrealizedROE).toBe(-5);
      expect(result.action).toBe('close_sl');
      expect(result.reason).toContain('stop loss');
    });

    test('should trigger take profit when ROE reaches threshold', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
      });

      // Price increases 1.5% -> ROE = 15% (with 10x leverage)
      // Take profit is 10%
      const result = updatePosition(position, 101.5, defaultConfig);

      expect(result.position.unrealizedROE).toBe(15);
      expect(result.action).toBe('close_tp');
    });

    test('should activate trailing stop at threshold', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
        trailingActivated: false,
      });

      // Price increases 0.7% -> ROE = 7% (above 6% trailing activation)
      const result = updatePosition(position, 100.7, defaultConfig);

      expect(result.position.trailingActivated).toBe(true);
      expect(result.position.trailingStopPrice).toBeDefined();
      expect(result.action).toBe('hold');
    });

    test('should trigger trailing stop when price reverses', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
        trailingActivated: true,
        trailingStopPrice: 100.3, // Trailing stop at 100.3
        highestROE: 8,
      });

      // Price drops below trailing stop
      const result = updatePosition(position, 100.2, defaultConfig);

      expect(result.action).toBe('close_trailing');
    });

    test('should trigger max hold time exit', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
        openedAt: Date.now() - 31 * 60 * 1000, // 31 minutes ago
      });

      const result = updatePosition(position, 100.5, defaultConfig);

      expect(result.action).toBe('close_time');
      expect(result.reason).toContain('Max hold time');
    });

    test('should track highest ROE', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
        highestROE: 5,
      });

      // Price gives 8% ROE
      const result = updatePosition(position, 100.8, defaultConfig);

      expect(result.position.highestROE).toBeCloseTo(8, 1);
    });

    test('should track lowest ROE', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
        lowestROE: -1,
      });

      // Price gives -2% ROE
      const result = updatePosition(position, 99.8, defaultConfig);

      expect(result.position.lowestROE).toBeCloseTo(-2, 1);
    });

    test('should hold when no exit conditions met', () => {
      const position = createTestPosition({
        side: 'long',
        entryPrice: 100,
        size: 1,
        marginUsed: 10,
      });

      // Small price movement, no exit triggers
      const result = updatePosition(position, 100.2, defaultConfig);

      expect(result.action).toBe('hold');
    });
  });
});

// =============================================================================
// RISK MANAGEMENT TESTS
// =============================================================================

describe('Risk Management', () => {
  describe('checkDailyLimits', () => {
    test('should allow trading when within limits', () => {
      const state = createTestAgentState({
        equity: 950,
        dailyStartEquity: 1000,
        startingEquity: 1000,
      });

      const result = checkDailyLimits(state, defaultConfig);

      expect(result.canTrade).toBe(true);
    });

    test('should block trading when daily loss limit reached', () => {
      const state = createTestAgentState({
        equity: 890, // 11% loss
        dailyStartEquity: 1000,
        startingEquity: 1000,
      });

      const result = checkDailyLimits(state, defaultConfig);

      expect(result.canTrade).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    test('should block trading when max drawdown reached', () => {
      const state = createTestAgentState({
        equity: 790, // 21% drawdown
        dailyStartEquity: 800,
        startingEquity: 1000,
      });

      const result = checkDailyLimits(state, defaultConfig);

      expect(result.canTrade).toBe(false);
      expect(result.reason).toContain('Max drawdown');
    });

    test('should block trading when daily profit target reached', () => {
      const configWithTarget = {
        ...defaultConfig,
        dailyProfitTargetPercent: 5,
      };

      const state = createTestAgentState({
        equity: 1060, // 6% profit
        dailyStartEquity: 1000,
        startingEquity: 1000,
      });

      const result = checkDailyLimits(state, configWithTarget);

      expect(result.canTrade).toBe(false);
      expect(result.reason).toContain('profit target');
    });
  });

  describe('checkDailyReset', () => {
    test('should reset daily stats on new day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const state = createTestAgentState({
        equity: 1100,
        dailyStartEquity: 1000,
        dailyPnL: 100,
        lastTradeTime: yesterday.getTime(),
      });

      const wasReset = checkDailyReset(state);

      expect(wasReset).toBe(true);
      expect(state.dailyStartEquity).toBe(1100);
      expect(state.dailyPnL).toBe(0);
    });

    test('should not reset on same day', () => {
      const state = createTestAgentState({
        equity: 1100,
        dailyStartEquity: 1000,
        dailyPnL: 100,
        lastTradeTime: Date.now(),
      });

      const wasReset = checkDailyReset(state);

      expect(wasReset).toBe(false);
      expect(state.dailyStartEquity).toBe(1000);
      expect(state.dailyPnL).toBe(100);
    });
  });
});

// =============================================================================
// POSITION CALCULATIONS TESTS
// =============================================================================

describe('Position Calculations', () => {
  test('should calculate ROE correctly for long with leverage', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 50000,
      size: 0.002,
      leverage: 10,
      marginUsed: 10, // $100 notional / 10x
    });

    // Price increased by 1% to 50500
    const result = updatePosition(position, 50500, defaultConfig);

    // PnL = (50500 - 50000) * 0.002 = $1
    // ROE = $1 / $10 margin = 10%
    expect(result.position.unrealizedPnl).toBeCloseTo(1, 2);
    expect(result.position.unrealizedROE).toBeCloseTo(10, 1);
  });

  test('should calculate ROE correctly for short with leverage', () => {
    const position = createTestPosition({
      side: 'short',
      entryPrice: 50000,
      size: 0.002,
      leverage: 10,
      marginUsed: 10,
    });

    // Price decreased by 1% to 49500
    const result = updatePosition(position, 49500, defaultConfig);

    // PnL = (50000 - 49500) * 0.002 = $1
    // ROE = $1 / $10 margin = 10%
    expect(result.position.unrealizedPnl).toBeCloseTo(1, 2);
    expect(result.position.unrealizedROE).toBeCloseTo(10, 1);
  });

  test('should handle very small position sizes', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100000,
      size: 0.0001,
      marginUsed: 1,
    });

    const result = updatePosition(position, 101000, defaultConfig);

    // PnL = (101000 - 100000) * 0.0001 = $0.1
    expect(result.position.unrealizedPnl).toBeCloseTo(0.1, 2);
  });

  test('should handle price at exactly entry price', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100,
      size: 1,
      marginUsed: 10,
    });

    const result = updatePosition(position, 100, defaultConfig);

    expect(result.position.unrealizedPnl).toBe(0);
    expect(result.position.unrealizedROE).toBe(0);
    expect(result.action).toBe('hold');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  test('should handle zero margin gracefully', () => {
    const position = createTestPosition({
      marginUsed: 0,
    });

    const result = updatePosition(position, 110, defaultConfig);

    // Should not crash, ROE should be 0
    expect(result.position.unrealizedROE).toBe(0);
  });

  test('should handle negative prices gracefully', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100,
      size: 1,
      marginUsed: 10,
    });

    // This shouldn't happen in real life, but test defensive coding
    const result = updatePosition(position, -10, defaultConfig);

    // Should calculate correctly (loss)
    expect(result.position.unrealizedPnl).toBe(-110);
  });

  test('should handle very large price movements', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100,
      size: 1,
      marginUsed: 10,
    });

    // 100% price increase
    const result = updatePosition(position, 200, defaultConfig);

    expect(result.position.unrealizedPnl).toBe(100);
    expect(result.position.unrealizedROE).toBe(1000); // 1000% ROE
    expect(result.action).toBe('close_tp');
  });

  test('should update trailing stop correctly in uptrend', () => {
    // Use higher TP so we don't hit take profit first
    const highTPConfig = { ...defaultConfig, takeProfitROE: 100, minProfitUSD: 10 };
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100,
      size: 1,
      marginUsed: 10,
      trailingActivated: true,
      trailingStopPrice: 95, // Much lower initial stop
      highestROE: 6,
      leverage: 10,
    });

    // Price goes to 105
    // Price distance for 2.5% ROE @ 10x leverage = (2.5 / 10 / 100) * 100 = 0.25
    // Trailing stop = 105 - 0.25 = 104.75
    const result = updatePosition(position, 105, highTPConfig);

    // New trailing stop should be 104.75, which is > 95
    expect(result.position.trailingStopPrice).toBeGreaterThan(95);
    expect(result.position.trailingStopPrice).toBeCloseTo(104.75, 1);
  });

  test('should not move trailing stop lower in long position', () => {
    const position = createTestPosition({
      side: 'long',
      entryPrice: 100,
      size: 1,
      marginUsed: 10,
      trailingActivated: true,
      trailingStopPrice: 100.8,
      highestROE: 10,
    });

    // Price drops but still above trailing stop
    const result = updatePosition(position, 100.85, defaultConfig);

    // Trailing stop should not move down
    expect(result.position.trailingStopPrice).toBe(100.8);
  });
});
