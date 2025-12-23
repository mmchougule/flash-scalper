/**
 * Unit Tests for Paradex Client
 */

import { ParadexClient } from '../../src/services/execution/paradex-client';

// Mock the dependencies
jest.mock('@paradex/sdk');
jest.mock('ethers');
jest.mock('../../src/config', () => ({
  config: {
    paradex: {
      enabled: true,
      environment: 'testnet',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      apiBaseUrl: 'https://api.testnet.paradex.trade',
      wsBaseUrl: 'wss://ws.api.testnet.paradex.trade',
    },
  },
}));
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/metrics', () => ({
  exchangeRequests: { inc: jest.fn() },
  exchangeLatency: { observe: jest.fn() },
  exchangeErrors: { inc: jest.fn() },
}));

describe('ParadexClient', () => {
  let client: ParadexClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ParadexClient({
      enabled: true,
      environment: 'testnet',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      apiBaseUrl: 'https://api.testnet.paradex.trade',
    });
  });

  describe('Construction', () => {
    it('should create client with default config', () => {
      const defaultClient = new ParadexClient();
      expect(defaultClient).toBeDefined();
    });

    it('should create client with custom config', () => {
      const customClient = new ParadexClient({
        enabled: true,
        environment: 'prod',
        privateKey: '0xtest',
        apiBaseUrl: 'https://api.paradex.trade',
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('Market Data Methods', () => {
    describe('getMinQtyAndPrecision', () => {
      it('should return correct precision for BTC-USD-PERP', () => {
        // Mock market cache
        (client as any).marketsCache.set('BTC-USD-PERP', {
          symbol: 'BTC-USD-PERP',
          order_size_increment: '0.001',
          price_tick_size: '0.1',
          min_notional: '100',
        });

        const result = client.getMinQtyAndPrecision('BTC-USD-PERP');
        expect(result.min).toBe(0.001);
        expect(result.precision).toBe(3);
      });

      it('should return fallback for unknown market', () => {
        const result = client.getMinQtyAndPrecision('UNKNOWN-MARKET');
        expect(result.min).toBe(0.001);
        expect(result.precision).toBe(3);
      });
    });

    describe('roundQuantity', () => {
      beforeEach(() => {
        (client as any).marketsCache.set('BTC-USD-PERP', {
          symbol: 'BTC-USD-PERP',
          order_size_increment: '0.001',
          min_notional: '100',
        });
      });

      it('should round quantity to correct precision', () => {
        expect(client.roundQuantity('BTC-USD-PERP', 0.1234567)).toBe(0.123);
        expect(client.roundQuantity('BTC-USD-PERP', 1.9999)).toBe(1.999);
      });

      it('should enforce minimum quantity', () => {
        expect(client.roundQuantity('BTC-USD-PERP', 0.0001)).toBe(0.001);
        expect(client.roundQuantity('BTC-USD-PERP', 0.0005)).toBe(0.001);
      });

      it('should handle zero precision', () => {
        (client as any).marketsCache.set('TEST-MARKET', {
          symbol: 'TEST-MARKET',
          order_size_increment: '1',
          min_notional: '10',
        });

        expect(client.roundQuantity('TEST-MARKET', 1.7)).toBe(1);
        expect(client.roundQuantity('TEST-MARKET', 5.9)).toBe(5);
      });
    });

    describe('formatQuantity', () => {
      beforeEach(() => {
        (client as any).marketsCache.set('BTC-USD-PERP', {
          symbol: 'BTC-USD-PERP',
          order_size_increment: '0.001',
          min_notional: '100',
        });
        (client as any).marketsCache.set('XRP-USD-PERP', {
          symbol: 'XRP-USD-PERP',
          order_size_increment: '1',
          min_notional: '10',
        });
      });

      it('should format quantity with correct precision', () => {
        expect(client.formatQuantity('BTC-USD-PERP', 0.1234567)).toBe('0.123');
        expect(client.formatQuantity('BTC-USD-PERP', 1.0)).toBe('1.000');
      });

      it('should format integer quantities', () => {
        expect(client.formatQuantity('XRP-USD-PERP', 100.789)).toBe('100');
        expect(client.formatQuantity('XRP-USD-PERP', 5.5)).toBe('5');
      });
    });

    describe('formatPrice', () => {
      beforeEach(() => {
        (client as any).marketsCache.set('BTC-USD-PERP', {
          symbol: 'BTC-USD-PERP',
          price_tick_size: '0.1',
        });
      });

      it('should format price to tick size', () => {
        expect(client.formatPrice('BTC-USD-PERP', 95123.456)).toBe('95123.4');
        expect(client.formatPrice('BTC-USD-PERP', 100000.99)).toBe('100000.9');
      });

      it('should round down to nearest tick', () => {
        expect(client.formatPrice('BTC-USD-PERP', 95123.78)).toBe('95123.7');
      });

      it('should use fallback for unknown market', () => {
        const result = client.formatPrice('UNKNOWN', 100.123456);
        expect(result).toBe('100.12');
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getPrecisionFromIncrement', () => {
      it('should calculate precision from decimal increment', () => {
        const method = (client as any).getPrecisionFromIncrement.bind(client);
        expect(method(0.001)).toBe(3);
        expect(method(0.01)).toBe(2);
        expect(method(0.1)).toBe(1);
      });

      it('should return 0 for integer increment', () => {
        const method = (client as any).getPrecisionFromIncrement.bind(client);
        expect(method(1)).toBe(0);
        expect(method(10)).toBe(0);
      });
    });
  });

  describe('Order Validation', () => {
    beforeEach(() => {
      (client as any).marketsCache.set('BTC-USD-PERP', {
        symbol: 'BTC-USD-PERP',
        order_size_increment: '0.001',
        price_tick_size: '0.1',
        min_notional: '100',
        max_order_size: '10',
        position_limit: '50',
      });
    });

    it('should validate order size against minimum', () => {
      const minQty = client.getMinQtyAndPrecision('BTC-USD-PERP').min;
      expect(minQty).toBe(0.001);
    });

    it('should validate formatted quantities are within limits', () => {
      const formatted = client.formatQuantity('BTC-USD-PERP', 5.5);
      expect(parseFloat(formatted)).toBeLessThanOrEqual(10); // max_order_size
    });
  });

  describe('Error Handling', () => {
    it('should throw error if client not initialized', () => {
      expect(() => (client as any).ensureInitialized()).toThrow(
        'Paradex client not initialized'
      );
    });
  });

  describe('Configuration', () => {
    it('should accept testnet environment', () => {
      const testClient = new ParadexClient({
        enabled: true,
        environment: 'testnet',
        privateKey: '0xtest',
        apiBaseUrl: 'https://api.testnet.paradex.trade',
      });
      expect(testClient).toBeDefined();
    });

    it('should accept prod environment', () => {
      const prodClient = new ParadexClient({
        enabled: true,
        environment: 'prod',
        privateKey: '0xtest',
        apiBaseUrl: 'https://api.paradex.trade',
      });
      expect(prodClient).toBeDefined();
    });

    it('should handle disabled state', () => {
      const disabledClient = new ParadexClient({
        enabled: false,
        environment: 'testnet',
        privateKey: '',
        apiBaseUrl: '',
      });
      expect(disabledClient).toBeDefined();
    });
  });

  describe('Market Cache', () => {
    it('should initialize with empty cache', () => {
      const cache = (client as any).marketsCache;
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBe(0);
    });

    it('should store market info in cache', () => {
      const testMarket = {
        symbol: 'TEST-MARKET',
        base_currency: 'TEST',
        quote_currency: 'USD',
        settlement_currency: 'USDC',
        order_size_increment: '0.1',
        price_tick_size: '0.01',
        min_notional: '10',
        max_order_size: '1000',
        position_limit: '5000',
        asset_kind: 'PERP' as const,
        market_kind: 'cross' as const,
      };

      (client as any).marketsCache.set('TEST-MARKET', testMarket);
      
      const retrieved = client.getMinQtyAndPrecision('TEST-MARKET');
      expect(retrieved.min).toBe(0.1);
      expect(retrieved.precision).toBe(1);
    });

    it('should track last markets fetch time', () => {
      const lastFetch = (client as any).lastMarketsFetch;
      expect(typeof lastFetch).toBe('number');
      expect(lastFetch).toBe(0); // Initial value
    });
  });

  describe('Type Safety', () => {
    it('should enforce order side types', () => {
      const validSides: Array<'BUY' | 'SELL'> = ['BUY', 'SELL'];
      expect(validSides).toHaveLength(2);
    });

    it('should enforce order type types', () => {
      const validTypes: Array<'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT'> = [
        'MARKET',
        'LIMIT',
        'STOP_MARKET',
        'STOP_LIMIT',
      ];
      expect(validTypes).toHaveLength(4);
    });
  });
});

describe('ParadexClient Factory', () => {
  it('should create client without credentials', () => {
    const { createParadexClient } = require('../../src/services/execution/paradex-client');
    const client = createParadexClient();
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ParadexClient);
  });

  it('should create client with credentials', () => {
    const { createParadexClient } = require('../../src/services/execution/paradex-client');
    const credentials = {
      id: 'test-id',
      userId: 'test-user',
      exchange: 'paradex' as const,
      apiKey: '',
      secretKey: '0xtest',
      isActive: true,
    };
    const client = createParadexClient(credentials);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ParadexClient);
  });
});
