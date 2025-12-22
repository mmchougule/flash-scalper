# FlashScalper

> ⚠️ **DISCLAIMER**: This software is for educational and research purposes only. **NOT FOR PRODUCTION USE**. Trading involves substantial risk of loss. See [DISCLAIMER.md](DISCLAIMER.md) for full details.

High-performance AI-powered cryptocurrency scalping trading bot with LLM-assisted decision making and adaptive memory learning.

## Features

- **Multi-Indicator Technical Analysis** - RSI, MACD, Bollinger Bands, Stochastic, ROC, Williams %R, ATR, Momentum, Volume analysis
- **LLM-Assisted Signal Confirmation** - Optional structured LLM analysis for entry/exit decisions using OpenRouter API
- **Adaptive Memory System** - Learns from trade history to improve signal quality and adapt to market conditions
- **Pattern Recognition** - Identifies winning vs losing setups from historical data
- **Risk Management** - Stop-loss, take-profit, trailing stops, daily loss limits, position sizing
- **Real-Time Position Monitoring** - Continuous P&L tracking and exit condition evaluation
- **Support/Resistance Analysis** - Optimized entry prices using limit orders
- **Market Regime Detection** - Adapts strategy based on trending, ranging, or volatile market conditions
- **Prometheus Metrics** - Comprehensive observability and monitoring

## Prerequisites

- **Node.js** >= 18.0.0
- **Redis** (optional, for worker mode)
- **Exchange API Keys** (Aster or compatible exchange)
- **OpenRouter API Key** (optional, for LLM features)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Build and run
npm run build
npm run start:scalper
```

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd flashscalper
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   nano .env  # or use your preferred editor
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ASTER_API_KEY` | Exchange API key | `your_api_key` |
| `ASTER_SECRET_KEY` | Exchange secret key | `your_secret_key` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASTER_BASE_URL` | Exchange API base URL | `https://fapi.asterdex.com` |
| `OPENROUTER_API_KEY` | LLM API key (for signal confirmation) | - |
| `OPENROUTER_MODEL` | LLM model to use | `deepseek/deepseek-chat-v3-0324` |
| `LLM_ENABLED` | Enable LLM analysis | `true` |
| `SCALPER_LEVERAGE` | Trading leverage | `10` |
| `SCALPER_POSITION_SIZE_PERCENT` | Position size as % of equity | `25` |
| `SCALPER_MAX_POSITIONS` | Maximum concurrent positions | `20` |
| `SCALPER_TAKE_PROFIT_ROE` | Take profit ROE % | `1.0` |
| `SCALPER_STOP_LOSS_ROE` | Stop loss ROE % | `-0.5` |
| `SCALPER_MAX_HOLD_TIME_MINUTES` | Maximum position hold time | `60` |
| `SCALPER_DAILY_LOSS_LIMIT_PERCENT` | Daily loss limit % | `5` |
| `MEMORY_ENABLED` | Enable adaptive memory system | `true` |
| `MEMORY_MAX_TRADES` | Maximum trades to store in memory | `1000` |
| `REDIS_URL` | Redis connection URL (for worker mode) | `redis://localhost:6379` |
| `LOG_LEVEL` | Logging level | `info` |

See `src/config/index.ts` for all available configuration options.

## Usage

### Standalone Mode (Recommended for Development)

Run the scalper in a single process:

```bash
npm run start:scalper
```

This mode:
- Runs the complete trading loop in one process
- Fetches market data, generates signals, executes orders, and monitors positions
- Logs all activity to console and files
- Supports graceful shutdown (Ctrl+C)

### Worker Mode (For Production Scaling)

Run separate workers for signal generation, execution, and position management:

```bash
# Terminal 1: Signal Worker
npm run start:signal-worker

# Terminal 2: Execution Worker
npm run start:execution-worker

# Terminal 3: Position Worker
npm run start:position-worker

# Or run all workers concurrently
npm run start:all-workers
```

### API Mode (Multi-User)

Start the REST API and WebSocket server:

```bash
npm run start:api
```

## Architecture

FlashScalper supports three deployment modes:

1. **Standalone Mode** - Single-process trading bot (best for development/testing)
2. **Worker Mode** - Distributed BullMQ workers for horizontal scaling
3. **API Mode** - REST API + WebSocket for multi-user access

### System Flow

```
Market Data → Technical Analysis → Signal Generation → LLM Confirmation (optional)
    ↓
Signal Scoring → Risk Checks → Order Execution → Position Monitoring
    ↓
Memory Learning ← Trade History ← Position Closed
```

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Project Structure

```
flashscalper/
├── src/
│   ├── strategies/          # Trading strategies (scalper-strategy.ts)
│   ├── services/
│   │   ├── signal/          # Signal generation and technical analysis
│   │   ├── execution/       # Order execution and exchange client
│   │   ├── position/        # Position management and monitoring
│   │   ├── memory/          # Adaptive memory and learning system
│   │   └── artifacts/       # Run artifact collection
│   ├── config/              # Configuration management
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Logging, metrics, utilities
│   ├── workers/             # BullMQ workers (for worker mode)
│   ├── queues/              # Job queue definitions
│   └── api/                 # REST API server
├── tests/                   # Unit and integration tests
├── dist/                    # Compiled JavaScript (generated)
├── data/                    # Memory persistence data
└── artifacts/               # Trading run artifacts
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/signal-scorer.test.ts
```

Test coverage includes:
- Unit tests for all core services
- Integration tests for LLM and memory systems
- Technical analysis validation
- Risk management logic

## Monitoring

### Prometheus Metrics

Metrics are available at `http://localhost:9090/metrics` (when metrics server is enabled):

- `flashscalper_trades_total` - Total trades by result
- `flashscalper_trade_pnl_usd` - Trade PnL histogram
- `flashscalper_signals_total` - Signals generated
- `flashscalper_agent_equity_usd` - Agent equity
- `flashscalper_llm_latency_ms` - LLM API latency
- And many more...

### Logging

Structured JSON logging with Pino:
- Development: Pretty-printed console output
- Production: JSON logs for log aggregation systems
- Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## Memory System

FlashScalper includes an adaptive memory system that learns from trade history:

- **Trade History Memory** - Stores completed trades with full context
- **Pattern Learning** - Identifies winning vs losing signal patterns
- **Market Regime Memory** - Tracks and adapts to different market conditions
- **Symbol Intelligence** - Learns which symbols perform better
- **Adaptive Filters** - Dynamically adjusts signal filters based on performance

Memory is persisted to disk and automatically loaded on startup.

## Risk Management

Built-in risk management features:

- **Position Sizing** - Dynamic sizing based on signal confidence and recent performance
- **Stop Loss** - Configurable ROE-based stop loss with early triggers
- **Take Profit** - Target-based profit taking
- **Trailing Stops** - Dynamic stop adjustment for favorable moves
- **Daily Loss Limits** - Automatic shutdown on excessive losses
- **Max Positions** - Limits concurrent exposure
- **Max Hold Time** - Prevents positions from being held too long

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key points:
- This is experimental software for educational purposes
- Follow existing code patterns and style
- Add tests for new features
- Update documentation as needed

## License & Disclaimer

- **License**: MIT License - See [LICENSE](LICENSE) for details
- **Disclaimer**: **NOT FOR PRODUCTION USE** - See [DISCLAIMER.md](DISCLAIMER.md) for important warnings

**Important**: This software is for educational and research purposes only. Trading involves substantial risk of loss. Always test with paper trading first and never risk more than you can afford to lose.

## Support

- **Documentation**: See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation
- **Issues**: Report bugs or request features via GitHub Issues
- **Contributions**: See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute

## Acknowledgments

Built with:
- TypeScript for type safety
- Pino for structured logging
- Prometheus for metrics
- BullMQ for job queues
- OpenRouter for LLM access

---

**Remember**: Always start with paper trading and small amounts. Monitor closely and understand the code before using real funds.
