/**
 * Unit tests for Uniswap swap route calculation
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const assert = require('assert');
const sinon = require('sinon');

// Import the swap module
const { calculateSwapRoute, prepareSwapTransaction } = require('../deeperWallet/uniswap/swap');
const utils = require('../deeperWallet/uniswap/utils');
const constants = require('../deeperWallet/uniswap/constants');

describe('Uniswap Swap Route Calculation', function() {
  let sandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('calculateSwapRoute', function() {
    it('should calculate route for valid token pair', async function() {
      // Mock token info responses
      const mockTokenInInfo = {
        address: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      };

      const mockTokenOutInfo = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18
      };

      sandbox.stub(utils, 'validateTokenAddress').returns(true);
      sandbox.stub(utils, 'getTokenInfo')
        .onFirstCall().resolves(mockTokenInInfo)
        .onSecondCall().resolves(mockTokenOutInfo);

      const result = await calculateSwapRoute(
        mockTokenInInfo.address,
        mockTokenOutInfo.address,
        '1000',
        'ETHEREUM'
      );

      assert(typeof result === 'object', 'Result should be an object');
      assert.deepStrictEqual(result.tokenIn, mockTokenInInfo);
      assert.deepStrictEqual(result.tokenOut, mockTokenOutInfo);
      assert(typeof result.amountIn === 'string', 'amountIn should be a string');
      assert(Array.isArray(result.route), 'route should be an array');
      assert(result.route.length >= 2, 'route should have at least 2 elements');
      assert(typeof result.amountOut === 'string', 'amountOut should be a string');
      assert.strictEqual(result.network, 'ETHEREUM');
    });

    it('should reject invalid input token address', async function() {
      sandbox.stub(utils, 'validateTokenAddress')
        .onFirstCall().returns(false)
        .onSecondCall().returns(true);

      try {
        await calculateSwapRoute(
          'invalid-address',
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          '1000',
          'ETHEREUM'
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid input token address'), 'Error message should mention invalid input token address');
      }
    });

    it('should reject invalid output token address', async function() {
      sandbox.stub(utils, 'validateTokenAddress')
        .onFirstCall().returns(true)
        .onSecondCall().returns(false);

      try {
        await calculateSwapRoute(
          '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
          'invalid-address',
          '1000',
          'ETHEREUM'
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid output token address'), 'Error message should mention invalid output token address');
      }
    });

    it('should reject zero or negative amounts', async function() {
      sandbox.stub(utils, 'validateTokenAddress').returns(true);

      try {
        await calculateSwapRoute(
          '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          '0',
          'ETHEREUM'
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid input amount'), 'Error message should mention invalid input amount');
      }
    });

    it('should handle identical token addresses', async function() {
      const tokenAddress = '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b';
      
      const mockTokenInfo = {
        address: tokenAddress,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      };

      sandbox.stub(utils, 'validateTokenAddress').returns(true);
      sandbox.stub(utils, 'getTokenInfo').resolves(mockTokenInfo);

      try {
        await calculateSwapRoute(
          tokenAddress,
          tokenAddress,
          '1000',
          'ETHEREUM'
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Cannot swap identical tokens'), 'Error message should mention identical tokens');
      }
    });

    it('should create direct route for major token pairs', async function() {
      const mockTokenInInfo = {
        address: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      };

      const mockTokenOutInfo = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18
      };

      sandbox.stub(utils, 'validateTokenAddress').returns(true);
      sandbox.stub(utils, 'getTokenInfo')
        .onFirstCall().resolves(mockTokenInInfo)
        .onSecondCall().resolves(mockTokenOutInfo);

      const result = await calculateSwapRoute(
        mockTokenInInfo.address,
        mockTokenOutInfo.address,
        '1000',
        'ETHEREUM'
      );

      assert.strictEqual(result.routeType, 'DIRECT');
      assert.strictEqual(result.route.length, 2);
      assert.strictEqual(result.pools.length, 1);
    });

    it('should support different networks', async function() {
      const mockTokenInInfo = {
        address: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      };

      const mockTokenOutInfo = {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18
      };

      sandbox.stub(utils, 'validateTokenAddress').returns(true);
      sandbox.stub(utils, 'getTokenInfo')
        .onFirstCall().resolves(mockTokenInInfo)
        .onSecondCall().resolves(mockTokenOutInfo);

      const result = await calculateSwapRoute(
        mockTokenInInfo.address,
        mockTokenOutInfo.address,
        '1000',
        'ARBITRUM'
      );

      assert.strictEqual(result.network, 'ARBITRUM');
    });
  });

  describe('prepareSwapTransaction', function() {
    let mockRoute;

    beforeEach(function() {
      mockRoute = {
        tokenIn: {
          address: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
          symbol: 'USDC',
          decimals: 6,
          name: 'USD Coin'
        },
        tokenOut: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
          name: 'Wrapped Ether'
        },
        amountIn: '1000000000', // 1000 USDC in smallest unit
        amountOut: '500000000000000000', // 0.5 WETH in smallest unit
        route: ['0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
        pools: ['0x1234567890123456789012345678901234567890'],
        routeType: 'DIRECT',
        network: 'ETHEREUM'
      };
    });

    it('should prepare transaction with valid parameters', async function() {
      const slippage = 0.5;
      const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now

      // Mock gas estimation
      const mockEth = require('../deeperWallet/eth');
      sandbox.stub(mockEth, 'estimate_gas').resolves(200000);

      const result = await prepareSwapTransaction(mockRoute, slippage, deadline);

      assert(typeof result === 'object', 'Result should be an object');
      assert(typeof result.to === 'string', 'to should be a string');
      assert(typeof result.data === 'string', 'data should be a string');
      assert(typeof result.gasLimit === 'string', 'gasLimit should be a string');
      assert(typeof result.amountOutMin === 'string', 'amountOutMin should be a string');
      assert.strictEqual(result.slippage, slippage);
      assert.strictEqual(result.deadline, deadline);
      assert.strictEqual(result.network, 'ETHEREUM');
    });

    it('should calculate correct minimum output with slippage', async function() {
      const slippage = 1.0; // 1%
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      const mockEth = require('../deeperWallet/eth');
      sandbox.stub(mockEth, 'estimate_gas').resolves(200000);

      const result = await prepareSwapTransaction(mockRoute, slippage, deadline);

      const expectedMinOutput = BigInt(mockRoute.amountOut) * BigInt(9900) / BigInt(10000); // 99% of expected output
      assert.strictEqual(result.amountOutMin, expectedMinOutput.toString());
    });

    it('should reject invalid slippage values', async function() {
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      try {
        await prepareSwapTransaction(mockRoute, -1, deadline);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid slippage tolerance'), 'Error message should mention invalid slippage tolerance');
      }

      try {
        await prepareSwapTransaction(mockRoute, 51, deadline);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid slippage tolerance'), 'Error message should mention invalid slippage tolerance');
      }
    });

    it('should reject past deadline', async function() {
      const pastDeadline = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago

      try {
        await prepareSwapTransaction(mockRoute, 0.5, pastDeadline);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Invalid deadline'), 'Error message should mention invalid deadline');
      }
    });

    it('should handle ETH value for WETH swaps', async function() {
      // Mock route where input token is WETH
      const wethRoute = {
        ...mockRoute,
        tokenIn: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
          name: 'Wrapped Ether'
        }
      };

      const slippage = 0.5;
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      const mockEth = require('../deeperWallet/eth');
      sandbox.stub(mockEth, 'estimate_gas').resolves(200000);

      const result = await prepareSwapTransaction(wethRoute, slippage, deadline);

      assert.strictEqual(result.value, wethRoute.amountIn);
    });

    it('should generate different calldata for direct vs multi-hop routes', async function() {
      const slippage = 0.5;
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      const mockEth = require('../deeperWallet/eth');
      sandbox.stub(mockEth, 'estimate_gas').resolves(200000);

      // Test direct route
      const directResult = await prepareSwapTransaction(mockRoute, slippage, deadline);

      // Test multi-hop route
      const multiHopRoute = {
        ...mockRoute,
        route: [mockRoute.tokenIn.address, '0x1234567890123456789012345678901234567890', mockRoute.tokenOut.address],
        pools: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
        routeType: 'VIA_WETH'
      };

      const multiHopResult = await prepareSwapTransaction(multiHopRoute, slippage, deadline);

      // Calldata should be different for different route types
      assert.notStrictEqual(directResult.data, multiHopResult.data);
    });
  });
});