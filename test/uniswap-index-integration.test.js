/**
 * Integration Tests for Uniswap Index Module
 * Tests all main exported functions with comprehensive scenarios
 */

const assert = require('assert');

describe('Uniswap Index Module Integration Tests', function() {
  
  describe('Module Structure', function() {
    it('should export all required functions', function() {
      const uniswap = require('../deeperWallet/uniswap/index');
      
      assert(typeof uniswap.swapTokens === 'function', 'swapTokens should be a function');
      assert(typeof uniswap.getSwapQuote === 'function', 'getSwapQuote should be a function');
      assert(typeof uniswap.getPoolInfo === 'function', 'getPoolInfo should be a function');
      assert(typeof uniswap.getPoolList === 'function', 'getPoolList should be a function');
      assert(typeof uniswap.getSupportedTokens === 'function', 'getSupportedTokens should be a function');
      assert(typeof uniswap.getBestRoute === 'function', 'getBestRoute should be a function');
    });
  });

  describe('Parameter Validation', function() {
    const uniswap = require('../deeperWallet/uniswap/index');

    it('should return error for null parameters in getSwapQuote', async function() {
      const result = await uniswap.getSwapQuote(null);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
      assert(result.error.message.includes('Invalid parameters object'));
    });

    it('should return error for missing required fields in getSwapQuote', async function() {
      const incompleteParams = {
        tokenIn: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b'
        // Missing tokenOut, amountIn, network
      };

      const result = await uniswap.getSwapQuote(incompleteParams);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
      assert(result.error.message.includes('Missing required parameter'));
    });

    it('should return error for null parameters in getPoolInfo', async function() {
      const result = await uniswap.getPoolInfo(null);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should return error for null parameters in getPoolList', async function() {
      const result = await uniswap.getPoolList(null);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should return error for null parameters in getBestRoute', async function() {
      const result = await uniswap.getBestRoute(null);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should return error for null parameters in swapTokens', async function() {
      const result = await uniswap.swapTokens(null, 'password');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });
  });

  describe('Error Response Structure', function() {
    const uniswap = require('../deeperWallet/uniswap/index');

    it('should create standardized error responses', async function() {
      const result = await uniswap.getSwapQuote(null);

      assert(result.hasOwnProperty('success'));
      assert(result.hasOwnProperty('error'));
      assert(result.error.hasOwnProperty('code'));
      assert(result.error.hasOwnProperty('message'));
      assert(result.error.hasOwnProperty('details'));
      assert(result.error.hasOwnProperty('operation'));
      assert(result.error.hasOwnProperty('timestamp'));
      assert(result.error.hasOwnProperty('retryable'));
      assert(typeof result.error.timestamp === 'number');
      assert(typeof result.error.retryable === 'boolean');
    });

    it('should include operation context in error responses', async function() {
      const result = await uniswap.getSwapQuote(null);
      
      assert.strictEqual(result.error.operation, 'getSwapQuote');
    });

    it('should mark validation errors as non-retryable', async function() {
      const result = await uniswap.getSwapQuote(null);
      
      assert.strictEqual(result.error.retryable, false);
    });
  });

  describe('getSupportedTokens', function() {
    const uniswap = require('../deeperWallet/uniswap/index');

    it('should return supported tokens for valid networks', async function() {
      const networks = ['ETHEREUM', 'ARBITRUM', 'OPTIMISM', 'BASE', 'POLYGON'];
      
      for (const network of networks) {
        const result = await uniswap.getSupportedTokens(network);
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.network, network);
        assert(Array.isArray(result.tokens));
        assert(typeof result.count === 'number');
        assert.strictEqual(result.count, result.tokens.length);
        
        // Check token structure
        if (result.tokens.length > 0) {
          const token = result.tokens[0];
          assert(token.hasOwnProperty('address'));
          assert(token.hasOwnProperty('symbol'));
          assert(token.hasOwnProperty('name'));
          assert(token.hasOwnProperty('decimals'));
        }
      }
    });

    it('should return empty array for unsupported networks', async function() {
      const result = await uniswap.getSupportedTokens('UNSUPPORTED_NETWORK');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
      assert(Array.isArray(result.tokens));
      assert.strictEqual(result.tokens.length, 0);
    });
  });

  describe('Input Validation Edge Cases', function() {
    const uniswap = require('../deeperWallet/uniswap/index');

    it('should handle empty object parameters', async function() {
      const result = await uniswap.getSwapQuote({});
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should handle undefined parameters', async function() {
      const result = await uniswap.getSwapQuote(undefined);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should handle string instead of object parameters', async function() {
      const result = await uniswap.getSwapQuote('invalid');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });

    it('should handle number instead of object parameters', async function() {
      const result = await uniswap.getSwapQuote(123);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error.code, 'INVALID_PARAMS');
    });
  });

  describe('Function Return Types', function() {
    const uniswap = require('../deeperWallet/uniswap/index');

    it('should return promises from all main functions', function() {
      const params = {
        tokenIn: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '100',
        network: 'ETHEREUM'
      };

      const swapQuotePromise = uniswap.getSwapQuote(params);
      const bestRoutePromise = uniswap.getBestRoute(params);
      const supportedTokensPromise = uniswap.getSupportedTokens('ETHEREUM');

      assert(swapQuotePromise instanceof Promise);
      assert(bestRoutePromise instanceof Promise);
      assert(supportedTokensPromise instanceof Promise);
    });
  });

});