/**
 * Paradex Trading Agent for Live Streams
 * Integrates Paradex perpetual futures with FlashScalper strategy
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ParadexRestClient } from './rest-client';
import { ParadexWebSocketClient } from './websocket-client';
import { logger } from '../../utils/logger';
import { agentStatus, updateAgentMetrics } from '../../utils/metrics';
import { generateSignal, getQualifyingSignals } from '../signal';
import { calculateAllIndicators, parseKlines } from '../signal/technical-analysis';
import type {
  ParadexAuth,
  ParadexTicker,
  ParadexPosition as ParadexPosAPI,
  ParadexOrder,
  ParadexMarketInfo,
} from './types';
import type {
  Position,
  ScalperConfig,
  Signal,
  TechnicalIndicators,
  Kline,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export interface ParadexAgentConfig {
  auth: ParadexAuth;
  jwt: string;
  restUrl?: string;
  wsUrl?: string;
  markets: string[]; // e.g., ['BTC-USD-PERP', 'ETH-USD-PERP']
  scalperConfig: ScalperConfig;
  agentId?: string;
  userId?: string;
}

export interface ParadexAgentState {
  agentId: string;
  userId: string;
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error';
  equity: number;
  startingEquity: number;
  dailyStartEquity: number;
  dailyPnL: number;
  totalPnL: number;
  positions: Map<string, Position>;
  tickCount: number;
  lastScanTime: number;
  totalTrades: number;
  winningTrades: number;
  lastTickTime: number;
  config: ScalperConfig;
  marketInfo: Map<string, ParadexMarketInfo>;
  priceCache: Map<string, { price: number; timestamp: number }>;
}

// =============================================================================
// PARADEX TRADING AGENT
// =============================================================================

export class ParadexTradingAgent extends EventEmitter {
  private restClient: ParadexRestClient;
  private wsClient: ParadexWebSocketClient;
  private state: ParadexAgentState;
  private config: ParadexAgentConfig;
  private tickInterval?: NodeJS.Timeout;
  private scanInterval?: NodeJS.Timeout;
  private isInitialized: boolean = false;

  constructor(config: ParadexAgentConfig) {
    super();
    this.config = config;

    // Initialize clients
    this.restClient = new ParadexRestClient(config.auth, config.restUrl);
    this.wsClient = new ParadexWebSocketClient(config.wsUrl, config.auth, config.jwt);

    // Initialize state
    this.state = {
      agentId: config.agentId || `paradex-${uuidv4().slice(0, 8)}`,
      userId: config.userId || 'system',
      status: 'starting',
      equity: 0,
      startingEquity: 0,
      dailyStartEquity: 0,
      dailyPnL: 0,
      totalPnL: 0,
      positions: new Map(),
      tickCount: 0,
      lastScanTime: 0,
      totalTrades: 0,
      winningTrades: 0,
      lastTickTime: Date.now(),
      config: config.scalperConfig,
      marketInfo: new Map(),
      priceCache: new Map(),
    };

    // Setup WebSocket event handlers
    this.setupWebSocketHandlers();
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn({ agentId: this.state.agentId }, 'Agent already initialized');
      return;
    }

    logger.info(
      {
        agentId: this.state.agentId,
        markets: this.config.markets,
        leverage: this.config.scalperConfig.leverage,
      },
      'Initializing Paradex trading agent'
    );

    try {
      // 1. Connect WebSocket
      await this.wsClient.connect();

      // 2. Load market info
      await this.loadMarketInfo();

      // 3. Get initial balance
      const balance = await this.restClient.getBalance();
      this.state.equity = balance.balance;
      this.state.startingEquity = balance.balance;
      this.state.dailyStartEquity = balance.balance;

      logger.info(
        {
          agentId: this.state.agentId,
          equity: this.state.equity,
          markets: this.config.markets.length,
        },
        'Paradex agent initialized successfully'
      );

      // 4. Sync existing positions
      await this.syncPositions();

      // 5. Subscribe to WebSocket channels
      await this.subscribeToChannels();

      this.isInitialized = true;
      this.state.status = 'running';
      agentStatus.set({ agent_id: this.state.agentId, status: 'running' }, 1);

      this.emit('initialized', this.state);
    } catch (error: any) {
      logger.error({ error: error.message, agentId: this.state.agentId }, 'Failed to initialize agent');
      this.state.status = 'error';
      throw error;
    }
  }

  /**
   * Load market information for all configured markets
   */
  private async loadMarketInfo(): Promise<void> {
    logger.info({ markets: this.config.markets }, 'Loading market information');

    for (const market of this.config.markets) {
      try {
        const response = await this.restClient.getMarket(market);
        
        if (response.success && response.data) {
          this.state.marketInfo.set(market, response.data);
          logger.debug({ market, info: response.data }, 'Loaded market info');
        } else {
          logger.warn({ market, error: response.error }, 'Failed to load market info');
        }
      } catch (error: any) {
        logger.error({ market, error: error.message }, 'Error loading market info');
      }
    }
  }

  /**
   * Subscribe to WebSocket channels
   */
  private async subscribeToChannels(): Promise<void> {
    logger.info('Subscribing to WebSocket channels');

    // Subscribe to private channels
    await this.wsClient.subscribePositions();
    await this.wsClient.subscribeOrders();
    await this.wsClient.subscribeFills();
    await this.wsClient.subscribeAccount();

    // Subscribe to public channels for each market
    for (const market of this.config.markets) {
      await this.wsClient.subscribeTicker(market);
      await this.wsClient.subscribeTrades(market);
    }

    logger.info(
      { privateChannels: 4, publicChannels: this.config.markets.length * 2 },
      'Subscribed to all channels'
    );
  }

  // =============================================================================
  // WEBSOCKET EVENT HANDLERS
  // =============================================================================

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    // Connection events
    this.wsClient.on('connected', () => {
      logger.info({ agentId: this.state.agentId }, 'WebSocket connected');
      this.emit('ws_connected');
    });

    this.wsClient.on('disconnected', ({ code, reason }) => {
      logger.warn({ agentId: this.state.agentId, code, reason }, 'WebSocket disconnected');
      this.emit('ws_disconnected', { code, reason });
    });

    this.wsClient.on('error', (error: Error) => {
      logger.error({ agentId: this.state.agentId, error: error.message }, 'WebSocket error');
      this.emit('ws_error', error);
    });

    // Market data events
    this.wsClient.on('ticker', (ticker: ParadexTicker) => {
      this.handleTickerUpdate(ticker);
    });

    // Account events
    this.wsClient.on('positions', (position: ParadexPosAPI) => {
      this.handlePositionUpdate(position);
    });

    this.wsClient.on('orders', (order: ParadexOrder) => {
      this.handleOrderUpdate(order);
    });

    this.wsClient.on('account', (account: any) => {
      if (account.equity) {
        this.state.equity = parseFloat(account.equity);
      }
    });
  }

  /**
   * Handle ticker update from WebSocket
   */
  private handleTickerUpdate(ticker: ParadexTicker): void {
    const price = parseFloat(ticker.last_price);
    this.state.priceCache.set(ticker.market, {
      price,
      timestamp: ticker.timestamp,
    });

    // Emit for external consumers (e.g., live stream display)
    this.emit('ticker', ticker);

    // Check if any position needs updating
    this.updatePositionPrices(ticker.market, price);
  }

  /**
   * Handle position update from WebSocket
   */
  private handlePositionUpdate(apiPosition: ParadexPosAPI): void {
    logger.debug({ market: apiPosition.market, size: apiPosition.size }, 'Position update received');

    // Convert Paradex position to internal Position format
    const position = this.convertPosition(apiPosition);
    
    if (position) {
      this.state.positions.set(apiPosition.market, position);
      this.emit('position_update', position);
    } else {
      // Position closed
      this.state.positions.delete(apiPosition.market);
      this.emit('position_closed', apiPosition.market);
    }
  }

  /**
   * Handle order update from WebSocket
   */
  private handleOrderUpdate(order: ParadexOrder): void {
    logger.debug(
      { orderId: order.id, market: order.market, status: order.status },
      'Order update received'
    );
    this.emit('order_update', order);
  }

  // =============================================================================
  // POSITION MANAGEMENT
  // =============================================================================

  /**
   * Sync positions from exchange
   */
  async syncPositions(): Promise<void> {
    try {
      const response = await this.restClient.getPositions();
      
      if (!response.success || !response.data) {
        logger.warn({ error: response.error }, 'Failed to sync positions');
        return;
      }

      logger.info({ count: response.data.length }, 'Syncing positions from exchange');

      for (const apiPos of response.data) {
        const position = this.convertPosition(apiPos);
        if (position) {
          this.state.positions.set(apiPos.market, position);
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error syncing positions');
    }
  }

  /**
   * Convert Paradex position to internal Position format
   */
  private convertPosition(apiPos: ParadexPosAPI): Position | null {
    const size = parseFloat(apiPos.size);
    if (size === 0) {
      return null;
    }

    const side = apiPos.side === 'long' ? 'long' : 'short';
    const entryPrice = parseFloat(apiPos.entry_price);
    const currentPrice = parseFloat(apiPos.mark_price);
    const unrealizedPnl = parseFloat(apiPos.unrealized_pnl);
    const marginUsed = parseFloat(apiPos.margin_used);
    const leverage = parseFloat(apiPos.leverage);

    // Calculate ROE
    const unrealizedROE = (unrealizedPnl / marginUsed) * 100;

    return {
      id: `${this.state.agentId}-${apiPos.market}-${Date.now()}`,
      agentId: this.state.agentId,
      userId: this.state.userId,
      symbol: apiPos.market,
      side,
      size,
      entryPrice,
      currentPrice,
      leverage,
      marginUsed,
      unrealizedPnl,
      unrealizedROE,
      highestROE: unrealizedROE,
      lowestROE: unrealizedROE,
      openedAt: apiPos.timestamp,
      updatedAt: Date.now(),
    };
  }

  /**
   * Update position prices when ticker updates arrive
   */
  private updatePositionPrices(market: string, price: number): void {
    const position = this.state.positions.get(market);
    if (!position) {
      return;
    }

    // Update current price
    position.currentPrice = price;

    // Recalculate P&L and ROE
    const priceChange = position.side === 'long' 
      ? price - position.entryPrice 
      : position.entryPrice - price;
    
    position.unrealizedPnl = priceChange * position.size;
    position.unrealizedROE = (position.unrealizedPnl / position.marginUsed) * 100;

    // Update highest/lowest ROE
    position.highestROE = Math.max(position.highestROE, position.unrealizedROE);
    position.lowestROE = Math.min(position.lowestROE, position.unrealizedROE);
    position.updatedAt = Date.now();

    // Check exit conditions
    this.checkPositionExitConditions(position);
  }

  /**
   * Check if position should be closed based on exit conditions
   */
  private checkPositionExitConditions(position: Position): void {
    const config = this.state.config;

    // Stop loss check
    if (position.unrealizedROE <= config.stopLossROE) {
      logger.info(
        {
          symbol: position.symbol,
          roe: position.unrealizedROE.toFixed(2),
          stopLoss: config.stopLossROE,
        },
        'Stop loss triggered'
      );
      this.closePosition(position, 'stop_loss');
      return;
    }

    // Take profit check
    const takeProfitTarget = config.takeProfitROE;
    if (position.unrealizedROE >= takeProfitTarget) {
      logger.info(
        {
          symbol: position.symbol,
          roe: position.unrealizedROE.toFixed(2),
          takeProfit: takeProfitTarget,
        },
        'Take profit triggered'
      );
      this.closePosition(position, 'take_profit');
      return;
    }

    // Max hold time check
    const holdTimeMinutes = (Date.now() - position.openedAt) / 60000;
    if (holdTimeMinutes >= config.maxHoldTimeMinutes) {
      logger.info(
        {
          symbol: position.symbol,
          holdTime: holdTimeMinutes.toFixed(1),
          maxHoldTime: config.maxHoldTimeMinutes,
        },
        'Max hold time reached'
      );
      this.closePosition(position, 'max_hold_time');
      return;
    }
  }

  /**
   * Close a position
   */
  private async closePosition(position: Position, reason: string): Promise<void> {
    try {
      logger.info(
        {
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          roe: position.unrealizedROE.toFixed(2),
          reason,
        },
        'Closing position'
      );

      // Place market order to close position
      const closeSide = position.side === 'long' ? 'sell' : 'buy';
      const response = await this.restClient.placeMarketOrder(
        position.symbol,
        closeSide,
        position.size.toString(),
        true // reduce_only
      );

      if (response.success && response.data) {
        logger.info(
          { orderId: response.data.id, symbol: position.symbol },
          'Position close order placed'
        );

        // Update stats
        this.state.totalTrades++;
        this.state.dailyPnL += position.unrealizedPnl;
        this.state.totalPnL += position.unrealizedPnl;

        if (position.unrealizedPnl > 0) {
          this.state.winningTrades++;
        }

        // Remove from positions
        this.state.positions.delete(position.symbol);

        this.emit('position_closed', {
          position,
          reason,
          pnl: position.unrealizedPnl,
          roe: position.unrealizedROE,
        });
      } else {
        logger.error(
          { error: response.error, symbol: position.symbol },
          'Failed to close position'
        );
      }
    } catch (error: any) {
      logger.error(
        { error: error.message, symbol: position.symbol },
        'Error closing position'
      );
    }
  }

  // =============================================================================
  // SIGNAL SCANNING & EXECUTION
  // =============================================================================

  /**
   * Scan markets for trading signals
   */
  async scanForSignals(): Promise<void> {
    if (this.state.status !== 'running') {
      return;
    }

    const now = Date.now();
    const scanIntervalMs = this.state.config.scanIntervalTicks * this.state.config.tickIntervalMs;
    
    if (now - this.state.lastScanTime < scanIntervalMs) {
      return;
    }

    this.state.lastScanTime = now;

    logger.debug({ markets: this.config.markets.length }, 'Scanning for signals');

    // Check if we can open more positions
    if (this.state.positions.size >= this.state.config.maxPositions) {
      logger.debug('Max positions reached, skipping scan');
      return;
    }

    // Scan each market
    for (const market of this.config.markets) {
      // Skip if we already have a position in this market
      if (this.state.positions.has(market)) {
        continue;
      }

      try {
        await this.scanMarket(market);
      } catch (error: any) {
        logger.error({ market, error: error.message }, 'Error scanning market');
      }
    }
  }

  /**
   * Scan a specific market for signals
   */
  private async scanMarket(market: string): Promise<void> {
    // Note: Paradex candle endpoint would need to be implemented
    // For now, we'll use a simplified approach with ticker data
    
    // Get current price from cache
    const cached = this.state.priceCache.get(market);
    if (!cached) {
      logger.debug({ market }, 'No price data available yet');
      return;
    }

    // In a full implementation, you would:
    // 1. Fetch historical candles from Paradex
    // 2. Calculate technical indicators
    // 3. Generate signal using existing signal generation logic
    // 4. Execute order if signal qualifies

    // Placeholder for signal generation
    logger.debug({ market, price: cached.price }, 'Market scanned (candle data needed for full analysis)');
  }

  /**
   * Execute an order based on a signal
   */
  private async executeSignal(market: string, signal: Signal): Promise<void> {
    try {
      const marketInfo = this.state.marketInfo.get(market);
      if (!marketInfo) {
        logger.warn({ market }, 'Market info not available');
        return;
      }

      // Calculate position size
      const positionSizeUSD = (this.state.equity * this.state.config.positionSizePercent) / 100;
      const price = parseFloat((await this.restClient.getTicker(market)).data?.last_price || '0');
      const size = positionSizeUSD / price;

      // Round to market's step size
      const roundedSize = this.roundToStepSize(size, marketInfo.step_size);

      // Place market order
      const side = signal.type === 'LONG' ? 'buy' : 'sell';
      const response = await this.restClient.placeMarketOrder(market, side, roundedSize.toString());

      if (response.success && response.data) {
        logger.info(
          {
            market,
            side,
            size: roundedSize,
            confidence: signal.confidence,
          },
          'Order executed successfully'
        );

        this.emit('order_executed', {
          signal,
          order: response.data,
        });
      } else {
        logger.error({ market, error: response.error }, 'Order execution failed');
      }
    } catch (error: any) {
      logger.error({ market, error: error.message }, 'Error executing signal');
    }
  }

  /**
   * Round size to market's step size
   */
  private roundToStepSize(size: number, stepSize: string): number {
    const step = parseFloat(stepSize);
    return Math.floor(size / step) * step;
  }

  // =============================================================================
  // MAIN LOOP
  // =============================================================================

  /**
   * Start the trading agent
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.state.status === 'running') {
      logger.warn({ agentId: this.state.agentId }, 'Agent already running');
      return;
    }

    logger.info({ agentId: this.state.agentId }, 'Starting Paradex trading agent');
    this.state.status = 'running';

    // Start tick interval for position monitoring
    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.state.config.tickIntervalMs);

    // Start scan interval for signal generation
    this.scanInterval = setInterval(() => {
      this.scanForSignals();
    }, this.state.config.scanIntervalTicks * this.state.config.tickIntervalMs);

    this.emit('started', this.state);
  }

  /**
   * Stop the trading agent
   */
  async stop(): Promise<void> {
    logger.info({ agentId: this.state.agentId }, 'Stopping Paradex trading agent');

    this.state.status = 'stopped';

    // Stop intervals
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    // Disconnect WebSocket
    this.wsClient.disconnect();

    agentStatus.set({ agent_id: this.state.agentId, status: 'stopped' }, 0);

    this.emit('stopped', this.state);
  }

  /**
   * Tick function - runs periodically to update state
   */
  private tick(): void {
    this.state.tickCount++;
    this.state.lastTickTime = Date.now();

    // Update metrics
    const exposure = this.calculateExposure();
    const maxExposure = (this.state.equity * this.state.config.maxExposurePercent) / 100;
    const drawdown = this.state.startingEquity > 0
      ? ((this.state.startingEquity - this.state.equity) / this.state.startingEquity) * 100
      : 0;
    const winRate = this.state.totalTrades > 0 
      ? this.state.winningTrades / this.state.totalTrades 
      : 0;

    updateAgentMetrics(this.state.agentId, this.state.userId, {
      equity: this.state.equity,
      dailyPnL: this.state.dailyPnL,
      drawdown,
      winRate,
      positionCount: this.state.positions.size,
      exposure,
      unrealizedPnL: this.calculateUnrealizedPnL(),
    });

    // Log status periodically
    if (this.state.tickCount % (this.state.config.statusLogInterval || 5) === 0) {
      logger.info(
        {
          agentId: this.state.agentId,
          tickCount: this.state.tickCount,
          equity: this.state.equity.toFixed(2),
          positions: this.state.positions.size,
          dailyPnL: this.state.dailyPnL.toFixed(2),
          winRate: (winRate * 100).toFixed(1) + '%',
        },
        'Agent status'
      );
    }

    this.emit('tick', this.state);
  }

  /**
   * Calculate total exposure across all positions
   */
  private calculateExposure(): number {
    let totalExposure = 0;
    for (const position of this.state.positions.values()) {
      totalExposure += position.size * position.currentPrice;
    }
    return totalExposure;
  }

  /**
   * Calculate total unrealized P&L
   */
  private calculateUnrealizedPnL(): number {
    let totalPnL = 0;
    for (const position of this.state.positions.values()) {
      totalPnL += position.unrealizedPnl;
    }
    return totalPnL;
  }

  // =============================================================================
  // GETTERS
  // =============================================================================

  getState(): ParadexAgentState {
    return { ...this.state };
  }

  getStatus(): string {
    return this.state.status;
  }

  getPositions(): Map<string, Position> {
    return new Map(this.state.positions);
  }

  getEquity(): number {
    return this.state.equity;
  }

  getStats() {
    const winRate = this.state.totalTrades > 0 
      ? this.state.winningTrades / this.state.totalTrades 
      : 0;
    
    return {
      agentId: this.state.agentId,
      status: this.state.status,
      equity: this.state.equity,
      dailyPnL: this.state.dailyPnL,
      totalPnL: this.state.totalPnL,
      positions: this.state.positions.size,
      totalTrades: this.state.totalTrades,
      winningTrades: this.state.winningTrades,
      winRate,
      tickCount: this.state.tickCount,
    };
  }
}
