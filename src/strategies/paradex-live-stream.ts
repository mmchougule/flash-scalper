/**
 * Paradex Live Stream Trading Agent
 * Runs Paradex perpetual futures trading with live stream capabilities
 */

import { ParadexTradingAgent } from '../services/paradex';
import { config, loadScalperConfig } from '../config';
import { logger } from '../utils/logger';
import type { ParadexAgentConfig } from '../services/paradex/paradex-agent';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Load Paradex configuration from environment
 */
function loadParadexConfig(): ParadexAgentConfig {
  // Validate required credentials
  if (!config.paradex.accountAddress) {
    throw new Error('PARADEX_ACCOUNT_ADDRESS environment variable is required');
  }

  if (!config.paradex.privateKey) {
    throw new Error('PARADEX_PRIVATE_KEY environment variable is required');
  }

  if (!config.paradex.jwt) {
    throw new Error('PARADEX_JWT environment variable is required');
  }

  if (config.paradex.markets.length === 0) {
    throw new Error('PARADEX_MARKETS environment variable must contain at least one market');
  }

  // Load scalper configuration
  const scalperConfig = loadScalperConfig();

  return {
    auth: {
      apiKey: config.paradex.apiKey,
      privateKey: config.paradex.privateKey,
      accountAddress: config.paradex.accountAddress,
    },
    jwt: config.paradex.jwt,
    restUrl: config.paradex.restUrl,
    wsUrl: config.paradex.wsUrl,
    markets: config.paradex.markets,
    scalperConfig,
    agentId: process.env.AGENT_ID || `paradex-live-${Date.now()}`,
    userId: process.env.USER_ID || 'system',
  };
}

// =============================================================================
// LIVE STREAM DISPLAY
// =============================================================================

/**
 * Format and display live stream data
 * This can be enhanced to output to OBS, streaming platforms, etc.
 */
function displayLiveStreamData(agent: ParadexTradingAgent): void {
  const stats = agent.getStats();
  const positions = agent.getPositions();

  // Clear console for live update (optional)
  if (process.env.CLEAR_CONSOLE === 'true') {
    console.clear();
  }

  // Display header
  console.log('\n' + '='.repeat(80));
  console.log('🚀 PARADEX LIVE TRADING STREAM');
  console.log('='.repeat(80));

  // Display stats
  console.log(`\n📊 AGENT STATUS: ${stats.status.toUpperCase()}`);
  console.log(`💰 Equity: $${stats.equity.toFixed(2)}`);
  console.log(`📈 Daily P&L: $${stats.dailyPnL.toFixed(2)} (${((stats.dailyPnL / stats.equity) * 100).toFixed(2)}%)`);
  console.log(`💵 Total P&L: $${stats.totalPnL.toFixed(2)}`);
  console.log(`🎯 Win Rate: ${(stats.winRate * 100).toFixed(1)}% (${stats.winningTrades}/${stats.totalTrades})`);
  console.log(`📍 Positions: ${stats.positions} open`);
  console.log(`⏱️  Tick: #${stats.tickCount}`);

  // Display positions
  if (positions.size > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('📌 OPEN POSITIONS:');
    console.log('-'.repeat(80));

    for (const [market, position] of positions) {
      const holdTimeMinutes = ((Date.now() - position.openedAt) / 60000).toFixed(1);
      const emoji = position.side === 'long' ? '📈' : '📉';
      const pnlEmoji = position.unrealizedPnl >= 0 ? '✅' : '❌';

      console.log(`\n${emoji} ${market}`);
      console.log(`  Side: ${position.side.toUpperCase()}`);
      console.log(`  Size: ${position.size.toFixed(4)}`);
      console.log(`  Entry: $${position.entryPrice.toFixed(2)}`);
      console.log(`  Current: $${position.currentPrice.toFixed(2)}`);
      console.log(`  ${pnlEmoji} P&L: $${position.unrealizedPnl.toFixed(2)} (${position.unrealizedROE.toFixed(2)}% ROE)`);
      console.log(`  Leverage: ${position.leverage}x`);
      console.log(`  Hold Time: ${holdTimeMinutes} min`);
    }
  } else {
    console.log('\n📭 No open positions');
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Last Update: ${new Date().toLocaleTimeString()}`);
  console.log('='.repeat(80) + '\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║     PARADEX LIVE STREAM TRADING AGENT                       ║
║     Real-time perpetual futures trading on Paradex          ║
╠══════════════════════════════════════════════════════════════╣
║  Exchange:  Paradex Testnet                                 ║
║  Mode:      Live Stream                                      ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Load configuration
  let agentConfig: ParadexAgentConfig;
  try {
    agentConfig = loadParadexConfig();
    logger.info(
      {
        markets: agentConfig.markets,
        agentId: agentConfig.agentId,
        leverage: agentConfig.scalperConfig.leverage,
      },
      'Configuration loaded'
    );
  } catch (error: any) {
    logger.fatal({ error: error.message }, 'Failed to load configuration');
    console.error('\n❌ Configuration Error:', error.message);
    console.error('\nPlease set the following environment variables:');
    console.error('  - PARADEX_ACCOUNT_ADDRESS');
    console.error('  - PARADEX_PRIVATE_KEY');
    console.error('  - PARADEX_JWT');
    console.error('  - PARADEX_MARKETS (comma-separated list, e.g., "BTC-USD-PERP,ETH-USD-PERP")');
    process.exit(1);
  }

  // Create agent
  const agent = new ParadexTradingAgent(agentConfig);

  // Setup event handlers
  agent.on('initialized', () => {
    logger.info('Agent initialized');
    console.log('\n✅ Agent initialized successfully\n');
  });

  agent.on('started', () => {
    logger.info('Agent started');
    console.log('\n🚀 Trading agent started\n');
  });

  agent.on('ticker', (ticker) => {
    logger.debug({ market: ticker.market, price: ticker.last_price }, 'Ticker update');
  });

  agent.on('position_update', (position) => {
    logger.info(
      {
        symbol: position.symbol,
        side: position.side,
        roe: position.unrealizedROE.toFixed(2),
      },
      'Position updated'
    );
  });

  agent.on('position_closed', (data) => {
    if (typeof data === 'object' && 'position' in data) {
      logger.info(
        {
          symbol: data.position.symbol,
          reason: data.reason,
          pnl: data.pnl?.toFixed(2),
          roe: data.roe?.toFixed(2),
        },
        'Position closed'
      );
      console.log(`\n🔔 Position closed: ${data.position.symbol} - P&L: $${data.pnl?.toFixed(2)}\n`);
    }
  });

  agent.on('order_executed', (data) => {
    logger.info(
      {
        market: data.order.market,
        side: data.order.side,
        size: data.order.size,
      },
      'Order executed'
    );
    console.log(`\n🎯 New position opened: ${data.order.market} ${data.order.side.toUpperCase()}\n`);
  });

  agent.on('ws_connected', () => {
    logger.info('WebSocket connected');
    console.log('\n🔌 WebSocket connected\n');
  });

  agent.on('ws_disconnected', ({ code, reason }) => {
    logger.warn({ code, reason }, 'WebSocket disconnected');
    console.log(`\n⚠️  WebSocket disconnected (code: ${code})\n`);
  });

  agent.on('error', (error: Error) => {
    logger.error({ error: error.message }, 'Agent error');
    console.error('\n❌ Error:', error.message, '\n');
  });

  // Setup live stream display interval
  const displayIntervalMs = parseInt(process.env.DISPLAY_INTERVAL_MS || '5000', 10);
  let displayInterval: NodeJS.Timeout;

  agent.on('started', () => {
    displayInterval = setInterval(() => {
      displayLiveStreamData(agent);
    }, displayIntervalMs);

    // Display immediately
    displayLiveStreamData(agent);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    console.log(`\n\n⚠️  Received ${signal}, shutting down gracefully...\n`);

    if (displayInterval) {
      clearInterval(displayInterval);
    }

    await agent.stop();

    // Final stats
    const finalStats = agent.getStats();
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total Trades: ${finalStats.totalTrades}`);
    console.log(`Win Rate: ${(finalStats.winRate * 100).toFixed(1)}%`);
    console.log(`Total P&L: $${finalStats.totalPnL.toFixed(2)}`);
    console.log(`Final Equity: $${finalStats.equity.toFixed(2)}`);
    console.log('='.repeat(80) + '\n');

    logger.info({ finalStats }, 'Agent stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start the agent
  try {
    await agent.start();
  } catch (error: any) {
    logger.fatal({ error: error.message }, 'Failed to start agent');
    console.error('\n❌ Failed to start agent:', error.message, '\n');
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  logger.fatal({ error: error.message }, 'Fatal error');
  console.error('\n❌ Fatal error:', error.message, '\n');
  process.exit(1);
});

export { main };
