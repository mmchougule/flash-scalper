/**
 * Integration Tests for Paradex Client
 * 
 * These tests interact with the real Paradex testnet API.
 * 
 * Requirements:
 * - PARADEX_PRIVATE_KEY must be set in environment
 * - Testnet account must have some USDC deposited
 * 
 * Run with: npm test -- paradex-integration.test.ts
 * Or skip: npm test -- --testPathIgnorePatterns=integration
 */

import { ParadexClient } from '../../src/services/execution/paradex-client';
import * as dotenv from 'dotenv';

dotenv.config();

// Skip these tests if no private key is configured
const SKIP_INTEGRATION_TESTS = !process.env.PARADEX_PRIVATE_KEY;

describe('Paradex Integration Tests', () => {
  let client: ParadexClient;

  beforeAll(async () => {
    if (SKIP_INTEGRATION_TESTS) {
      console.log('⚠️  Skipping Paradex integration tests (no PARADEX_PRIVATE_KEY)');
      return;
    }

    client = new ParadexClient({
      enabled: true,
      environment: 'testnet',
      privateKey: process.env.PARADEX_PRIVATE_KEY!,
      apiBaseUrl: 'https://api.testnet.paradex.trade',
    });

    await client.initialize();
  }, 30000); // 30 second timeout for initialization

  describe('Client Initialization', () => {
    it('should initialize successfully', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      expect(client).toBeDefined();
      const address = client.getAddress();
      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it('should have valid Starknet account address', () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const address = client.getAddress();
      expect(address.length).toBeGreaterThan(0);
      expect(address.startsWith('0x')).toBe(true);
    });
  });

  describe('Market Data', () => {
    it('should fetch all markets', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      expect(markets).toBeDefined();
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
    }, 15000);

    it('should have valid market structure', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const firstMarket = markets[0];

      expect(firstMarket).toHaveProperty('symbol');
      expect(firstMarket).toHaveProperty('base_currency');
      expect(firstMarket).toHaveProperty('quote_currency');
      expect(firstMarket).toHaveProperty('settlement_currency');
      expect(firstMarket).toHaveProperty('order_size_increment');
      expect(firstMarket).toHaveProperty('price_tick_size');
      expect(firstMarket).toHaveProperty('min_notional');
    }, 15000);

    it('should find BTC perpetual market', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const btcMarkets = markets.filter(m => 
        m.base_currency === 'BTC' && m.asset_kind === 'PERP'
      );

      expect(btcMarkets.length).toBeGreaterThan(0);
    }, 15000);

    it('should get specific market info', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const perpMarket = markets.find(m => m.asset_kind === 'PERP');
      
      if (perpMarket) {
        const marketInfo = await client.getMarketInfo(perpMarket.symbol);
        expect(marketInfo).toBeDefined();
        expect(marketInfo?.symbol).toBe(perpMarket.symbol);
      }
    }, 15000);

    it('should return null for non-existent market', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const marketInfo = await client.getMarketInfo('NONEXISTENT-MARKET');
      expect(marketInfo).toBeNull();
    });
  });

  describe('Price Data', () => {
    it('should fetch current price for a market', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const perpMarket = markets.find(m => m.asset_kind === 'PERP');

      if (perpMarket) {
        const price = await client.getPrice(perpMarket.symbol);
        expect(price).toBeGreaterThan(0);
        expect(typeof price).toBe('number');
      }
    }, 15000);

    it('should have reasonable BTC price', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const btcMarket = markets.find(m => 
        m.base_currency === 'BTC' && m.asset_kind === 'PERP'
      );

      if (btcMarket) {
        const price = await client.getPrice(btcMarket.symbol);
        expect(price).toBeGreaterThan(10000); // BTC should be > $10k
        expect(price).toBeLessThan(1000000); // BTC should be < $1M
      }
    }, 15000);
  });

  describe('Account Data', () => {
    it('should fetch account balance', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const balance = await client.getBalance();
      expect(balance).toBeDefined();
      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('unrealizedPnL');
      expect(typeof balance.balance).toBe('number');
      expect(typeof balance.unrealizedPnL).toBe('number');
    }, 15000);

    it('should have non-negative balance', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const balance = await client.getBalance();
      expect(balance.balance).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should fetch positions', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const positions = await client.getPositions();
      expect(Array.isArray(positions)).toBe(true);
    }, 15000);

    it('should have valid position structure if positions exist', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const positions = await client.getPositions();
      
      if (positions.length > 0) {
        const position = positions[0];
        expect(position).toHaveProperty('market');
        expect(position).toHaveProperty('side');
        expect(position).toHaveProperty('size');
        expect(position).toHaveProperty('entry_price');
        expect(position).toHaveProperty('mark_price');
        expect(position).toHaveProperty('unrealized_pnl');
      }
    }, 15000);
  });

  describe('Precision and Formatting', () => {
    it('should correctly format quantities for BTC market', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const btcMarket = markets.find(m => 
        m.base_currency === 'BTC' && m.asset_kind === 'PERP'
      );

      if (btcMarket) {
        const formatted = client.formatQuantity(btcMarket.symbol, 0.123456);
        expect(formatted).toBeDefined();
        expect(typeof formatted).toBe('string');
        
        // Should respect market precision
        const parts = formatted.split('.');
        if (parts.length > 1) {
          const decimals = parts[1].length;
          expect(decimals).toBeLessThanOrEqual(4); // Reasonable precision
        }
      }
    }, 15000);

    it('should correctly format prices', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const btcMarket = markets.find(m => 
        m.base_currency === 'BTC' && m.asset_kind === 'PERP'
      );

      if (btcMarket) {
        const formatted = client.formatPrice(btcMarket.symbol, 95123.456);
        expect(formatted).toBeDefined();
        expect(typeof formatted).toBe('string');
        
        const price = parseFloat(formatted);
        expect(price).toBeGreaterThan(0);
      }
    }, 15000);

    it('should enforce minimum quantities', () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const { min, precision } = client.getMinQtyAndPrecision('BTC-USD-PERP');
      expect(min).toBeGreaterThan(0);
      expect(precision).toBeGreaterThanOrEqual(0);
      
      const rounded = client.roundQuantity('BTC-USD-PERP', 0.0001);
      expect(rounded).toBeGreaterThanOrEqual(min);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid market gracefully', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      await expect(async () => {
        await client.getPrice('INVALID-MARKET-SYMBOL');
      }).rejects.toThrow();
    }, 15000);

    it('should handle network errors gracefully', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      // Create client with invalid URL
      const badClient = new ParadexClient({
        enabled: true,
        environment: 'testnet',
        privateKey: process.env.PARADEX_PRIVATE_KEY!,
        apiBaseUrl: 'https://invalid.paradex.trade',
      });

      // Should fail to fetch markets
      await expect(async () => {
        await (badClient as any).loadMarkets();
      }).rejects.toThrow();
    }, 15000);
  });

  describe('Market Cache', () => {
    it('should cache markets after first fetch', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets1 = await client.getMarkets();
      const markets2 = await client.getMarkets(); // Should use cache

      expect(markets1.length).toBe(markets2.length);
      expect(markets1[0].symbol).toBe(markets2[0].symbol);
    }, 15000);

    it('should refresh stale cache', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      // Set last fetch to old time
      (client as any).lastMarketsFetch = Date.now() - 400000; // > 5 minutes

      const markets = await client.getMarkets();
      expect(markets.length).toBeGreaterThan(0);

      // Cache should be refreshed
      const lastFetch = (client as any).lastMarketsFetch;
      expect(lastFetch).toBeGreaterThan(Date.now() - 60000); // Within last minute
    }, 15000);
  });

  describe('Performance', () => {
    it('should fetch markets in reasonable time', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const startTime = Date.now();
      await client.getMarkets();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000); // Should complete in < 10s
    }, 15000);

    it('should fetch price quickly', async () => {
      if (SKIP_INTEGRATION_TESTS) return;

      const markets = await client.getMarkets();
      const market = markets.find(m => m.asset_kind === 'PERP');

      if (market) {
        const startTime = Date.now();
        await client.getPrice(market.symbol);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(5000); // Should complete in < 5s
      }
    }, 15000);
  });
});

describe('Paradex Real Trading Integration (Requires Funds)', () => {
  // These tests require actual testnet USDC and should be run manually
  const RUN_TRADING_TESTS = process.env.RUN_TRADING_TESTS === 'true';

  if (!RUN_TRADING_TESTS) {
    it.skip('Trading tests disabled (set RUN_TRADING_TESTS=true to enable)', () => {});
    return;
  }

  let client: ParadexClient;

  beforeAll(async () => {
    client = new ParadexClient({
      enabled: true,
      environment: 'testnet',
      privateKey: process.env.PARADEX_PRIVATE_KEY!,
      apiBaseUrl: 'https://api.testnet.paradex.trade',
    });

    await client.initialize();
  }, 30000);

  describe('Order Placement', () => {
    it('should place a market order', async () => {
      // Find a low-value market for testing
      const markets = await client.getMarkets();
      const testMarket = markets.find(m => 
        m.asset_kind === 'PERP' && 
        parseFloat(m.min_notional) < 50
      );

      if (!testMarket) {
        console.log('No suitable test market found');
        return;
      }

      const minSize = parseFloat(testMarket.order_size_increment);
      
      const result = await client.placeMarketOrder(
        testMarket.symbol,
        'BUY',
        minSize,
        false
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.orderId).toBeDefined();
        expect(result.filledQuantity).toBeGreaterThan(0);
      }
    }, 30000);
  });
});
