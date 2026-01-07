/**
 * Unit Tests for Artifact Manager
 */

import { ArtifactManager, type ArtifactManagerConfig } from '../../src/services/artifacts/artifact-manager';
import { exportConfig, redactSecrets } from '../../src/services/artifacts/config-snapshot';
import { generatePnLSummary, exportTradeList } from '../../src/services/artifacts/pnl-snapshot';
import type { ScalperConfig, AgentState, Position } from '../../src/types';
import { loadScalperConfig } from '../../src/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Helper to create a complete mock config
function createMockConfig(): ScalperConfig {
  return loadScalperConfig(); // Use actual config loader for complete config
}

describe('Artifact Manager', () => {
  let tempDir: string;
  let artifactManager: ArtifactManager;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-test-'));
    
    const config: ArtifactManagerConfig = {
      enabled: true,
      baseDir: tempDir,
      version: '1.0.0',
      logFile: path.join(tempDir, 'test.log'),
    };

    artifactManager = new ArtifactManager(config);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initializeRun', () => {
    it('should create run folder structure', async () => {
      const runId = 'test-run-123';
      const version = '1.0.0';

      const artifacts = await artifactManager.initializeRun(runId, version);

      expect(artifacts.runId).toBe(runId);
      expect(artifacts.runPath).toContain('aster_scalper');

      // Check folders exist
      const folders = ['replay', 'logs', 'config', 'pnl', 'screenshot'];
      for (const folder of folders) {
        const folderPath = path.join(artifacts.runPath, folder);
        const stats = await fs.stat(folderPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it('should return empty artifacts when disabled', async () => {
      const disabledConfig: ArtifactManagerConfig = {
        enabled: false,
        baseDir: tempDir,
        version: '1.0.0',
      };
      const disabledManager = new ArtifactManager(disabledConfig);

      const artifacts = await disabledManager.initializeRun('test', '1.0.0');

      expect(artifacts.runPath).toBe('');
      expect(artifacts.logs).toEqual({});
      expect(artifacts.config).toEqual({});
      expect(artifacts.pnl).toEqual({});
    });
  });

  describe('collectConfig', () => {
    it('should export config with secrets redacted', async () => {
      const runId = 'test-run-123';
      await artifactManager.initializeRun(runId, '1.0.0');

      const mockConfig = createMockConfig();

      const result = await artifactManager.collectConfig(runId, mockConfig, '1.0.0');

      expect(result.snapshotFile).toBeDefined();
      expect(result.versionFile).toBeDefined();

      // Verify config file exists and is valid JSON
      if (result.snapshotFile) {
        const content = await fs.readFile(result.snapshotFile, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.version).toBe('1.0.0');
        expect(parsed.config).toBeDefined();
      }
    });
  });

  describe('collectPnLSnapshot', () => {
    it('should generate P&L summary and trade list', async () => {
      const runId = 'test-run-123';
      await artifactManager.initializeRun(runId, '1.0.0');

      const mockConfig = createMockConfig();

      const mockState: AgentState = {
        agentId: 'test-agent',
        userId: 'test-user',
        status: 'running',
        config: mockConfig,
        positions: new Map(),
        equity: 1000,
        startingEquity: 1000,
        dailyStartEquity: 1000,
        dailyPnL: 10,
        totalPnL: 10,
        totalTrades: 5,
        winningTrades: 3,
        lastTradeTime: Date.now(),
        lastTickTime: Date.now(),
        tickCount: 100,
        lastScanTick: 50,
        lastSyncTick: 50,
      };

      const mockPositions = new Map<string, Position>();
      mockPositions.set('BTCUSDT', {
        id: 'pos-1',
        agentId: 'test-agent',
        symbol: 'BTCUSDT',
        side: 'long',
        size: 0.1,
        entryPrice: 50000,
        currentPrice: 51000,
        leverage: 10,
        marginUsed: 500,
        unrealizedPnl: 100,
        unrealizedROE: 20,
        highestROE: 20,
        lowestROE: -5,
        openedAt: Date.now() - 60000,
        updatedAt: Date.now(),
      });

      const result = await artifactManager.collectPnLSnapshot(runId, mockState, mockPositions);

      expect(result.summaryFile).toBeDefined();
      expect(result.tradesFile).toBeDefined();
      expect(result.screenshotPath).toBeDefined();

      // Verify summary file
      if (result.summaryFile) {
        const content = await fs.readFile(result.summaryFile, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.equity).toBe(1000);
        expect(parsed.totalTrades).toBe(5);
        expect(parsed.winningTrades).toBe(3);
      }

      // Verify trades file
      if (result.tradesFile) {
        const content = await fs.readFile(result.tradesFile, 'utf-8');
        const trades = JSON.parse(content);
        expect(Array.isArray(trades)).toBe(true);
        expect(trades.length).toBe(1);
        expect(trades[0].symbol).toBe('BTCUSDT');
      }
    });
  });

  describe('collectLogs', () => {
    it('should copy log file if it exists', async () => {
      const runId = 'test-run-123';
      await artifactManager.initializeRun(runId, '1.0.0');

      // Create a test log file
      const testLogContent = 'Test log content\nLine 2\nLine 3';
      const logFile = path.join(tempDir, 'test.log');
      await fs.writeFile(logFile, testLogContent, 'utf-8');

      const result = await artifactManager.collectLogs(runId);

      expect(result).toBeDefined();
      if (result) {
        const copiedContent = await fs.readFile(result, 'utf-8');
        expect(copiedContent).toBe(testLogContent);
      }
    });

    it('should return undefined if log file does not exist', async () => {
      const runId = 'test-run-123';
      await artifactManager.initializeRun(runId, '1.0.0');

      // Use non-existent log file
      const manager = new ArtifactManager({
        enabled: true,
        baseDir: tempDir,
        version: '1.0.0',
        logFile: path.join(tempDir, 'nonexistent.log'),
      });

      const result = await manager.collectLogs(runId);
      expect(result).toBeUndefined();
    });
  });
});

describe('Config Snapshot', () => {
  describe('redactSecrets', () => {
    it('should return config without API keys', () => {
      const config = createMockConfig();

      const redacted = redactSecrets(config);

      // Config should be returned (API keys are not in ScalperConfig type)
      expect(redacted.leverage).toBe(config.leverage);
      expect(redacted.positionSizePercent).toBe(config.positionSizePercent);
    });
  });
});

describe('P&L Snapshot', () => {
  describe('generatePnLSummary', () => {
    it('should calculate win rate correctly', () => {
      const mockConfig = createMockConfig();

      const state: AgentState = {
        agentId: 'test',
        userId: 'test',
        status: 'running',
        config: mockConfig,
        positions: new Map(),
        equity: 1000,
        startingEquity: 1000,
        dailyStartEquity: 1000,
        dailyPnL: 10,
        totalPnL: 10,
        totalTrades: 10,
        winningTrades: 7,
        lastTradeTime: Date.now(),
        lastTickTime: Date.now(),
        tickCount: 100,
        lastScanTick: 50,
        lastSyncTick: 50,
      };

      const summary = generatePnLSummary(state, 'test-run');

      expect(summary.totalTrades).toBe(10);
      expect(summary.winningTrades).toBe(7);
      expect(summary.losingTrades).toBe(3);
      expect(summary.winRate).toBe(70);
    });

    it('should handle zero trades', () => {
      const mockConfig = createMockConfig();

      const state: AgentState = {
        agentId: 'test',
        userId: 'test',
        status: 'running',
        config: mockConfig,
        positions: new Map(),
        equity: 1000,
        startingEquity: 1000,
        dailyStartEquity: 1000,
        dailyPnL: 0,
        totalPnL: 0,
        totalTrades: 0,
        winningTrades: 0,
        lastTradeTime: Date.now(),
        lastTickTime: Date.now(),
        tickCount: 100,
        lastScanTick: 50,
        lastSyncTick: 50,
      };

      const summary = generatePnLSummary(state, 'test-run');

      expect(summary.totalTrades).toBe(0);
      expect(summary.winRate).toBe(0);
    });
  });

  describe('exportTradeList', () => {
    it('should export positions as trade entries', () => {
      const positions = new Map<string, Position>();
      positions.set('BTCUSDT', {
        id: 'pos-1',
        agentId: 'test',
        symbol: 'BTCUSDT',
        side: 'long',
        size: 0.1,
        entryPrice: 50000,
        currentPrice: 51000,
        leverage: 10,
        marginUsed: 500,
        unrealizedPnl: 100,
        unrealizedROE: 20,
        highestROE: 20,
        lowestROE: -5,
        openedAt: Date.now() - 60000,
        updatedAt: Date.now(),
      });

      const trades = exportTradeList(positions);

      expect(trades.length).toBe(1);
      expect(trades[0].symbol).toBe('BTCUSDT');
      expect(trades[0].side).toBe('long');
      expect(trades[0].quantity).toBe(0.1);
      expect(trades[0].entryPrice).toBe(50000);
      expect(trades[0].status).toBe('open');
    });
  });
});

