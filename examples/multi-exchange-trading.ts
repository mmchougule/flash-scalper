/**
 * Multi-Exchange Trading Example
 * 
 * This example demonstrates trading across multiple exchanges
 * using the Multi-Exchange Executor.
 * 
 * Run with: tsx examples/multi-exchange-trading.ts
 */

import { multiExchangeExecutor, exchangeManager } from '../src/services/execution';
import type { Signal } from '../src/types';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🌐 Multi-Exchange Trading Example\n');

  // ============================================================================
  // Step 1: Initialize Multi-Exchange Executor
  // ============================================================================
  console.log('📦 Step 1: Initialize Exchanges');
  console.log('─'.repeat(50));

  await multiExchangeExecutor.initialize();

  const availableExchanges = multiExchangeExecutor.getAvailableExchanges();
  console.log('✅ Available exchanges:', availableExchanges.join(', '));

  if (availableExchanges.length === 0) {
    console.log('\n❌ No exchanges configured!');
    console.log('Please configure at least one exchange:');
    console.log('  • Aster: Set ASTER_API_KEY and ASTER_SECRET_KEY');
    console.log('  • Paradex: Set PARADEX_ENABLED=true and PARADEX_PRIVATE_KEY');
    return;
  }
  console.log();

  // ============================================================================
  // Step 2: Check Balances Across All Exchanges
  // ============================================================================
  console.log('💰 Step 2: Check Balances');
  console.log('─'.repeat(50));

  for (const exchange of availableExchanges) {
    try {
      const balance = await exchangeManager.getBalance(exchange);
      console.log(`${exchange.toUpperCase()}:`);
      console.log(`  Equity: $${balance.balance.toFixed(2)}`);
      console.log(`  Unrealized P&L: $${balance.unrealizedPnL.toFixed(2)}`);
    } catch (error: any) {
      console.log(`${exchange.toUpperCase()}: Error - ${error.message}`);
    }
  }

  // Get total balance
  const totalBalance = await multiExchangeExecutor.getTotalBalance();
  console.log(`\nTOTAL ACROSS ALL EXCHANGES:`);
  console.log(`  Equity: $${totalBalance.balance.toFixed(2)}`);
  console.log(`  Unrealized P&L: $${totalBalance.unrealizedPnL.toFixed(2)}`);
  console.log();

  // ============================================================================
  // Step 3: Check Positions Across All Exchanges
  // ============================================================================
  console.log('📊 Step 3: Check Positions');
  console.log('─'.repeat(50));

  const allPositions = await multiExchangeExecutor.getAllPositions();

  for (const [exchange, positions] of allPositions.entries()) {
    console.log(`${exchange.toUpperCase()}: ${positions.length} positions`);
    
    if (positions.length > 0) {
      positions.forEach(pos => {
        const symbol = pos.symbol || pos.market;
        const side = pos.side || (parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT');
        const size = pos.size || Math.abs(parseFloat(pos.positionAmt));
        console.log(`  • ${symbol}: ${side} ${size}`);
      });
    }
  }
  console.log();

  // ============================================================================
  // Step 4: Execute Trade on Specific Exchange
  // ============================================================================
  console.log('📈 Step 4: Execute Trade (Simulated)');
  console.log('─'.repeat(50));

  // Create a mock signal
  const mockSignal: Signal = {
    id: 'test-signal',
    symbol: 'BTC-USD-PERP',
    type: 'LONG',
    confidence: 75,
    source: 'technical',
    reasons: ['Example trade for demonstration'],
    indicators: {},
    timestamp: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  console.log('Mock Signal Created:');
  console.log(`  Symbol: ${mockSignal.symbol}`);
  console.log(`  Type: ${mockSignal.type}`);
  console.log(`  Confidence: ${mockSignal.confidence}%`);
  console.log(`  Exchange: ${availableExchanges[0]}`);
  console.log();

  console.log('⚠️  Skipping actual execution (set RUN_LIVE_TRADES=true to execute)');
  
  if (process.env.RUN_LIVE_TRADES === 'true') {
    try {
      const result = await multiExchangeExecutor.executeSignal(
        mockSignal,
        100, // $100 position size
        {
          exchange: availableExchanges[0] as any,
          useLimit: false,
        }
      );

      console.log('\n✅ Trade Executed:');
      console.log(`  Success: ${result.success}`);
      console.log(`  Order ID: ${result.orderId}`);
      console.log(`  Fill Price: $${result.filledPrice?.toFixed(2)}`);
      console.log(`  Exchange: ${result.exchange}`);
      console.log(`  Execution Time: ${result.executionTime}ms`);
    } catch (error: any) {
      console.log('\n❌ Trade Failed:', error.message);
    }
  }
  console.log();

  // ============================================================================
  // Step 5: Compare Prices Across Exchanges
  // ============================================================================
  console.log('💵 Step 5: Compare Prices');
  console.log('─'.repeat(50));

  const testSymbol = 'BTC-USD-PERP';
  console.log(`Fetching ${testSymbol} prices:\n`);

  for (const exchange of availableExchanges) {
    try {
      const price = await exchangeManager.getPrice(testSymbol, exchange);
      console.log(`${exchange.toUpperCase()}: $${price.toFixed(2)}`);
    } catch (error: any) {
      console.log(`${exchange.toUpperCase()}: Not available (${error.message})`);
    }
  }
  console.log();

  // ============================================================================
  // Step 6: Smart Order Routing Example
  // ============================================================================
  console.log('🧠 Step 6: Smart Order Routing');
  console.log('─'.repeat(50));

  console.log('Choosing best exchange based on:');
  console.log('  • Available balance');
  console.log('  • Market availability');
  console.log('  • Exchange fees (Paradex: 0%, Aster: varies)');
  console.log();

  // Check which exchanges have sufficient balance
  const minBalance = 100;
  const viableExchanges = [];

  for (const exchange of availableExchanges) {
    try {
      const balance = await exchangeManager.getBalance(exchange);
      if (balance.balance >= minBalance) {
        viableExchanges.push({
          exchange,
          balance: balance.balance,
          fees: exchange === 'paradex' ? 0 : 0.04, // Paradex 0%, Aster ~0.04%
        });
      }
    } catch (error) {
      // Skip if error
    }
  }

  if (viableExchanges.length > 0) {
    // Sort by fees (lowest first)
    viableExchanges.sort((a, b) => a.fees - b.fees);
    
    console.log('✅ Recommended Exchange:', viableExchanges[0].exchange.toUpperCase());
    console.log(`   Balance: $${viableExchanges[0].balance.toFixed(2)}`);
    console.log(`   Fees: ${viableExchanges[0].fees}%`);
    console.log();

    console.log('All viable exchanges:');
    viableExchanges.forEach(ex => {
      console.log(`  • ${ex.exchange.toUpperCase()}: $${ex.balance.toFixed(2)} balance, ${ex.fees}% fees`);
    });
  } else {
    console.log('⚠️  No exchanges have sufficient balance ($100+ required)');
  }
  console.log();

  // ============================================================================
  // Step 7: Exchange-Specific Features
  // ============================================================================
  console.log('⚙️  Step 7: Exchange-Specific Features');
  console.log('─'.repeat(50));

  for (const exchange of availableExchanges) {
    console.log(`\n${exchange.toUpperCase()}:`);
    
    if (exchange === 'paradex') {
      console.log('  ✅ Zero trading fees');
      console.log('  ✅ Cross-margin perpetuals');
      console.log('  ✅ 250+ markets');
      console.log('  ✅ Privacy (Starknet L2)');
      console.log('  ⚠️  ~500ms latency (L2)');
    } else if (exchange === 'aster') {
      console.log('  ✅ Low latency (~50ms)');
      console.log('  ✅ Binance-compatible API');
      console.log('  ⚠️  Trading fees apply');
    }
  }
  console.log();

  console.log('✨ Multi-Exchange Example Complete!\n');
  console.log('📝 Next Steps:');
  console.log('   1. Configure multiple exchanges in .env');
  console.log('   2. Implement intelligent exchange selection');
  console.log('   3. Add cross-exchange arbitrage detection');
  console.log('   4. Monitor positions across all exchanges');
  console.log();
}

// Run example
main()
  .then(() => {
    console.log('👋 Example complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
