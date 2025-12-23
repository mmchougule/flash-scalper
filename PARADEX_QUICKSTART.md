# Paradex Live Stream Agent - Quick Start

This guide will help you get the Paradex trading agent running in minutes.

## 🚀 Quick Setup

### 1. Prerequisites

- Node.js 18+ installed
- Paradex account (testnet or mainnet)
- API credentials from Paradex

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example configuration:

```bash
cp .env.paradex.example .env
```

Edit `.env` and add your credentials:

```bash
# Required
PARADEX_ACCOUNT_ADDRESS=0x...        # Your Ethereum address
PARADEX_PRIVATE_KEY=0x...            # Your private key
PARADEX_JWT=eyJ...                   # JWT from Paradex API
PARADEX_MARKETS=BTC-USD-PERP,ETH-USD-PERP
```

### 4. Build the Project

```bash
npm run build
```

### 5. Run the Agent

```bash
# Development mode (with hot reload)
npm run start:paradex

# Production mode
npm run start:paradex-prod
```

## 📊 What You'll See

The agent provides a live console display:

```
================================================================================
🚀 PARADEX LIVE TRADING STREAM
================================================================================

📊 AGENT STATUS: RUNNING
💰 Equity: $1,234.56
📈 Daily P&L: $45.23 (3.67%)
💵 Total P&L: $123.45
🎯 Win Rate: 65.2% (15/23)
📍 Positions: 2 open
⏱️  Tick: #156

--------------------------------------------------------------------------------
📌 OPEN POSITIONS:
--------------------------------------------------------------------------------

📈 BTC-USD-PERP
  Side: LONG
  Size: 0.0125
  Entry: $42,150.00
  Current: $42,380.50
  ✅ P&L: $2.88 (1.54% ROE)
  Leverage: 10x
  Hold Time: 12.3 min
```

## 🔑 Getting Paradex Credentials

### Option 1: Use Paradex Testnet (Recommended for Testing)

1. Visit [testnet.paradex.trade](https://testnet.paradex.trade/)
2. Connect your wallet
3. Request testnet USDC from faucet
4. Generate API key in account settings
5. Get JWT token via REST API

### Option 2: Generate JWT Token

Use this script to generate a JWT token:

```bash
# Create a script to get JWT
cat > get-jwt.sh << 'EOF'
#!/bin/bash
ACCOUNT="0x..."  # Your address
PRIVATE_KEY="0x..."  # Your private key
TIMESTAMP=$(date +%s000)

# Sign message (you'll need a signing tool)
MESSAGE="paradex-auth:${ACCOUNT}:${TIMESTAMP}"
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -sign <(echo "$PRIVATE_KEY") | xxd -p -c 256)

# Get JWT
curl -X POST https://api.testnet.paradex.trade/v1/auth/jwt \
  -H "Content-Type: application/json" \
  -d "{
    \"account\": \"$ACCOUNT\",
    \"timestamp\": $TIMESTAMP,
    \"signature\": \"$SIGNATURE\"
  }"
EOF

chmod +x get-jwt.sh
./get-jwt.sh
```

## ⚙️ Configuration Options

### Basic Trading Settings

```bash
# Conservative (Lower Risk)
SCALPER_LEVERAGE=5
SCALPER_POSITION_SIZE_PERCENT=15
SCALPER_MAX_POSITIONS=3
SCALPER_TAKE_PROFIT_ROE=1.5
SCALPER_STOP_LOSS_ROE=-0.3

# Aggressive (Higher Risk)
SCALPER_LEVERAGE=20
SCALPER_POSITION_SIZE_PERCENT=40
SCALPER_MAX_POSITIONS=10
SCALPER_TAKE_PROFIT_ROE=3.0
SCALPER_STOP_LOSS_ROE=-1.0
```

### Markets to Trade

```bash
# Major pairs only
PARADEX_MARKETS=BTC-USD-PERP,ETH-USD-PERP

# Include altcoins
PARADEX_MARKETS=BTC-USD-PERP,ETH-USD-PERP,SOL-USD-PERP,AVAX-USD-PERP
```

### Display Settings

```bash
# Update every 3 seconds
DISPLAY_INTERVAL_MS=3000

# Don't clear console (better for logging)
CLEAR_CONSOLE=false

# More verbose logging
LOG_LEVEL=debug
```

## 🛡️ Safety Tips

1. **Start with Testnet**: Always test on testnet first
2. **Use Small Positions**: Start with minimal position sizes
3. **Set Stop Losses**: Always configure stop-loss limits
4. **Monitor Actively**: Watch the live display regularly
5. **Test Strategies**: Validate your configuration before live trading

## 🐛 Troubleshooting

### "Failed to authenticate"
- Check that your JWT token is valid and not expired
- Generate a new JWT token
- Verify your private key is correct

### "WebSocket connection failed"
- Check your internet connection
- Verify the WebSocket URL is correct
- Ensure firewall allows WebSocket connections

### "Market not found"
- Use correct market symbols (e.g., "BTC-USD-PERP")
- Check available markets on Paradex
- Verify markets are active

### "Insufficient balance"
- Deposit USDC to your Paradex account
- Check collateral requirements
- Reduce position sizes

## 📚 Next Steps

1. **Review Full Documentation**: See [docs/PARADEX_INTEGRATION.md](docs/PARADEX_INTEGRATION.md)
2. **Customize Strategy**: Modify signal generation logic
3. **Set Up Monitoring**: Configure metrics and alerting
4. **Stream to OBS**: Capture console for live streaming

## 🔗 Resources

- **Paradex Documentation**: [docs.paradex.trade](https://docs.paradex.trade/)
- **Paradex API**: [api.paradex.trade](https://api.paradex.trade/)
- **Paradex Testnet**: [testnet.paradex.trade](https://testnet.paradex.trade/)
- **FlashScalper Docs**: [ARCHITECTURE.md](ARCHITECTURE.md)

## ⚠️ Disclaimer

This software is for educational purposes only. Trading involves substantial risk of loss. Never risk more than you can afford to lose. Always test thoroughly on testnet before using real funds.

---

**Happy Trading! 🚀**
