# Paradex Integration Setup Guide

This guide walks you through setting up FlashScalper with Paradex perpetual futures exchange.

## Prerequisites

1. **Paradex Account**: Sign up at [paradex.trade](https://paradex.trade)
2. **Testnet Access**: For testing, use [testnet.paradex.trade](https://testnet.paradex.trade)
3. **API Credentials**: Generate API key, secret, and bearer token from Paradex dashboard

## Configuration

### 1. Environment Variables

Create or update your `.env` file with Paradex credentials:

```bash
# Exchange Selection
EXCHANGE=paradex

# Paradex Credentials
PARADEX_API_KEY=your_api_key_here
PARADEX_SECRET_KEY=your_secret_key_here
PARADEX_BEARER_TOKEN=your_bearer_token_here

# Paradex Endpoints (defaults to testnet)
PARADEX_REST_URL=https://api.testnet.paradex.trade
PARADEX_WS_URL=wss://ws.api.testnet.paradex.trade/v1

# Trading Configuration (optional - adjust as needed)
SCALPER_LEVERAGE=10
SCALPER_POSITION_SIZE_PERCENT=25
SCALPER_MAX_POSITIONS=5
SCALPER_TAKE_PROFIT_ROE=1.0
SCALPER_STOP_LOSS_ROE=-0.5
```

### 2. Market Selection

Paradex uses different symbol formats than other exchanges:

| Internal Symbol | Paradex Market |
|----------------|---------------|
| ETHUSDT        | ETH-USD-PERP  |
| BTCUSDT        | BTC-USD-PERP  |
| SOLUSDT        | SOL-USD-PERP  |
| XRPUSDT        | XRP-USD-PERP  |

The system automatically maps internal symbols to Paradex markets.

### 3. Production Setup

For production (mainnet), update the endpoints:

```bash
PARADEX_REST_URL=https://api.paradex.trade
PARADEX_WS_URL=wss://ws.api.paradex.trade/v1
```

## Usage

### Standalone Mode (Recommended)

Run the scalper with Paradex integration:

```bash
# Build the project
npm run build

# Start the scalper
npm run start:scalper
```

The scalper will:
1. Connect to Paradex WebSocket for real-time market data
2. Aggregate trades into klines (candlesticks)
3. Generate trading signals
4. Execute orders via Paradex REST API
5. Monitor positions and manage exits

### Programmatic Usage

#### Using the Exchange Factory

```typescript
import { ExchangeFactory } from './src/services/execution';

// Create Paradex client from environment
const client = ExchangeFactory.createFromEnv();

// Get account balance
const { balance, unrealizedPnL } = await client.getBalance();
console.log(`Balance: $${balance}, Unrealized PnL: $${unrealizedPnL}`);

// Get current price
const price = await client.getPrice('ETHUSDT');
console.log(`ETH Price: $${price}`);

// Place market order
const result = await client.placeMarketOrder('ETHUSDT', 'BUY', 0.1);
if (result.success) {
  console.log(`Order filled at $${result.filledPrice}`);
}
```

#### Using WebSocket for Real-Time Data

```typescript
import { ParadexWebSocketClient } from './src/services/execution';
import { ParadexKlineBuilder } from './src/services/execution';

// Create WebSocket client
const wsClient = new ParadexWebSocketClient(
  'wss://ws.api.testnet.paradex.trade/v1',
  'your_bearer_token'
);

// Create kline builder
const klineBuilder = new ParadexKlineBuilder('5m', 100);

// Connect and subscribe
await wsClient.connect();
await wsClient.subscribeTrades('ETH-USD-PERP');

// Listen for trades and build klines
wsClient.on('trade', (trade) => {
  klineBuilder.processTrade(trade);
  
  // Get current kline
  const currentKline = klineBuilder.getCurrentKline('ETH-USD-PERP');
  console.log('Current 5m candle:', currentKline);
  
  // Get historical klines
  const klines = klineBuilder.getKlines('ETH-USD-PERP', 50);
  console.log(`Have ${klines.length} klines`);
});

// Handle errors
wsClient.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle reconnection
wsClient.on('reconnected', () => {
  console.log('WebSocket reconnected');
});
```

## Architecture

### Data Flow

```
Paradex Exchange
    ↓ (WebSocket)
Trades Stream → Kline Builder → Technical Analysis → Signal Generation
    ↑ (REST API)
Order Execution
```

### Components

1. **ParadexWebSocketClient**: Manages WebSocket connection for real-time data
   - Automatic reconnection with exponential backoff
   - Authentication handling
   - Channel subscriptions
   - Event-driven architecture

2. **ParadexKlineBuilder**: Aggregates trades into klines
   - Supports multiple timeframes (1m, 5m, 15m, 1h, etc.)
   - Maintains kline history
   - Binance-compatible output format

3. **ParadexRestClient**: Handles order execution and account management
   - Authentication with API key and signature
   - Order placement (market and limit)
   - Position management
   - Account balance queries

4. **ExchangeFactory**: Creates appropriate client based on configuration
   - Abstracts exchange-specific implementations
   - Easy switching between exchanges

## Features

### Advantages of Paradex Integration

1. **Real-Time Data**: WebSocket provides lower latency than REST polling
2. **Perpetual Futures**: Trade with leverage on major cryptocurrencies
3. **Live Stream Ready**: Real-time trade data perfect for streaming
4. **Testnet Available**: Risk-free testing with testnet environment

### Supported Operations

- ✅ Real-time price updates via WebSocket
- ✅ Trade streaming and kline aggregation
- ✅ Market and limit order execution
- ✅ Position monitoring and management
- ✅ Account balance queries
- ✅ Leverage configuration
- ✅ Automatic reconnection
- ✅ Error handling and retry logic

## Troubleshooting

### WebSocket Connection Issues

**Problem**: WebSocket fails to connect

**Solutions**:
- Verify bearer token is correct
- Check WebSocket URL (testnet vs mainnet)
- Ensure network allows WebSocket connections
- Check logs for specific error messages

### Authentication Errors

**Problem**: API requests return 401 Unauthorized

**Solutions**:
- Verify API key and secret are correct
- Check signature generation (timestamp should be fresh)
- Ensure API key has required permissions
- Try regenerating API credentials

### Insufficient Data

**Problem**: "Not enough klines" errors

**Solutions**:
- Wait for kline builder to accumulate data (1-5 minutes)
- Reduce `SCALPER_KLINE_COUNT` temporarily
- Check WebSocket is receiving trades
- Verify market is active and has trading volume

### Order Execution Failures

**Problem**: Orders fail or are rejected

**Solutions**:
- Check account has sufficient balance
- Verify leverage is set correctly
- Ensure quantity meets minimum requirements
- Check market is open and tradeable
- Review Paradex API error messages in logs

## Monitoring

### Logs

Monitor the application logs for:
- WebSocket connection status
- Trade events and kline updates
- Order execution results
- Position updates
- Error messages

### Metrics

If Prometheus metrics are enabled (`METRICS_ENABLED=true`), monitor:
- `flashscalper_websocket_connected` - WebSocket connection status
- `flashscalper_trades_processed` - Number of trades processed
- `flashscalper_klines_built` - Number of klines created
- `flashscalper_exchange_requests` - API request metrics
- `flashscalper_exchange_errors` - API error metrics

## Testing

### Test WebSocket Connection

```bash
# Run a quick test to verify WebSocket connection
node -e "
const { ParadexWebSocketClient } = require('./dist/services/execution');
const client = new ParadexWebSocketClient(
  'wss://ws.api.testnet.paradex.trade/v1',
  process.env.PARADEX_BEARER_TOKEN
);

client.connect().then(() => {
  console.log('✅ Connected successfully');
  client.subscribeTrades('ETH-USD-PERP').then(() => {
    console.log('✅ Subscribed to ETH-USD-PERP');
  });
}).catch((err) => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});

client.on('trade', (trade) => {
  console.log('Trade:', trade.market, trade.price, trade.size);
});

setTimeout(() => {
  client.disconnect();
  console.log('Test complete');
  process.exit(0);
}, 10000);
"
```

### Test REST API

```bash
# Run a quick test to verify REST API
node -e "
const { ExchangeFactory } = require('./dist/services/execution');
const client = ExchangeFactory.create('paradex');

client.getBalance().then((balance) => {
  console.log('✅ Balance:', balance);
  return client.getPrice('ETHUSDT');
}).then((price) => {
  console.log('✅ ETH Price:', price);
}).catch((err) => {
  console.error('❌ API test failed:', err.message);
  process.exit(1);
});
"
```

## Best Practices

1. **Start with Testnet**: Always test with testnet before using real funds
2. **Monitor Logs**: Keep an eye on logs for errors and warnings
3. **Conservative Sizing**: Start with small position sizes
4. **Set Stop Losses**: Always use stop losses to protect capital
5. **Monitor Latency**: High latency can impact scalping performance
6. **Backup Connection**: Have a fallback plan if WebSocket disconnects
7. **Rate Limiting**: Respect Paradex API rate limits
8. **Regular Testing**: Test reconnection and error handling regularly

## Support

For issues specific to:
- **FlashScalper**: Check GitHub issues or README
- **Paradex API**: Visit [docs.paradex.trade](https://docs.paradex.trade)
- **Paradex Support**: Contact Paradex support team

## Next Steps

1. ✅ Set up environment variables
2. ✅ Test WebSocket connection
3. ✅ Test REST API authentication
4. ✅ Run in paper trading mode
5. ✅ Monitor performance
6. ✅ Optimize configuration
7. ⚠️ Deploy to production (use with caution)

---

**Remember**: Trading involves substantial risk. Always test thoroughly and never risk more than you can afford to lose.
