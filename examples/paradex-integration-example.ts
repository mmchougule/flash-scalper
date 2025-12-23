/**
 * Paradex Integration Example
 * Demonstrates how to use the Paradex integration
 */

import { ExchangeFactory } from '../src/services/execution/exchange-factory';
import { ParadexWebSocketClient } from '../src/services/execution/paradex-websocket-client';
import { ParadexKlineBuilder } from '../src/services/execution/paradex-kline-builder';
import { SymbolMapper } from '../src/services/execution/symbol-mapper';
import { executionLogger } from '../src/utils/logger';

/**
 * Example 1: Basic REST API Usage
 */
async function example1_RestAPI() {
  executionLogger.info('=== Example 1: Paradex REST API ===');

  // Create Paradex client from environment variables
  const client = ExchangeFactory.create('paradex');

  try {
    // Get account balance
    const balance = await client.getBalance();
    executionLogger.info({
      balance: balance.balance,
      unrealizedPnL: balance.unrealizedPnL,
    }, 'Account balance');

    // Get current price
    const ethPrice = await client.getPrice('ETHUSDT');
    executionLogger.info({ symbol: 'ETHUSDT', price: ethPrice }, 'Current price');

    // Get open positions
    const positions = await client.getPositions();
    executionLogger.info({ count: positions.length }, 'Open positions');

    for (const position of positions) {
      executionLogger.info({
        symbol: position.symbol,
        size: position.positionAmt,
        entryPrice: position.entryPrice,
        unrealizedPnl: position.unrealizedProfit,
      }, 'Position');
    }
  } catch (error: any) {
    executionLogger.error({ error: error.message }, 'REST API example failed');
  }
}

/**
 * Example 2: WebSocket Real-Time Data
 */
async function example2_WebSocket() {
  executionLogger.info('=== Example 2: Paradex WebSocket ===');

  const wsUrl = process.env.PARADEX_WS_URL || 'wss://ws.api.testnet.paradex.trade/v1';
  const bearerToken = process.env.PARADEX_BEARER_TOKEN || '';

  if (!bearerToken) {
    executionLogger.error('PARADEX_BEARER_TOKEN not set');
    return;
  }

  const wsClient = new ParadexWebSocketClient(wsUrl, bearerToken);

  try {
    // Connect to WebSocket
    await wsClient.connect();
    executionLogger.info('Connected to Paradex WebSocket');

    // Subscribe to ETH and BTC trades
    await wsClient.subscribeTrades('ETH-USD-PERP');
    await wsClient.subscribeTrades('BTC-USD-PERP');
    executionLogger.info('Subscribed to trade channels');

    // Listen for trades
    wsClient.on('trade', (trade) => {
      executionLogger.info({
        market: trade.market,
        price: trade.price,
        size: trade.size,
        side: trade.side,
      }, 'Trade received');
    });

    // Listen for errors
    wsClient.on('error', (error) => {
      executionLogger.error({ error: error.message }, 'WebSocket error');
    });

    // Keep connection alive for 30 seconds
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Disconnect
    wsClient.disconnect();
    executionLogger.info('Disconnected from WebSocket');
  } catch (error: any) {
    executionLogger.error({ error: error.message }, 'WebSocket example failed');
  }
}

/**
 * Example 3: Kline Building from Trades
 */
async function example3_KlineBuilder() {
  executionLogger.info('=== Example 3: Kline Building ===');

  const wsUrl = process.env.PARADEX_WS_URL || 'wss://ws.api.testnet.paradex.trade/v1';
  const bearerToken = process.env.PARADEX_BEARER_TOKEN || '';

  if (!bearerToken) {
    executionLogger.error('PARADEX_BEARER_TOKEN not set');
    return;
  }

  const wsClient = new ParadexWebSocketClient(wsUrl, bearerToken);
  const klineBuilder = new ParadexKlineBuilder('5m', 100);

  try {
    // Connect and subscribe
    await wsClient.connect();
    await wsClient.subscribeTrades('ETH-USD-PERP');
    executionLogger.info('Connected and subscribed');

    // Process trades into klines
    wsClient.on('trade', (trade) => {
      klineBuilder.processTrade(trade);

      // Get current kline
      const currentKline = klineBuilder.getCurrentKline(trade.market);
      if (currentKline) {
        executionLogger.info({
          market: trade.market,
          open: currentKline.open,
          high: currentKline.high,
          low: currentKline.low,
          close: currentKline.close,
          volume: currentKline.volume,
        }, 'Current 5m kline');
      }

      // Check if we have enough data
      const klineCount = klineBuilder.getKlineCount(trade.market);
      executionLogger.info({
        market: trade.market,
        klineCount,
        hasEnoughData: klineBuilder.hasEnoughData(trade.market, 20),
      }, 'Kline status');
    });

    // Wait for data to accumulate
    await new Promise((resolve) => setTimeout(resolve, 60000)); // 1 minute

    // Get historical klines
    const klines = klineBuilder.getKlines('ETH-USD-PERP', 10);
    executionLogger.info({
      count: klines.length,
      klines: klines.slice(0, 3), // Show first 3
    }, 'Historical klines (Binance format)');

    // Disconnect
    wsClient.disconnect();
    executionLogger.info('Disconnected');
  } catch (error: any) {
    executionLogger.error({ error: error.message }, 'Kline builder example failed');
  }
}

/**
 * Example 4: Symbol Mapping
 */
function example4_SymbolMapping() {
  executionLogger.info('=== Example 4: Symbol Mapping ===');

  const internalSymbols = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];

  for (const symbol of internalSymbols) {
    const paradexMarket = SymbolMapper.toParadex(symbol);
    const backToInternal = SymbolMapper.fromParadex(paradexMarket);

    executionLogger.info({
      internal: symbol,
      paradex: paradexMarket,
      roundTrip: backToInternal,
      match: symbol === backToInternal,
    }, 'Symbol mapping');
  }
}

/**
 * Example 5: Order Execution (Paper Trading)
 */
async function example5_OrderExecution() {
  executionLogger.info('=== Example 5: Order Execution (DEMO) ===');

  const client = ExchangeFactory.create('paradex');

  try {
    // Get current price
    const price = await client.getPrice('ETHUSDT');
    executionLogger.info({ price }, 'Current ETH price');

    // Calculate position size (demo only)
    const balance = await client.getBalance();
    const positionSizeUSD = balance.balance * 0.1; // 10% of balance
    const quantity = positionSizeUSD / price;
    const roundedQty = client.roundQuantity('ETHUSDT', quantity);

    executionLogger.info({
      balance: balance.balance,
      positionSizeUSD,
      quantity,
      roundedQty,
    }, 'Position sizing');

    // Note: Uncomment below to actually place an order
    // WARNING: This will place a real order!
    /*
    const result = await client.placeMarketOrder('ETHUSDT', 'BUY', roundedQty);
    if (result.success) {
      executionLogger.info({
        orderId: result.orderId,
        filledPrice: result.filledPrice,
        filledQuantity: result.filledQuantity,
      }, 'Order executed');
    } else {
      executionLogger.error({ error: result.error }, 'Order failed');
    }
    */

    executionLogger.info('Order execution skipped (demo mode)');
  } catch (error: any) {
    executionLogger.error({ error: error.message }, 'Order execution example failed');
  }
}

/**
 * Main function - runs all examples
 */
async function main() {
  executionLogger.info('Starting Paradex integration examples');

  try {
    // Example 1: REST API
    await example1_RestAPI();
    await sleep(2000);

    // Example 2: WebSocket (commented out by default - uncomment to run)
    // await example2_WebSocket();
    // await sleep(2000);

    // Example 3: Kline Builder (commented out by default - uncomment to run)
    // await example3_KlineBuilder();
    // await sleep(2000);

    // Example 4: Symbol Mapping
    example4_SymbolMapping();
    await sleep(2000);

    // Example 5: Order Execution (demo only)
    await example5_OrderExecution();

    executionLogger.info('All examples completed');
  } catch (error: any) {
    executionLogger.error({ error: error.message }, 'Examples failed');
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
