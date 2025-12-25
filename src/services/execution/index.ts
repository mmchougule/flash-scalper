/**
 * Execution Service - Main Entry Point
 */

export * from './exchange-client';
export * from './order-executor';
export * from './paradex-client';
export * from './exchange-abstraction';
export * from './multi-exchange-executor';

import { AsterClient, createAsterClient } from './exchange-client';
import { createParadexClient } from './paradex-client';
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
import { multiExchangeExecutor } from './multi-exchange-executor';
import { exchangeManager } from './exchange-abstraction';

export const executionService = {
  // Legacy (Aster-specific)
  createClient: createAsterClient,
  executeOrder,
  closePosition,
  calculatePositionSize,
  calculateExposure,
  canOpenPosition,
  
  // Paradex-specific
  createParadexClient,
  
  // Multi-exchange
  multiExchangeExecutor,
  exchangeManager,
};

export default executionService;
