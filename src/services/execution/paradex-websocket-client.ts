/**
 * Paradex WebSocket Client
 * Handles real-time market data streaming from Paradex
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { executionLogger } from '../../utils/logger';

/**
 * Trade data from Paradex WebSocket
 */
export interface ParadexTrade {
  market: string;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
}

/**
 * WebSocket message types
 */
interface ParadexWSMessage {
  jsonrpc: '2.0';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  id?: number;
}

/**
 * Paradex WebSocket client for real-time market data
 */
export class ParadexWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private bearerToken: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private isConnected: boolean = false;
  private isAuthenticated: boolean = false;
  private subscribedChannels: Set<string> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(wsUrl: string, bearerToken: string) {
    super();
    this.wsUrl = wsUrl;
    this.bearerToken = bearerToken;
  }

  /**
   * Connect to Paradex WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        executionLogger.info({ wsUrl: this.wsUrl }, 'Connecting to Paradex WebSocket');

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          executionLogger.info('Paradex WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Authenticate
          this.authenticate()
            .then(() => {
              this.startPingInterval();
              resolve();
            })
            .catch(reject);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          executionLogger.error({ error: error.message }, 'Paradex WebSocket error');
          this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
          executionLogger.warn({ code, reason: reason.toString() }, 'Paradex WebSocket closed');
          this.isConnected = false;
          this.isAuthenticated = false;
          this.stopPingInterval();
          
          // Attempt reconnection
          this.handleReconnect();
        });

        // Timeout if connection takes too long
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Authenticate with bearer token
   */
  private async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const authMessage: ParadexWSMessage = {
        jsonrpc: '2.0',
        method: 'auth',
        params: {
          bearer: this.bearerToken,
        },
      };

      // Set up one-time listener for auth response
      const authTimeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5000);

      const handleAuthResponse = (message: ParadexWSMessage) => {
        if (message.method === 'auth' || (message.result && message.result.authenticated)) {
          clearTimeout(authTimeout);
          this.isAuthenticated = true;
          executionLogger.info('Paradex WebSocket authenticated');
          
          // Resubscribe to channels if any
          this.resubscribeChannels();
          
          resolve();
        } else if (message.error) {
          clearTimeout(authTimeout);
          reject(new Error(`Authentication failed: ${JSON.stringify(message.error)}`));
        }
      };

      // Listen for next message (auth response)
      this.once('message', handleAuthResponse);

      // Send auth request
      this.send(authMessage);
    });
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string): Promise<void> {
    if (!this.isConnected || !this.isAuthenticated) {
      throw new Error('Not connected or authenticated');
    }

    const subscribeMessage: ParadexWSMessage = {
      jsonrpc: '2.0',
      method: 'subscribe',
      params: {
        channel,
      },
    };

    this.send(subscribeMessage);
    this.subscribedChannels.add(channel);
    
    executionLogger.info({ channel }, 'Subscribed to Paradex channel');
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const unsubscribeMessage: ParadexWSMessage = {
      jsonrpc: '2.0',
      method: 'unsubscribe',
      params: {
        channel,
      },
    };

    this.send(unsubscribeMessage);
    this.subscribedChannels.delete(channel);
    
    executionLogger.info({ channel }, 'Unsubscribed from Paradex channel');
  }

  /**
   * Subscribe to trades for a market
   */
  async subscribeTrades(market: string): Promise<void> {
    await this.subscribe(`trades.${market}`);
  }

  /**
   * Subscribe to orderbook for a market
   */
  async subscribeOrderbook(market: string): Promise<void> {
    await this.subscribe(`orderbook.${market}`);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.stopPingInterval();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
    this.subscribedChannels.clear();
    
    executionLogger.info('Paradex WebSocket disconnected');
  }

  /**
   * Send message to WebSocket
   */
  private send(message: ParadexWSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      executionLogger.warn('Cannot send message, WebSocket not open');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error: any) {
      executionLogger.error({ error: error.message }, 'Failed to send WebSocket message');
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as ParadexWSMessage;
      
      this.emit('message', message);

      // Handle different message types
      if (message.method === 'subscription') {
        this.handleSubscriptionMessage(message);
      } else if (message.error) {
        executionLogger.error({ error: message.error }, 'WebSocket message error');
        this.emit('error', new Error(JSON.stringify(message.error)));
      }
    } catch (error: any) {
      executionLogger.error({ error: error.message }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle subscription data messages
   */
  private handleSubscriptionMessage(message: ParadexWSMessage): void {
    if (!message.params) {
      return;
    }

    const { channel, data } = message.params;

    // Emit trade events
    if (channel && channel.startsWith('trades.')) {
      const market = channel.replace('trades.', '');
      
      if (Array.isArray(data)) {
        for (const trade of data) {
          const paradexTrade: ParadexTrade = {
            market,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp || Date.now(),
          };
          
          this.emit('trade', paradexTrade);
        }
      }
    }

    // Emit orderbook events
    if (channel && channel.startsWith('orderbook.')) {
      const market = channel.replace('orderbook.', '');
      this.emit('orderbook', { market, data });
    }

    // Emit raw channel data
    this.emit('channel', { channel, data });
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      executionLogger.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    executionLogger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Attempting to reconnect'
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
        .then(() => {
          executionLogger.info('Reconnected successfully');
          this.emit('reconnected');
        })
        .catch((error) => {
          executionLogger.error({ error: error.message }, 'Reconnection failed');
          this.handleReconnect();
        });
    }, delay);
  }

  /**
   * Resubscribe to all previously subscribed channels
   */
  private async resubscribeChannels(): Promise<void> {
    for (const channel of this.subscribedChannels) {
      try {
        const subscribeMessage: ParadexWSMessage = {
          jsonrpc: '2.0',
          method: 'subscribe',
          params: {
            channel,
          },
        };
        this.send(subscribeMessage);
        executionLogger.info({ channel }, 'Resubscribed to channel');
      } catch (error: any) {
        executionLogger.error(
          { channel, error: error.message },
          'Failed to resubscribe to channel'
        );
      }
    }
  }

  /**
   * Check if connected
   */
  isConnectedAndAuthenticated(): boolean {
    return this.isConnected && this.isAuthenticated;
  }
}
