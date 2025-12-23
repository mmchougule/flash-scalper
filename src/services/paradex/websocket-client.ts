/**
 * Paradex WebSocket Client
 * Handles WebSocket connections to Paradex for live market data and updates
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import type {
  ParadexAuth,
  ParadexWSMessage,
  ParadexWSResponse,
  ParadexWSSubscription,
  ParadexChannel,
  ParadexTicker,
  ParadexTrade,
  ParadexOrderBook,
  ParadexPosition,
  ParadexOrder,
  ParadexFill,
} from './types';

// =============================================================================
// WEBSOCKET CLIENT
// =============================================================================

export class ParadexWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private auth?: ParadexAuth;
  private jwt?: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private pingInterval?: NodeJS.Timeout;
  private subscriptions: Set<string> = new Set();
  private messageId: number = 0;
  private isAuthenticated: boolean = false;
  private isConnecting: boolean = false;

  constructor(
    url: string = 'wss://ws.api.testnet.paradex.trade/v1',
    auth?: ParadexAuth,
    jwt?: string
  ) {
    super();
    this.url = url;
    this.auth = auth;
    this.jwt = jwt;
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug('WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      logger.debug('WebSocket connection already in progress');
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        logger.info({ url: this.url }, 'Connecting to Paradex WebSocket');
        this.ws = new WebSocket(this.url);

        this.ws.on('open', async () => {
          logger.info('Paradex WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Authenticate if credentials provided
          if (this.jwt) {
            await this.authenticate(this.jwt);
          }

          // Start ping interval to keep connection alive
          this.startPingInterval();

          // Resubscribe to channels
          await this.resubscribe();

          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          logger.error({ error: error.message }, 'Paradex WebSocket error');
          this.emit('error', error);
          
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          logger.warn({ code, reason: reason.toString() }, 'Paradex WebSocket closed');
          this.isConnecting = false;
          this.isAuthenticated = false;
          this.stopPingInterval();
          this.emit('disconnected', { code, reason });

          // Auto-reconnect if not manually closed
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        });
      } catch (error: any) {
        this.isConnecting = false;
        logger.error({ error: error.message }, 'Failed to create WebSocket connection');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.stopPingInterval();
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isAuthenticated = false;
      this.subscriptions.clear();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 60000);
    
    logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Scheduling WebSocket reconnection'
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error({ error: error.message }, 'Reconnection failed');
      });
    }, delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // =============================================================================
  // AUTHENTICATION
  // =============================================================================

  /**
   * Authenticate WebSocket connection
   */
  private async authenticate(jwt: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected');
    }

    const message: ParadexWSMessage = {
      jsonrpc: '2.0',
      method: 'auth',
      params: { jwt },
      id: this.getNextMessageId(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 10000);

      const handler = (response: ParadexWSResponse) => {
        if (response.id === message.id) {
          clearTimeout(timeout);
          this.off('response', handler);

          if (response.error) {
            logger.error({ error: response.error }, 'Authentication failed');
            reject(new Error(response.error.message));
          } else {
            logger.info('WebSocket authenticated');
            this.isAuthenticated = true;
            resolve();
          }
        }
      };

      this.on('response', handler);
      this.send(message);
    });
  }

  // =============================================================================
  // SUBSCRIPTIONS
  // =============================================================================

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: ParadexChannel, market?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected');
    }

    const subscriptionKey = market ? `${channel}:${market}` : channel;
    
    // Check if we need authentication for this channel
    const privateChannels: ParadexChannel[] = ['orders', 'fills', 'positions', 'account'];
    if (privateChannels.includes(channel) && !this.isAuthenticated) {
      throw new Error(`Channel ${channel} requires authentication`);
    }

    const message: ParadexWSMessage = {
      jsonrpc: '2.0',
      method: 'subscribe',
      params: market ? { channel, market } : { channel },
      id: this.getNextMessageId(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscribe timeout'));
      }, 10000);

      const handler = (response: ParadexWSResponse) => {
        if (response.id === message.id) {
          clearTimeout(timeout);
          this.off('response', handler);

          if (response.error) {
            logger.error({ error: response.error, channel, market }, 'Subscribe failed');
            reject(new Error(response.error.message));
          } else {
            logger.debug({ channel, market }, 'Subscribed to channel');
            this.subscriptions.add(subscriptionKey);
            resolve();
          }
        }
      };

      this.on('response', handler);
      this.send(message);
    });
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: ParadexChannel, market?: string): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    const subscriptionKey = market ? `${channel}:${market}` : channel;

    const message: ParadexWSMessage = {
      jsonrpc: '2.0',
      method: 'unsubscribe',
      params: market ? { channel, market } : { channel },
      id: this.getNextMessageId(),
    };

    this.send(message);
    this.subscriptions.delete(subscriptionKey);
    logger.debug({ channel, market }, 'Unsubscribed from channel');
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private async resubscribe(): Promise<void> {
    if (this.subscriptions.size === 0) {
      return;
    }

    logger.info({ count: this.subscriptions.size }, 'Resubscribing to channels');

    for (const sub of this.subscriptions) {
      const [channel, market] = sub.split(':');
      try {
        await this.subscribe(channel as ParadexChannel, market);
      } catch (error: any) {
        logger.error({ error: error.message, channel, market }, 'Resubscribe failed');
      }
    }
  }

  // =============================================================================
  // MESSAGE HANDLING
  // =============================================================================

  /**
   * Send message through WebSocket
   */
  private send(message: ParadexWSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const payload = JSON.stringify(message);
    this.ws.send(payload);
    logger.trace({ message }, 'Sent WebSocket message');
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      logger.trace({ message }, 'Received WebSocket message');

      // Handle response messages (with id)
      if (message.id !== undefined) {
        this.emit('response', message as ParadexWSResponse);
        return;
      }

      // Handle notification messages (no id)
      if (message.method) {
        this.handleNotification(message);
        return;
      }

      // Unknown message format
      logger.debug({ message }, 'Unknown WebSocket message format');
    } catch (error: any) {
      logger.error({ error: error.message, data: data.toString() }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle notification messages (channel updates)
   */
  private handleNotification(message: any): void {
    const { method, params } = message;

    switch (method) {
      case 'ticker':
        this.emit('ticker', params as ParadexTicker);
        break;

      case 'trades':
        this.emit('trades', params as ParadexTrade[]);
        break;

      case 'orderbook':
        this.emit('orderbook', params as ParadexOrderBook);
        break;

      case 'orders':
        this.emit('orders', params as ParadexOrder);
        break;

      case 'fills':
        this.emit('fills', params as ParadexFill);
        break;

      case 'positions':
        this.emit('positions', params as ParadexPosition);
        break;

      case 'account':
        this.emit('account', params);
        break;

      default:
        logger.debug({ method, params }, 'Unknown notification method');
        this.emit('notification', { method, params });
    }
  }

  /**
   * Get next message ID
   */
  private getNextMessageId(): number {
    return ++this.messageId;
  }

  // =============================================================================
  // PING/PONG
  // =============================================================================

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        const message: ParadexWSMessage = {
          jsonrpc: '2.0',
          method: 'ping',
          id: this.getNextMessageId(),
        };
        this.send(message);
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Subscribe to ticker updates for a market
   */
  async subscribeTicker(market: string): Promise<void> {
    return this.subscribe('ticker', market);
  }

  /**
   * Subscribe to trade updates for a market
   */
  async subscribeTrades(market: string): Promise<void> {
    return this.subscribe('trades', market);
  }

  /**
   * Subscribe to orderbook updates for a market
   */
  async subscribeOrderBook(market: string): Promise<void> {
    return this.subscribe('orderbook', market);
  }

  /**
   * Subscribe to account orders (requires auth)
   */
  async subscribeOrders(): Promise<void> {
    return this.subscribe('orders');
  }

  /**
   * Subscribe to account fills (requires auth)
   */
  async subscribeFills(): Promise<void> {
    return this.subscribe('fills');
  }

  /**
   * Subscribe to account positions (requires auth)
   */
  async subscribePositions(): Promise<void> {
    return this.subscribe('positions');
  }

  /**
   * Subscribe to account updates (requires auth)
   */
  async subscribeAccount(): Promise<void> {
    return this.subscribe('account');
  }
}

/**
 * Factory function to create Paradex WebSocket client
 */
export function createParadexWebSocketClient(
  url?: string,
  auth?: ParadexAuth,
  jwt?: string
): ParadexWebSocketClient {
  return new ParadexWebSocketClient(url, auth, jwt);
}
