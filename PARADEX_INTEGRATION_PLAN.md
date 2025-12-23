# Paradex Integration Implementation Plan

## Overview

This document outlines the detailed plan for integrating Paradex perpetual futures trading into the FlashScalper trading system.

## Paradex API Overview

### WebSocket API (Real-time Market Data)
- **URL**: `wss://ws.api.testnet.paradex.trade/v1`
- **Authentication**: Bearer token required
- **Channels**:
  - `trades.{MARKET}` - Real-time trades (e.g., `trades.ETH-USD-PERP`)
  - `orderbook.{MARKET}` - Orderbook updates
  - `markets` - Market information
  - `account` - Account updates (requires auth)
  - `orders` - Order updates (requires auth)
  - `fills` - Fill updates (requires auth)

### REST API (Order Management)
- **Base URL**: `https://api.testnet.paradex.trade`
- **Authentication**: API key + signature
- **Key Endpoints**:
  - `GET /v1/markets` - List all markets
  - `GET /v1/account` - Get account info
  - `GET /v1/positions` - Get positions
  - `POST /v1/orders` - Place order
  - `DELETE /v1/orders/{id}` - Cancel order
  - `GET /v1/orderbook/{market}` - Get orderbook snapshot

### Market Naming Convention
Paradex uses different symbol format:
- Paradex: `ETH-USD-PERP`, `BTC-USD-PERP`
- Current system: `ETHUSDT`, `BTCUSDT`

## Architecture Changes

### 1. Exchange Client Abstraction

Create an abstract base class for exchange clients:

```typescript
// src/services/execution/base-exchange-client.ts
abstract class BaseExchangeClient {
  abstract getBalance(): Promise<{ balance: number; unrealizedPnL: number }>;
  abstract getKlines(symbol: string, interval: string, limit: number): Promise<any[]>;
  abstract getPositions(): Promise<any[]>;
  abstract placeMarketOrder(...): Promise<OrderResult>;
  abstract setLeverage(symbol: string, leverage: number): Promise<void>;
}
```

### 2. Paradex Client Implementation

#### ParadexWebSocketClient
```typescript
// src/services/execution/paradex-websocket-client.ts
class ParadexWebSocketClient {
  - Connect to wss://ws.api.testnet.paradex.trade/v1
  - Authenticate with bearer token
  - Subscribe to channels (trades, orderbook, account)
  - Emit events for price updates, fills, position changes
  - Maintain connection health (ping/pong, reconnect logic)
  - Buffer recent trades for kline generation
}
```

#### ParadexRestClient
```typescript
// src/services/execution/paradex-rest-client.ts
class ParadexRestClient extends BaseExchangeClient {
  - Implement all abstract methods from BaseExchangeClient
  - Handle Paradex API authentication (signature generation)
  - Convert between Paradex and internal data formats
  - Implement rate limiting (Paradex specific)
  - Error handling and retry logic
}
```

### 3. Market Data Adapter

Create adapter to convert WebSocket trades into klines:

```typescript
// src/services/execution/paradex-kline-builder.ts
class ParadexKlineBuilder {
  - Buffer real-time trades from WebSocket
  - Aggregate into kline/candlestick data
  - Support standard intervals (1m, 5m, 15m, 1h)
  - Provide klines in format expected by technical analysis
}
```

### 4. Symbol Mapping

```typescript
// src/services/execution/symbol-mapper.ts
class SymbolMapper {
  // Map internal symbols to Paradex format
  toParadex(symbol: string): string {
    // ETHUSDT -> ETH-USD-PERP
    // BTCUSDT -> BTC-USD-PERP
  }
  
  fromParadex(symbol: string): string {
    // ETH-USD-PERP -> ETHUSDT
    // BTC-USD-PERP -> BTCUSDT
  }
}
```

### 5. Exchange Factory

```typescript
// src/services/execution/exchange-factory.ts
class ExchangeFactory {
  static create(exchange: 'aster' | 'paradex', credentials): BaseExchangeClient {
    switch (exchange) {
      case 'aster':
        return new AsterClient(credentials);
      case 'paradex':
        return new ParadexRestClient(credentials);
    }
  }
}
```

## Implementation Steps

### Phase 1: Core Infrastructure (Priority: HIGH)

#### Step 1.1: Create Base Exchange Client
- [ ] Create `base-exchange-client.ts` with abstract interface
- [ ] Refactor `AsterClient` to extend `BaseExchangeClient`
- [ ] Update type definitions in `types/index.ts`

#### Step 1.2: Add Paradex Configuration
- [ ] Add Paradex config to `config/index.ts`:
  ```typescript
  paradex: {
    apiKey: env.PARADEX_API_KEY || '',
    secretKey: env.PARADEX_SECRET_KEY || '',
    bearerToken: env.PARADEX_BEARER_TOKEN || '',
    restUrl: env.PARADEX_REST_URL || 'https://api.testnet.paradex.trade',
    wsUrl: env.PARADEX_WS_URL || 'wss://ws.api.testnet.paradex.trade/v1',
  }
  ```
- [ ] Update `.env.example` with Paradex variables

#### Step 1.3: Implement Symbol Mapper
- [ ] Create `symbol-mapper.ts`
- [ ] Implement bidirectional symbol conversion
- [ ] Add unit tests for symbol mapping

### Phase 2: WebSocket Integration (Priority: HIGH)

#### Step 2.1: Implement Paradex WebSocket Client
- [ ] Create `paradex-websocket-client.ts`
- [ ] Implement connection management (connect, disconnect, reconnect)
- [ ] Implement authentication flow
- [ ] Implement channel subscriptions
- [ ] Add event emitters for data updates
- [ ] Add connection health monitoring
- [ ] Handle WebSocket errors and reconnection

#### Step 2.2: Implement Kline Builder
- [ ] Create `paradex-kline-builder.ts`
- [ ] Buffer trades from WebSocket
- [ ] Aggregate trades into klines (1m, 5m, 15m, 1h)
- [ ] Match format expected by technical analysis service
- [ ] Add tests for kline aggregation

#### Step 2.3: WebSocket Data Integration
- [ ] Connect WebSocket to main trading loop
- [ ] Replace REST API kline fetching with WebSocket data
- [ ] Add fallback to REST API if WebSocket disconnects
- [ ] Add metrics for WebSocket health

### Phase 3: REST API Integration (Priority: HIGH)

#### Step 3.1: Implement Paradex REST Client
- [ ] Create `paradex-rest-client.ts` extending `BaseExchangeClient`
- [ ] Implement authentication (signature generation)
- [ ] Implement `getBalance()`
- [ ] Implement `getPositions()`
- [ ] Implement `getKlines()` (as fallback)
- [ ] Implement `placeMarketOrder()`
- [ ] Implement `placeLimitOrder()`
- [ ] Implement `cancelOrder()`
- [ ] Implement `setLeverage()`
- [ ] Add data format converters (Paradex ↔ Internal)

#### Step 3.2: Order Execution
- [ ] Integrate Paradex order placement
- [ ] Handle Paradex-specific order responses
- [ ] Map position updates from Paradex
- [ ] Add error handling for Paradex API errors

#### Step 3.3: Position Management
- [ ] Sync Paradex positions
- [ ] Handle Paradex position updates
- [ ] Calculate PnL from Paradex data
- [ ] Monitor positions using Paradex data

### Phase 4: Exchange Factory & Integration (Priority: MEDIUM)

#### Step 4.1: Create Exchange Factory
- [ ] Create `exchange-factory.ts`
- [ ] Implement factory pattern for exchange selection
- [ ] Support runtime exchange switching

#### Step 4.2: Update Scalper Strategy
- [ ] Update `scalper-strategy.ts` to use exchange factory
- [ ] Add exchange selection from environment variable
- [ ] Maintain backward compatibility with Aster

#### Step 4.3: Configuration Updates
- [ ] Add `EXCHANGE` env variable (default: 'aster')
- [ ] Add exchange-specific coin lists
- [ ] Update coin configs for Paradex markets

### Phase 5: Testing & Validation (Priority: HIGH)

#### Step 5.1: Unit Tests
- [ ] Test Paradex WebSocket client
- [ ] Test Paradex REST client
- [ ] Test symbol mapper
- [ ] Test kline builder
- [ ] Test authentication flows

#### Step 5.2: Integration Tests
- [ ] Test WebSocket connection and data flow
- [ ] Test order placement and execution
- [ ] Test position synchronization
- [ ] Test error handling and reconnection

#### Step 5.3: Live Testing
- [ ] Test on Paradex testnet
- [ ] Verify market data accuracy
- [ ] Verify order execution
- [ ] Monitor performance and latency

### Phase 6: Documentation (Priority: MEDIUM)

#### Step 6.1: Code Documentation
- [ ] Add JSDoc comments to all new classes
- [ ] Document Paradex-specific behavior
- [ ] Add inline comments for complex logic

#### Step 6.2: User Documentation
- [ ] Update README.md with Paradex setup instructions
- [ ] Create PARADEX_SETUP.md guide
- [ ] Add example configurations
- [ ] Document symbol mapping

#### Step 6.3: Architecture Documentation
- [ ] Update ARCHITECTURE.md
- [ ] Add Paradex integration diagrams
- [ ] Document WebSocket data flow

## Data Format Mapping

### Kline Data

**Current (Aster/Binance format)**:
```javascript
[
  openTime,     // 0
  open,         // 1
  high,         // 2
  low,          // 3
  close,        // 4
  volume,       // 5
  closeTime,    // 6
  ...
]
```

**Paradex Trades → Klines**:
Trades need to be aggregated into klines:
```javascript
{
  timestamp: number,  // Trade timestamp
  price: number,      // Trade price
  size: number,       // Trade size
  side: 'buy' | 'sell'
}
```

Aggregate into:
```javascript
{
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  closeTime: number
}
```

### Position Data

**Paradex Position**:
```json
{
  "market": "ETH-USD-PERP",
  "side": "LONG" | "SHORT",
  "size": "1.5",
  "entry_price": "2500.00",
  "mark_price": "2510.00",
  "unrealized_pnl": "15.00",
  "margin": "250.00"
}
```

**Internal Position**:
```typescript
{
  symbol: "ETHUSDT",
  side: "long" | "short",
  size: 1.5,
  entryPrice: 2500.00,
  currentPrice: 2510.00,
  unrealizedPnl: 15.00,
  marginUsed: 250.00
}
```

## Configuration

### Environment Variables

```bash
# Exchange Selection
EXCHANGE=paradex  # or 'aster' (default)

# Paradex Credentials
PARADEX_API_KEY=your_api_key
PARADEX_SECRET_KEY=your_secret_key
PARADEX_BEARER_TOKEN=your_bearer_token

# Paradex Endpoints
PARADEX_REST_URL=https://api.testnet.paradex.trade
PARADEX_WS_URL=wss://ws.api.testnet.paradex.trade/v1

# Paradex Markets (Paradex format)
PARADEX_MARKETS=ETH-USD-PERP,BTC-USD-PERP,SOL-USD-PERP
```

### Market Configuration

```typescript
// Paradex market list
export const PARADEX_MARKETS: CoinConfig[] = [
  { symbol: 'ETHUSDT', paradexMarket: 'ETH-USD-PERP', boost: 1.0 },
  { symbol: 'BTCUSDT', paradexMarket: 'BTC-USD-PERP', boost: 1.0 },
  { symbol: 'SOLUSDT', paradexMarket: 'SOL-USD-PERP', boost: 1.1 },
];
```

## WebSocket Connection Flow

```
1. Connect to wss://ws.api.testnet.paradex.trade/v1
2. Send authentication message:
   {
     "jsonrpc": "2.0",
     "method": "auth",
     "params": {
       "bearer": "YOUR_BEARER_TOKEN"
     }
   }
3. Wait for auth response
4. Subscribe to channels:
   {
     "jsonrpc": "2.0",
     "method": "subscribe",
     "params": {
       "channel": "trades.ETH-USD-PERP"
     }
   }
5. Handle incoming messages
6. Maintain connection (ping/pong)
7. Handle reconnection on disconnect
```

## Risk Considerations

### Latency
- WebSocket provides lower latency than REST polling
- Kline aggregation adds minimal latency
- Network issues may require fallback to REST

### Data Quality
- Trades must be properly aggregated into klines
- Handle missing data and gaps
- Validate kline completeness

### Connection Reliability
- Implement exponential backoff for reconnection
- Buffer data during brief disconnections
- Graceful degradation to REST API

### Rate Limiting
- Paradex has different rate limits than Aster
- WebSocket reduces need for REST calls
- Implement Paradex-specific rate limiting

## Success Criteria

- [ ] WebSocket connection stable for 24+ hours
- [ ] Market data latency < 100ms
- [ ] Klines accurately reflect market prices
- [ ] Orders execute successfully on Paradex
- [ ] Positions sync correctly
- [ ] Graceful handling of disconnections
- [ ] System remains backward compatible with Aster

## Timeline

- **Week 1**: Phase 1-2 (Core infrastructure + WebSocket)
- **Week 2**: Phase 3 (REST API integration)
- **Week 3**: Phase 4 (Factory + Integration)
- **Week 4**: Phase 5-6 (Testing + Documentation)

## Next Steps

1. Review and approve this plan
2. Set up Paradex testnet account
3. Obtain API credentials (API key, secret, bearer token)
4. Begin Phase 1 implementation
5. Test WebSocket connection manually before integration

## Resources

- [Paradex Documentation](https://docs.paradex.trade)
- [Paradex API Reference](https://docs.paradex.trade/api)
- [WebSocket API Guide](https://docs.paradex.trade/websocket)
- [Testnet Environment](https://testnet.paradex.trade)
