/**
 * Paradex Trading Examples
 * 
 * This file demonstrates trading operations with Paradex.
 * 
 * ⚠️  WARNING: This uses real orders on testnet!
 * Make sure you have test USDC before running.
 * 
 * Run with: tsx examples/paradex-trading-example.ts
 */

import { ParadexClient } from '../src/services/execution/paradex-client';
import * as dotenv from 'dotenv';

dotenv.config();

// Trading configuration
const SYMBOL = 'BTC-USD-PERP';
const TEST_SIZE = 0.001; // 0.001 BTC (~$100 with BTC at $100k)

async function main() {
  console.log('🚀 Paradex Trading Examples\n');
  console.log('⚠️  WARNING: This will place REAL orders on testnet!');
  console.log('   Make sure you have test USDC deposited.\n');

  // Wait for confirmation
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('\n✅ Proceeding with examples...\n');

  // Initialize client
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

  // Check balance
  console.log('💰 Checking Balance...');
  console.log('─'.repeat(50));
  const balance = await client.getBalance();
  console.log(`Account Equity: $${balance.balance.toFixed(2)}`);
  console.log(`Unrealized P&L: $${balance.unrealizedPnL.toFixed(2)}`);

  if (balance.balance < 100) {
    console.log('\n❌ Insufficient balance for trading examples');
    console.log('   Please deposit test USDC to your Paradex testnet account');
    console.log('   Visit: https://app.testnet.paradex.trade');
    return;
  }
  console.log('✅ Sufficient balance for examples\n');

  // Get current price
  const currentPrice = await client.getPrice(SYMBOL);
  console.log(`📊 Current ${SYMBOL} Price: $${currentPrice.toFixed(2)}\n`);

  // ============================================================================
  // Example 1: Place Market Order
  // ============================================================================
  console.log('📈 Example 1: Place Market Order (BUY)');
  console.log('─'.repeat(50));

  const marketOrder = await client.placeMarketOrder(
    SYMBOL,
    'BUY',
    TEST_SIZE,
    false // not reduce-only
  );

  if (marketOrder.success) {
    console.log('✅ Market order placed successfully!');
    console.log(`   Order ID: ${marketOrder.orderId}`);
    console.log(`   Fill Price: $${marketOrder.filledPrice?.toFixed(2)}`);
    console.log(`   Fill Size: ${marketOrder.filledQuantity}`);
    console.log(`   Fees: $${marketOrder.fees?.toFixed(4)} (zero fees!)`);
  } else {
    console.log('❌ Market order failed:', marketOrder.error);
  }
  console.log();

  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ============================================================================
  // Example 2: Check Position
  // ============================================================================
  console.log('📊 Example 2: Check Position');
  console.log('─'.repeat(50));

  const position = await client.getPosition(SYMBOL);
  if (position) {
    console.log('✅ Position found:');
    console.log(`   Market: ${position.market}`);
    console.log(`   Side: ${position.side}`);
    console.log(`   Size: ${position.size}`);
    console.log(`   Entry Price: $${position.entry_price}`);
    console.log(`   Mark Price: $${position.mark_price}`);
    console.log(`   Unrealized P&L: $${position.unrealized_pnl}`);
    console.log(`   Leverage: ${position.leverage}x`);
    console.log(`   Liquidation: $${position.liquidation_price}`);
  } else {
    console.log('⚠️  No position found (order may still be pending)');
  }
  console.log();

  // ============================================================================
  // Example 3: Place Limit Order
  // ============================================================================
  console.log('📋 Example 3: Place Limit Order');
  console.log('─'.repeat(50));

  // Place limit order 1% below current price (won't fill immediately)
  const limitPrice = currentPrice * 0.99;
  const formattedLimitPrice = parseFloat(client.formatPrice(SYMBOL, limitPrice));

  console.log(`Placing limit buy at $${formattedLimitPrice.toFixed(2)} (1% below market)`);

  const limitOrder = await client.placeLimitOrder(
    SYMBOL,
    'BUY',
    TEST_SIZE,
    formattedLimitPrice,
    false
  );

  if (limitOrder.success) {
    console.log('✅ Limit order placed successfully!');
    console.log(`   Order ID: ${limitOrder.orderId}`);
    console.log(`   Limit Price: $${formattedLimitPrice.toFixed(2)}`);
    console.log(`   Size: ${TEST_SIZE}`);
    console.log('   Status: OPEN (waiting to fill)');

    // Store order ID for later cancellation
    var limitOrderId = limitOrder.orderId;
  } else {
    console.log('❌ Limit order failed:', limitOrder.error);
  }
  console.log();

  // ============================================================================
  // Example 4: Get Open Orders
  // ============================================================================
  console.log('📝 Example 4: Get Open Orders');
  console.log('─'.repeat(50));

  const openOrders = await client.getOpenOrders();
  console.log(`✅ Open Orders: ${openOrders.length}`);

  if (openOrders.length > 0) {
    openOrders.forEach(order => {
      console.log(`\n  Order ${order.id.substring(0, 8)}...`);
      console.log(`    Market: ${order.market}`);
      console.log(`    Type: ${order.type}`);
      console.log(`    Side: ${order.side}`);
      console.log(`    Size: ${order.size}`);
      if (order.price) {
        console.log(`    Price: $${order.price}`);
      }
      console.log(`    Status: ${order.status}`);
    });
  }
  console.log();

  // ============================================================================
  // Example 5: Cancel Order
  // ============================================================================
  if (limitOrderId) {
    console.log('❌ Example 5: Cancel Order');
    console.log('─'.repeat(50));

    const cancelled = await client.cancelOrder(SYMBOL, limitOrderId);
    if (cancelled) {
      console.log('✅ Order cancelled successfully');
      console.log(`   Order ID: ${limitOrderId}`);
    } else {
      console.log('⚠️  Failed to cancel order (may already be filled or cancelled)');
    }
    console.log();
  }

  // ============================================================================
  // Example 6: Close Position (if exists)
  // ============================================================================
  if (position && parseFloat(position.size) > 0) {
    console.log('🔄 Example 6: Close Position');
    console.log('─'.repeat(50));

    console.log('Closing position with market order (reduce-only)...');

    const closeOrder = await client.placeMarketOrder(
      SYMBOL,
      position.side === 'LONG' ? 'SELL' : 'BUY', // Opposite side
      parseFloat(position.size),
      true // reduce-only
    );

    if (closeOrder.success) {
      console.log('✅ Position closed successfully!');
      console.log(`   Order ID: ${closeOrder.orderId}`);
      console.log(`   Exit Price: $${closeOrder.filledPrice?.toFixed(2)}`);
      console.log(`   Size: ${closeOrder.filledQuantity}`);

      // Calculate realized P&L (approximate)
      const entryPrice = parseFloat(position.entry_price);
      const exitPrice = closeOrder.filledPrice || 0;
      const size = parseFloat(position.size);
      const pnl = position.side === 'LONG'
        ? (exitPrice - entryPrice) * size
        : (entryPrice - exitPrice) * size;
      console.log(`   Realized P&L: $${pnl.toFixed(2)}`);
    } else {
      console.log('❌ Failed to close position:', closeOrder.error);
    }
    console.log();
  }

  // ============================================================================
  // Final Summary
  // ============================================================================
  console.log('📊 Final Account Summary');
  console.log('─'.repeat(50));

  const finalBalance = await client.getBalance();
  const finalPositions = await client.getPositions();

  console.log(`Account Equity: $${finalBalance.balance.toFixed(2)}`);
  console.log(`Unrealized P&L: $${finalBalance.unrealizedPnL.toFixed(2)}`);
  console.log(`Open Positions: ${finalPositions.length}`);

  console.log('\n✨ Trading examples complete!\n');
  console.log('📝 Notes:');
  console.log('   • All trades were on testnet with test USDC');
  console.log('   • Paradex has ZERO trading fees');
  console.log('   • Always test thoroughly before production');
  console.log('   • Check your positions at: https://app.testnet.paradex.trade\n');
}

// Run examples
main()
  .then(() => {
    console.log('👋 Trading examples complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
