/**
 * Paradex API Types
 * Type definitions for Paradex perpetual futures exchange
 */

// =============================================================================
// AUTHENTICATION
// =============================================================================

export interface ParadexAuth {
  apiKey: string;
  privateKey: string; // For signing messages
  accountAddress: string; // Ethereum address
}

export interface ParadexAuthMessage {
  method: string;
  channel?: string;
  params?: {
    jwt?: string;
    [key: string]: any;
  };
}

// =============================================================================
// MARKET DATA
// =============================================================================

export interface ParadexTicker {
  market: string;
  symbol: string;
  last_price: string;
  bid: string;
  ask: string;
  volume_24h: string;
  price_change_24h: string;
  high_24h: string;
  low_24h: string;
  timestamp: number;
}

export interface ParadexOrderBook {
  market: string;
  bids: [string, string][]; // [price, size]
  asks: [string, string][]; // [price, size]
  timestamp: number;
}

export interface ParadexTrade {
  id: string;
  market: string;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface ParadexCandle {
  market: string;
  resolution: string; // "1m", "5m", "15m", "1h", "4h", "1d"
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  timestamp: number;
}

// =============================================================================
// ACCOUNT & POSITIONS
// =============================================================================

export interface ParadexAccount {
  account_address: string;
  equity: string;
  available_balance: string;
  margin_balance: string;
  unrealized_pnl: string;
  collateral: string;
  total_notional: string;
  leverage: string;
}

export interface ParadexPosition {
  market: string;
  side: 'long' | 'short';
  size: string;
  notional: string;
  entry_price: string;
  mark_price: string;
  liquidation_price: string;
  unrealized_pnl: string;
  realized_pnl: string;
  leverage: string;
  margin_used: string;
  timestamp: number;
}

// =============================================================================
// ORDERS
// =============================================================================

export type ParadexOrderType = 'market' | 'limit' | 'stop_market' | 'stop_limit';
export type ParadexOrderSide = 'buy' | 'sell';
export type ParadexOrderStatus = 
  | 'open' 
  | 'filled' 
  | 'partially_filled' 
  | 'cancelled' 
  | 'rejected';
export type ParadexTimeInForce = 'gtc' | 'ioc' | 'fok' | 'post_only';

export interface ParadexOrderRequest {
  market: string;
  side: ParadexOrderSide;
  type: ParadexOrderType;
  size: string;
  price?: string; // Required for limit orders
  stop_price?: string; // Required for stop orders
  time_in_force?: ParadexTimeInForce;
  reduce_only?: boolean;
  post_only?: boolean;
  client_id?: string;
}

export interface ParadexOrder {
  id: string;
  client_id?: string;
  market: string;
  account: string;
  side: ParadexOrderSide;
  type: ParadexOrderType;
  size: string;
  filled_size: string;
  price?: string;
  stop_price?: string;
  average_fill_price?: string;
  status: ParadexOrderStatus;
  time_in_force: ParadexTimeInForce;
  reduce_only: boolean;
  post_only: boolean;
  created_at: number;
  updated_at: number;
}

export interface ParadexFill {
  id: string;
  order_id: string;
  market: string;
  side: ParadexOrderSide;
  price: string;
  size: string;
  fee: string;
  liquidity: 'maker' | 'taker';
  timestamp: number;
}

// =============================================================================
// WEBSOCKET MESSAGES
// =============================================================================

export interface ParadexWSMessage {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: number;
}

export interface ParadexWSResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: number;
}

export interface ParadexWSSubscription {
  channel: string;
  market?: string;
}

// Channel names
export type ParadexChannel =
  | 'ticker'
  | 'trades'
  | 'orderbook'
  | 'candles'
  | 'orders'
  | 'fills'
  | 'positions'
  | 'account';

// =============================================================================
// SYSTEM INFO
// =============================================================================

export interface ParadexMarketInfo {
  market: string;
  symbol: string;
  base_currency: string;
  quote_currency: string;
  min_order_size: string;
  max_order_size: string;
  tick_size: string;
  step_size: string;
  maker_fee: string;
  taker_fee: string;
  status: 'active' | 'inactive' | 'suspended';
}

export interface ParadexSystemStatus {
  status: 'operational' | 'maintenance' | 'degraded';
  message?: string;
  timestamp: number;
}

// =============================================================================
// API RESPONSE WRAPPERS
// =============================================================================

export interface ParadexAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ParadexPaginatedResponse<T> {
  results: T[];
  cursor?: string;
  has_more: boolean;
}
