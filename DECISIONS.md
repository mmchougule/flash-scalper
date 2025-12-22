# Architectural Decision Records

This document records the key architectural decisions made in FlashScalper.

## ADR-001: Simple Agent Prompts vs Tool-Calling Agents

**Status**: Accepted

**Context**: Need agent assistance for trade confirmation, but must be fast and reliable for scalping.

**Decision**: Use simple structured prompts instead of tool-calling agents (LangChain, LangGraph, AutoGPT).

**Consequences**:
- Fast: Typically faster than tool-calling agents
- Reliable: Fewer failure points (no tool calling errors)
- Cost-effective: Simpler prompts are cheaper
- Trade-off: Less sophisticated reasoning, but sufficient for scalping

**Alternatives Considered**:
- Multi-agent systems: Too slow for scalping
- Tool calling agents: Adds latency and failure points
- Reasoning chains: Unnecessary for simple confirmation

## ADR-002: Standalone Mode as Primary

**Status**: Accepted

**Context**: Need simple deployment for single-user use case.

**Decision**: Make standalone mode the primary deployment option, with workers/API as optional scaling paths.

**Consequences**:
- Simple setup: No Redis required
- Easy debugging: Single process
- Trade-off: No horizontal scaling in standalone mode

**Alternatives Considered**:
- Workers-first: Too complex for single-user use case
- API-first: Unnecessary overhead for single user

## ADR-003: Structured Outputs with Zod

**Status**: Accepted

**Context**: Need reliable parsing of agent responses without regex errors.

**Decision**: Use Zod schemas for structured agent output validation.

**Consequences**:
- Type-safe: Compile-time validation
- Reliable: No regex parsing errors
- Fallback: Text parsing if JSON fails

**Alternatives Considered**:
- Regex parsing: Error-prone, hard to maintain
- Manual JSON parsing: No validation

## ADR-004: Resilient Agent Integration

**Status**: Accepted

**Context**: Agent API can fail, rate limit, or timeout. System must continue trading.

**Decision**: Implement retry logic, circuit breaker, and rate limiting for agent calls.

**Consequences**:
- Resilient: System continues trading on agent failures
- Observable: Basic metrics for monitoring
- Trade-off: Additional complexity, but improves system reliability

**Components**:
- Retry with exponential backoff
- Circuit breaker (CLOSED/OPEN/HALF_OPEN)
- Token bucket rate limiter
- Categorized error handling

## ADR-005: Core Indicators Only

**Status**: Accepted

**Context**: Too many indicators can cause signal paralysis. Need fast, clear signals.

**Decision**: Focus on core indicators (EMA, MACD, RSI, Volume, Divergence) and remove redundant oscillators.

**Consequences**:
- Faster: Less computation
- Clearer: Less conflicting signals
- Trade-off: May miss some edge cases, but improves overall signal quality

**Removed Indicators**:
- Bollinger Bands (redundant with RSI)
- Stochastic (redundant with RSI)
- ROC (redundant with momentum)
- Williams %R (redundant with RSI)

## ADR-006: Multi-Indicator Confluence Scoring

**Status**: Accepted

**Context**: Single indicators are unreliable. Need multiple confirmations.

**Decision**: Score signals based on confluence of multiple indicators, with weighted scoring.

**Consequences**:
- Higher quality: Multiple confirmations required
- Configurable: Can adjust weights and thresholds
- Trade-off: May miss some valid signals, but reduces false positives

## ADR-007: Limit Orders at Support/Resistance

**Status**: Accepted

**Context**: Market orders have slippage. Limit orders can get better entry prices.

**Decision**: Use limit orders at support/resistance levels, with fallback to market orders.

**Consequences**:
- Better fills: Reduced slippage
- Trade-off: May not fill if price moves away quickly

**Implementation**:
- Place limit order at support/resistance
- Wait 3 seconds for fill
- Fallback to market order if limit fails

## ADR-008: Integer Precision for Certain Coins

**Status**: Accepted

**Context**: Some coins (AAVEUSDT, UNIUSDT, AVAXUSDT, DOGEUSDT) require integer quantities on the exchange.

**Decision**: Maintain separate precision mapping for coins that require integer quantities.

**Consequences**:
- Correct execution: No precision errors
- Trade-off: Must maintain mapping, but necessary for exchange compatibility

## ADR-009: Time-of-Day Filter (Optional)

**Status**: Accepted

**Context**: Trading during low liquidity hours can have worse fills.

**Decision**: Make time-of-day filter optional, disabled by default for more signals.

**Consequences**:
- Flexible: Can enable for better fills during high liquidity
- More signals: Disabled by default allows trading 24/7
- Trade-off: May have worse fills during low liquidity

## ADR-010: Correlation Filter

**Status**: Accepted

**Context**: Trading highly correlated pairs simultaneously increases portfolio risk.

**Decision**: Filter out signals for correlated pairs if we already have a position.

**Consequences**:
- Risk reduction: Avoids overexposure to correlated assets
- Trade-off: May miss some valid signals

**Implementation**:
- Hardcoded correlation pairs (BTC/ETH/BNB)
- Check existing positions before executing
- Filter signal if correlated position exists

