/**
 * Execution Service - Main Entry Point
 */

export * from './base-exchange-client';
export * from './exchange-client';
export * from './exchange-factory';
export * from './paradex-rest-client';
export * from './paradex-websocket-client';
export * from './paradex-kline-builder';
export * from './symbol-mapper';
export * from './order-executor';

import { AsterClient, createAsterClient } from './exchange-client';
import { ExchangeFactory } from './exchange-factory';
import {
  executeOrder,
  closePosition,
  calculatePositionSize,
  calculateExposure,
  canOpenPosition,
  ExecuteOrderParams,
  ExecuteOrderResult,
  ClosePositionParams,
  ClosePositionResult,
} from './order-executor';

export const executionService = {
  createClient: createAsterClient,
  createExchangeClient: ExchangeFactory.createFromEnv,
  executeOrder,
  closePosition,
  calculatePositionSize,
  calculateExposure,
  canOpenPosition,
};

export default executionService;
