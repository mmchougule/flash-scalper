/**
 * Paradex Basic Usage Examples
 * 
 * This file demonstrates basic usage of the Paradex client.
 * Run with: tsx examples/paradex-basic-usage.ts
 */

import { ParadexClient } from '../src/services/execution/paradex-client';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Paradex Basic Usage Examples\n');

  // ============================================================================
  // Example 1: Initialize Client
  // ============================================================================
  console.log('📦 Example 1: Initialize Client');
  console.log('─'.repeat(50));

  const client = new ParadexClient({
    enabled: true,
    environment: 'testnet',
    privateKey: process.env.PARADEX_PRIVATE_KEY || '',
    apiBaseUrl: 'https://api.testnet.paradex.trade',
  });

  await client.initialize();
  console.log('✅ Client initialized');
  console.log('📍 Account:', client.getAddress());
  console.log();

  // ============================================================================
  // Example 2: Get Markets
  // ============================================================================
  console.log('📊 Example 2: Get Markets');
  console.log('─'.repeat(50));

  const markets = await client.getMarkets();
  console.log(`✅ Loaded ${markets.length} markets`);

  // Show first 5 perpetual markets
  const perpMarkets = markets.filter(m => m.asset_kind === 'PERP').slice(0, 5);
  console.log('\nSample Perpetual Markets:');
  perpMarkets.forEach(market => {
    console.log(`  • ${market.symbol.padEnd(20)} ${market.base_currency}/${market.quote_currency}`);
    console.log(`    Min Size: ${market.order_size_increment} | Tick: ${market.price_tick_size} | Min: $${market.min_notional}`);
  });
  console.log();

  // ============================================================================
  // Example 3: Get Market Details
  // ============================================================================
  console.log('🔍 Example 3: Get Market Details');
  console.log('─'.repeat(50));

  const testSymbol = 'BTC-USD-PERP';
  const marketInfo = await client.getMarketInfo(testSymbol);

  if (marketInfo) {
    console.log(`✅ Market: ${marketInfo.symbol}`);
    console.log(`   Asset: ${marketInfo.base_currency}/${marketInfo.quote_currency}`);
    console.log(`   Type: ${marketInfo.asset_kind} (${marketInfo.market_kind})`);
    console.log(`   Min Order: ${marketInfo.order_size_increment} ${marketInfo.base_currency}`);
    console.log(`   Price Tick: $${marketInfo.price_tick_size}`);
    console.log(`   Min Notional: $${marketInfo.min_notional}`);
    console.log(`   Max Order: ${marketInfo.max_order_size} ${marketInfo.base_currency}`);
    console.log(`   Position Limit: ${marketInfo.position_limit} ${marketInfo.base_currency}`);
  } else {
    console.log(`⚠️  Market ${testSymbol} not found`);
  }
  console.log();

  // ============================================================================
  // Example 4: Get Current Price
  // ============================================================================
  console.log('💰 Example 4: Get Current Price');
  console.log('─'.repeat(50));

  try {
    const price = await client.getPrice(testSymbol);
    console.log(`✅ ${testSymbol} Price: $${price.toFixed(2)}`);
  } catch (error: any) {
    console.log(`⚠️  Could not fetch price: ${error.message}`);
  }
  console.log();

  // ============================================================================
  // Example 5: Get Account Balance
  // ============================================================================
  console.log('💵 Example 5: Get Account Balance');
  console.log('─'.repeat(50));

  try {
    const balance = await client.getBalance();
    console.log(`✅ Account Equity: $${balance.balance.toFixed(2)}`);
    console.log(`   Unrealized P&L: $${balance.unrealizedPnL.toFixed(2)}`);
  } catch (error: any) {
    console.log(`⚠️  Could not fetch balance: ${error.message}`);
    console.log('   (Make sure you have deposited funds on Paradex testnet)');
  }
  console.log();

  // ============================================================================
  // Example 6: Get Open Positions
  // ============================================================================
  console.log('📈 Example 6: Get Open Positions');
  console.log('─'.repeat(50));

  try {
    const positions = await client.getPositions();
    console.log(`✅ Open Positions: ${positions.length}`);

    if (positions.length > 0) {
      positions.forEach(pos => {
        console.log(`\n  ${pos.market}:`);
        console.log(`    Side: ${pos.side}`);
        console.log(`    Size: ${pos.size}`);
        console.log(`    Entry: $${pos.entry_price}`);
        console.log(`    Mark: $${pos.mark_price}`);
        console.log(`    P&L: $${pos.unrealized_pnl}`);
        console.log(`    Leverage: ${pos.leverage}x`);
      });
    } else {
      console.log('   No open positions');
    }
  } catch (error: any) {
    console.log(`⚠️  Could not fetch positions: ${error.message}`);
  }
  console.log();

  // ============================================================================
  // Example 7: Format Order Quantities
  // ============================================================================
  console.log('🔢 Example 7: Format Order Quantities');
  console.log('─'.repeat(50));

  const testQuantities = [0.0015, 0.1234, 1.56789];
  console.log('Original quantities:', testQuantities);
  console.log('\nFormatted for BTC-USD-PERP:');
  testQuantities.forEach(qty => {
    const formatted = client.formatQuantity(testSymbol, qty);
    console.log(`  ${qty} → ${formatted}`);
  });
  console.log();

  // ============================================================================
  // Example 8: Check Precision Requirements
  // ============================================================================
  console.log('⚙️  Example 8: Check Precision Requirements');
  console.log('─'.repeat(50));

  const { min, precision } = client.getMinQtyAndPrecision(testSymbol);
  console.log(`✅ ${testSymbol} Requirements:`);
  console.log(`   Minimum Quantity: ${min}`);
  console.log(`   Precision: ${precision} decimal places`);
  console.log();

  console.log('✨ Examples complete!\n');
}

// Run examples
main()
  .then(() => {
    console.log('👋 Goodbye!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('   1. Check PARADEX_PRIVATE_KEY is set in .env');
    console.error('   2. Verify private key format (0x...)');
    console.error('   3. Ensure internet connection');
    process.exit(1);
  });
