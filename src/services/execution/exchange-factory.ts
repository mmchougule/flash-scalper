/**
 * Exchange Factory
 * Creates exchange client instances based on configuration
 */

import { BaseExchangeClient } from './base-exchange-client';
import { AsterClient } from './exchange-client';
import { ParadexRestClient } from './paradex-rest-client';
import { config } from '../../config';
import { executionLogger } from '../../utils/logger';
import type { ExchangeCredentials } from '../../types';

/**
 * Exchange type
 */
export type ExchangeType = 'aster' | 'paradex';

/**
 * Exchange configuration
 */
export interface ExchangeConfig {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
  bearerToken?: string;
}

/**
 * Factory for creating exchange clients
 */
export class ExchangeFactory {
  /**
   * Create exchange client based on type
   */
  static create(
    exchange: ExchangeType = 'aster',
    credentials?: Partial<ExchangeConfig>
  ): BaseExchangeClient {
    executionLogger.info({ exchange }, 'Creating exchange client');

    switch (exchange) {
      case 'aster':
        return new AsterClient({
          apiKey: credentials?.apiKey || config.aster.apiKey,
          secretKey: credentials?.secretKey || config.aster.secretKey,
          baseUrl: credentials?.baseUrl || config.aster.baseUrl,
        });

      case 'paradex':
        return new ParadexRestClient({
          apiKey: credentials?.apiKey || config.paradex.apiKey,
          secretKey: credentials?.secretKey || config.paradex.secretKey,
          restUrl: credentials?.baseUrl || config.paradex.restUrl,
        });

      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * Create exchange client from environment configuration
   */
  static createFromEnv(): BaseExchangeClient {
    const exchange = config.exchange as ExchangeType;
    return this.create(exchange);
  }

  /**
   * Create exchange client from credentials object
   */
  static createFromCredentials(credentials: ExchangeCredentials): BaseExchangeClient {
    const exchange = credentials.exchange as ExchangeType;
    
    return this.create(exchange, {
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      bearerToken: credentials.bearerToken,
    });
  }

  /**
   * Get list of supported exchanges
   */
  static getSupportedExchanges(): ExchangeType[] {
    return ['aster', 'paradex'];
  }

  /**
   * Check if exchange is supported
   */
  static isSupported(exchange: string): exchange is ExchangeType {
    return this.getSupportedExchanges().includes(exchange as ExchangeType);
  }
}
