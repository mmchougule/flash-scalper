/**
 * Paradex Integration Test Script
 * Quick test to verify Paradex connection and functionality
 */

import * as dotenv from 'dotenv';
import { ExchangeFactory } from './src/services/execution/exchange-factory';
import { ParadexWebSocketClient } from './src/services/execution/paradex-websocket-client';
import { executionLogger } from './src/utils/logger';

// Load environment variables
dotenv.config();

async function testRestAPI() {
  console.log('\n=== Testing Paradex REST API ===\n');

  try {
    const client = ExchangeFactory.create('paradex', {
      apiKey: process.env.PARADEX_API_KEY || '',
      secretKey: process.env.PARADEX_SECRET_KEY || '',
      baseUrl: process.env.PARADEX_REST_URL || 'https://api.testnet.paradex.trade',
    });

    // Test 1: Get Balance
    console.log('Test 1: Getting account balance...');
    const balance = await client.getBalance();
    console.log(`✅ Balance: $${balance.balance.toFixed(2)}`);
    console.log(`   Unrealized PnL: $${balance.unrealizedPnL.toFixed(2)}`);

    // Test 2: Get Price
    console.log('\nTest 2: Getting ETH price...');
    const price = await client.getPrice('ETHUSDT');
    console.log(`✅ ETH Price: $${price.toFixed(2)}`);

    // Test 3: Get Positions
    console.log('\nTest 3: Getting open positions...');
    const positions = await client.getPositions();
    console.log(`✅ Open positions: ${positions.length}`);
    
    if (positions.length > 0) {
      positions.forEach((pos, idx) => {
        console.log(`   Position ${idx + 1}:`);
        console.log(`     Symbol: ${pos.symbol}`);
        console.log(`     Size: ${pos.positionAmt}`);
        console.log(`     Entry Price: $${pos.entryPrice}`);
        console.log(`     Unrealized PnL: $${pos.unrealizedProfit}`);
      });
    }

    console.log('\n✅ REST API tests passed!\n');
    return true;
  } catch (error: any) {
    console.error('\n❌ REST API test failed:', error.message);
    return false;
  }
}

async function testWebSocket() {
  console.log('\n=== Testing Paradex WebSocket ===\n');

  const wsUrl = process.env.PARADEX_WS_URL || 'wss://ws.api.testnet.paradex.trade/v1';
  const bearerToken = process.env.PARADEX_BEARER_TOKEN || '';

  if (!bearerToken) {
    console.error('❌ PARADEX_BEARER_TOKEN not set in .env file');
    return false;
  }

  try {
    const wsClient = new ParadexWebSocketClient(wsUrl, bearerToken);

    // Test 1: Connection
    console.log('Test 1: Connecting to WebSocket...');
    await wsClient.connect();
    console.log('✅ Connected successfully');

    // Test 2: Subscribe to trades
    console.log('\nTest 2: Subscribing to ETH-USD-PERP trades...');
    await wsClient.subscribeTrades('ETH-USD-PERP');
    console.log('✅ Subscribed successfully');

    // Test 3: Receive trades
    console.log('\nTest 3: Waiting for trade data (10 seconds)...');
    let tradesReceived = 0;

    wsClient.on('trade', (trade) => {
      tradesReceived++;
      if (tradesReceived <= 3) {
        console.log(`   Trade ${tradesReceived}: ${trade.market} @ $${trade.price} (${trade.size} ${trade.side})`);
      }
    });

    wsClient.on('error', (error) => {
      console.error('   WebSocket error:', error.message);
    });

    // Wait for trades
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (tradesReceived > 0) {
      console.log(`✅ Received ${tradesReceived} trades`);
    } else {
      console.log('⚠️  No trades received (market might be inactive)');
    }

    // Disconnect
    wsClient.disconnect();
    console.log('\n✅ WebSocket tests passed!\n');
    return true;
  } catch (error: any) {
    console.error('\n❌ WebSocket test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Paradex Integration Test Suite                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Check environment variables
  console.log('\nChecking environment variables...');
  const requiredVars = [
    'PARADEX_API_KEY',
    'PARADEX_SECRET_KEY',
    'PARADEX_BEARER_TOKEN',
  ];

  let allVarsSet = true;
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value === '' || value.includes('your_')) {
      console.log(`❌ ${varName} is not set or invalid`);
      allVarsSet = false;
    } else {
      console.log(`✅ ${varName} is set`);
    }
  }

  if (!allVarsSet) {
    console.log('\n❌ Please set all required environment variables in .env file');
    console.log('   See .env.example for reference');
    process.exit(1);
  }

  console.log('\n✅ All required environment variables are set');

  // Run tests
  const restAPISuccess = await testRestAPI();
  const webSocketSuccess = await testWebSocket();

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  REST API:   ${restAPISuccess ? '✅ PASSED' : '❌ FAILED'}                                      ║`);
  console.log(`║  WebSocket:  ${webSocketSuccess ? '✅ PASSED' : '❌ FAILED'}                                      ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (restAPISuccess && webSocketSuccess) {
    console.log('\n✅ All tests passed! Paradex integration is working correctly.');
    console.log('\nNext steps:');
    console.log('  1. Review PARADEX_SETUP.md for detailed configuration');
    console.log('  2. Run: npm run build');
    console.log('  3. Run: npm run start:scalper (with EXCHANGE=paradex)');
    console.log('  4. Monitor logs and performance');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the errors above and:');
    console.log('  1. Verify your API credentials are correct');
    console.log('  2. Check network connectivity');
    console.log('  3. Ensure you have access to Paradex testnet');
    console.log('  4. Review the logs for detailed error messages');
    process.exit(1);
  }
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
