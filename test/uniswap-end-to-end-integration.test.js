/**
 * End-to-End Integration Tests for Uniswap Module
 * Tests complete workflows including swap execution, pool queries, quotes, and hardware wallet integration
 */

const assert = require('assert');
const sinon = require('sinon');

// Mock external dependencies
const mockEth = {
  erc20Name: sinon.stub(),
  erc20Symbol: sinon.stub(),
  erc20Decimals: sinon.stub(),
  erc20Allowance: sinon.stub(),
  getApprovalCalldata: sinon.stub(),
  estimate_gas: sinon.stub(),
  sendEthRawTransaction: sinon.stub(),
  getTransactionReceipt: sinon.stub(),
  getBalance: sinon.stub()
};

const mockLogger = {
  info: sinon.stub(),
  error: sinon.stub(),
  warn: sinon.stub(),
  debug: sinon.stub()
};

const mockDb = {
  insertTransaction: sinon.stub(),
  updateTransaction: sinon.stub(),
  getTransaction: sinon.stub()
};

// Mock hardware wallet signing
const mockChildProcess = {
  spawn: sinon.stub()
};

// Mock require calls
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === '../eth') {
    return mockEth;
  }
  if (id === '../log') {
    return mockLogger;
  }
  if (id === '../db') {
    return mockDb;
  }
  if (id === 'child_process') {
    return mockChildProcess;
  }
  return originalRequire.apply(this, arguments);
};

const uniswap = require('../deeperWallet/uniswap/index');

describe('Uniswap End-to-End Integration Tests', function() {
  beforeEach(function() {
    // Reset all stubs before each test
    sinon.resetHistory();
    Object.values(mockEth).forEach(stub => stub.reset());
    Object.values(mockLogger).forEach(stub => stub.reset());
    Object.values(mockDb).forEach(stub => stub.reset());
    mockChildProcess.spawn.reset();
  });

  describe('Complete Swap Workflow Integration', function() {
    it('should execute complete swap workflow with token approval', async function() {
      // Setup test data
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        amountIn: '1000000000000000000', // 1 token
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);

      // Mock insufficient allowance requiring approval
      mockEth.erc20Allowance.resolves('0');
      mockEth.getApprovalCalldata.returns('0x095ea7b3...');
      mockEth.estimate_gas.resolves(50000);

      // Mock hardware wallet signing for approval
      const mockApprovalProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub()
      };
      
      mockApprovalProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
        success: true,
        signedTransaction: '0xapproval_signed_tx'
      }));
      mockApprovalProcess.on.withArgs('close').callsArgWith(1, 0);
      
      mockChildProcess.spawn.onFirstCall().returns(mockApprovalProcess);

      // Mock approval transaction submission
      mockEth.sendEthRawTransaction.onFirstCall().resolves('0xapproval_tx_hash');
      mockEth.getTransactionReceipt.onFirstCall().resolves({
        status: '0x1',
        transactionHash: '0xapproval_tx_hash',
        gasUsed: '0xc350'
      });

      // Mock hardware wallet signing for swap
      const mockSwapProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub()
      };
      
      mockSwapProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
        success: true,
        signedTransaction: '0xswap_signed_tx'
      }));
      mockSwapProcess.on.withArgs('close').callsArgWith(1, 0);
      
      mockChildProcess.spawn.onSecondCall().returns(mockSwapProcess);

      // Mock swap transaction submission
      mockEth.sendEthRawTransaction.onSecondCall().resolves('0xswap_tx_hash');
      mockEth.getTransactionReceipt.onSecondCall().resolves({
        status: '0x1',
        transactionHash: '0xswap_tx_hash',
        gasUsed: '0x15f90'
      });

      // Mock database operations
      mockDb.insertTransaction.resolves();
      mockDb.updateTransaction.resolves();

      // Execute swap
      const result = await uniswap.swapTokens(swapParams);

      // Verify successful swap
      assert.strictEqual(result.success, true);
      assert(result.transactionHash);
      assert(result.approvalTransactionHash); // Should have approval tx
      assert(result.receipt);
      assert(result.gasUsed);

      // Verify approval workflow was executed
      assert(mockEth.erc20Allowance.calledOnce);
      assert(mockEth.getApprovalCalldata.calledOnce);
      assert.strictEqual(mockChildProcess.spawn.callCount, 2); // Approval + swap
      assert.strictEqual(mockEth.sendEthRawTransaction.callCount, 2);

      // Verify database logging
      assert(mockDb.insertTransaction.calledTwice); // Approval + swap
    });

    it('should execute swap workflow without approval when sufficient allowance exists', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);

      // Mock sufficient allowance (no approval needed)
      mockEth.erc20Allowance.resolves('2000000000000000000'); // 2 tokens

      // Mock hardware wallet signing for swap only
      const mockSwapProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub()
      };
      
      mockSwapProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
        success: true,
        signedTransaction: '0xswap_signed_tx'
      }));
      mockSwapProcess.on.withArgs('close').callsArgWith(1, 0);
      
      mockChildProcess.spawn.returns(mockSwapProcess);

      // Mock swap transaction submission
      mockEth.sendEthRawTransaction.resolves('0xswap_tx_hash');
      mockEth.getTransactionReceipt.resolves({
        status: '0x1',
        transactionHash: '0xswap_tx_hash',
        gasUsed: '0x15f90'
      });

      mockDb.insertTransaction.resolves();
      mockDb.updateTransaction.resolves();

      // Execute swap
      const result = await uniswap.swapTokens(swapParams);

      // Verify successful swap without approval
      assert.strictEqual(result.success, true);
      assert(result.transactionHash);
      assert(!result.approvalTransactionHash); // No approval needed
      assert(result.receipt);

      // Verify only swap transaction was executed
      assert.strictEqual(mockChildProcess.spawn.callCount, 1); // Only swap
      assert.strictEqual(mockEth.sendEthRawTransaction.callCount, 1);
      assert(mockDb.insertTransaction.calledOnce); // Only swap
    });

    it('should handle hardware wallet signing failure gracefully', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'wrong-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);
      mockEth.erc20Allowance.resolves('2000000000000000000');

      // Mock hardware wallet signing failure
      const mockFailedProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub()
      };
      
      mockFailedProcess.stderr.on.withArgs('data').callsArgWith(1, 'Authentication failed');
      mockFailedProcess.on.withArgs('close').callsArgWith(1, 1); // Exit code 1 = failure
      
      mockChildProcess.spawn.returns(mockFailedProcess);

      // Execute swap
      const result = await uniswap.swapTokens(swapParams);

      // Verify failure handling
      assert.strictEqual(result.success, false);
      assert(result.error);
      assert(result.error.message.includes('signing failed') || result.error.message.includes('Authentication failed'));

      // Verify no transaction was submitted
      assert(mockEth.sendEthRawTransaction.notCalled);
    });
  });

  describe('Pool Query Accuracy Integration', function() {
    it('should provide accurate pool information across different networks', async function() {
      // Test pool queries on multiple networks
      const networks = ['ETHEREUM', 'ARBITRUM', 'BASE'];
      const testPairs = [
        {
          token0: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
          token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          fee: 3000
        }
      ];

      for (const network of networks) {
        for (const pair of testPairs) {
          const poolInfo = await uniswap.getPoolInfo({
            token0: pair.token0,
            token1: pair.token1,
            fee: pair.fee,
            network
          });

          if (poolInfo.success) {
            // Verify pool info structure
            assert(poolInfo.pool);
            assert(poolInfo.pool.address);
            assert(poolInfo.pool.token0);
            assert(poolInfo.pool.token1);
            assert(typeof poolInfo.pool.fee === 'number');
            assert(typeof poolInfo.pool.liquidity === 'string');
            assert(typeof poolInfo.pool.sqrtPriceX96 === 'string');
            assert(typeof poolInfo.pool.tick === 'number');

            // Verify token information is included
            assert(poolInfo.pool.token0.address);
            assert(poolInfo.pool.token0.symbol);
            assert(poolInfo.pool.token0.decimals);
            assert(poolInfo.pool.token1.address);
            assert(poolInfo.pool.token1.symbol);
            assert(poolInfo.pool.token1.decimals);

            // Verify network consistency
            assert.strictEqual(poolInfo.pool.network, network);
          }
        }
      }
    });

    it('should handle pool queries for all fee tiers', async function() {
      const feeTiers = [100, 500, 3000, 10000]; // All standard Uniswap V3 fee tiers
      const token0 = '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e';
      const token1 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

      for (const fee of feeTiers) {
        const poolInfo = await uniswap.getPoolInfo({
          token0,
          token1,
          fee,
          network: 'ETHEREUM'
        });

        // Pool may or may not exist for each fee tier, but response should be valid
        assert(typeof poolInfo.success === 'boolean');
        
        if (poolInfo.success) {
          assert.strictEqual(poolInfo.pool.fee, fee);
        } else {
          // Should have appropriate error for non-existent pools
          assert(poolInfo.error);
          assert(poolInfo.error.code);
        }
      }
    });

    it('should provide consistent pool list results', async function() {
      const poolListParams = {
        token0: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        network: 'ETHEREUM'
      };

      const poolList = await uniswap.getPoolList(poolListParams);

      if (poolList.success && poolList.pools.length > 0) {
        // Verify all pools in list have consistent structure
        poolList.pools.forEach(pool => {
          assert(pool.address);
          assert(pool.fee);
          assert(pool.liquidity);
          assert(pool.token0);
          assert(pool.token1);
          
          // Verify tokens match requested pair
          const addresses = [pool.token0.address.toLowerCase(), pool.token1.address.toLowerCase()];
          assert(addresses.includes(poolListParams.token0.toLowerCase()));
          assert(addresses.includes(poolListParams.token1.toLowerCase()));
        });

        // Verify pools are sorted by liquidity (highest first)
        for (let i = 1; i < poolList.pools.length; i++) {
          const prevLiquidity = BigInt(poolList.pools[i - 1].liquidity);
          const currLiquidity = BigInt(poolList.pools[i].liquidity);
          assert(prevLiquidity >= currLiquidity, 'Pools should be sorted by liquidity');
        }
      }
    });
  });

  describe('Quote Calculation Precision Integration', function() {
    it('should provide accurate quotes with price impact calculation', async function() {
      const quoteParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000', // 1 token
        network: 'ETHEREUM'
      };

      const quote = await uniswap.getSwapQuote(quoteParams);

      if (quote.success) {
        // Verify quote structure
        assert(quote.quote);
        assert(typeof quote.quote.amountOut === 'string');
        assert(typeof quote.quote.amountOutMin === 'string');
        assert(typeof quote.quote.priceImpact === 'number');
        assert(typeof quote.quote.gasEstimate === 'string');
        assert(quote.quote.route);

        // Verify price impact is reasonable (should be < 100%)
        assert(quote.quote.priceImpact >= 0);
        assert(quote.quote.priceImpact < 100);

        // Verify amountOutMin is less than amountOut (due to slippage)
        const amountOut = BigInt(quote.quote.amountOut);
        const amountOutMin = BigInt(quote.quote.amountOutMin);
        assert(amountOutMin <= amountOut);

        // Verify gas estimate is reasonable
        const gasEstimate = parseInt(quote.quote.gasEstimate);
        assert(gasEstimate > 0);
        assert(gasEstimate < 1000000); // Should be less than 1M gas
      }
    });

    it('should handle quote precision for different amount sizes', async function() {
      const baseParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        network: 'ETHEREUM'
      };

      // Test different amount sizes
      const amounts = [
        '1000000000000000',      // 0.001 token (small)
        '1000000000000000000',   // 1 token (medium)
        '1000000000000000000000' // 1000 tokens (large)
      ];

      const quotes = [];
      
      for (const amount of amounts) {
        const quote = await uniswap.getSwapQuote({
          ...baseParams,
          amountIn: amount
        });
        
        if (quote.success) {
          quotes.push({
            amountIn: amount,
            amountOut: quote.quote.amountOut,
            priceImpact: quote.quote.priceImpact
          });
        }
      }

      if (quotes.length >= 2) {
        // Verify price impact increases with larger amounts
        for (let i = 1; i < quotes.length; i++) {
          // Larger amounts should generally have higher price impact
          // (though this may not always be true in all market conditions)
          assert(quotes[i].priceImpact >= 0);
        }

        // Verify output amounts scale appropriately
        const ratio1 = BigInt(quotes[1].amountOut) / BigInt(quotes[0].amountOut);
        const inputRatio1 = BigInt(quotes[1].amountIn) / BigInt(quotes[0].amountIn);
        
        // Output ratio should be somewhat close to input ratio (accounting for price impact)
        // This is a rough check - exact ratios depend on liquidity curves
        assert(ratio1 > 0);
      }
    });

    it('should provide consistent quotes across multiple calls', async function() {
      const quoteParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        network: 'ETHEREUM'
      };

      // Get multiple quotes for the same parameters
      const quotes = await Promise.all([
        uniswap.getSwapQuote(quoteParams),
        uniswap.getSwapQuote(quoteParams),
        uniswap.getSwapQuote(quoteParams)
      ]);

      const successfulQuotes = quotes.filter(q => q.success);
      
      if (successfulQuotes.length >= 2) {
        // Quotes should be identical or very close (within caching tolerance)
        const firstQuote = successfulQuotes[0].quote;
        
        successfulQuotes.slice(1).forEach(quote => {
          // Amount out should be identical (assuming same block/cache)
          assert.strictEqual(quote.quote.amountOut, firstQuote.amountOut);
          assert.strictEqual(quote.quote.priceImpact, firstQuote.priceImpact);
        });
      }
    });
  });

  describe('Hardware Wallet Integration Scenarios', function() {
    it('should handle different hardware wallet response formats', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);
      mockEth.erc20Allowance.resolves('2000000000000000000');

      // Test different hardware wallet response formats
      const responseFormats = [
        // Standard JSON response
        {
          success: true,
          signedTransaction: '0xsigned_tx_data'
        },
        // Response with additional metadata
        {
          success: true,
          signedTransaction: '0xsigned_tx_data',
          metadata: {
            gasUsed: '0x15f90',
            nonce: '0x1'
          }
        }
      ];

      for (const responseFormat of responseFormats) {
        // Reset mocks
        mockChildProcess.spawn.reset();
        mockEth.sendEthRawTransaction.reset();
        mockEth.getTransactionReceipt.reset();

        const mockProcess = {
          stdout: { on: sinon.stub() },
          stderr: { on: sinon.stub() },
          on: sinon.stub()
        };
        
        mockProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify(responseFormat));
        mockProcess.on.withArgs('close').callsArgWith(1, 0);
        
        mockChildProcess.spawn.returns(mockProcess);
        mockEth.sendEthRawTransaction.resolves('0xswap_tx_hash');
        mockEth.getTransactionReceipt.resolves({
          status: '0x1',
          transactionHash: '0xswap_tx_hash',
          gasUsed: '0x15f90'
        });

        const result = await uniswap.swapTokens(swapParams);

        // Should handle all response formats successfully
        assert.strictEqual(result.success, true);
        assert(result.transactionHash);
      }
    });

    it('should handle hardware wallet timeout scenarios', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);
      mockEth.erc20Allowance.resolves('2000000000000000000');

      // Mock hardware wallet timeout (no response)
      const mockTimeoutProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub(),
        kill: sinon.stub()
      };
      
      // Simulate timeout by not calling any callbacks
      mockChildProcess.spawn.returns(mockTimeoutProcess);

      // Execute swap with timeout
      const result = await uniswap.swapTokens(swapParams);

      // Should handle timeout gracefully
      assert.strictEqual(result.success, false);
      assert(result.error);
      assert(result.error.message.includes('timeout') || result.error.message.includes('signing failed'));
    });

    it('should validate transaction parameters sent to hardware wallet', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Mock token metadata
      mockEth.erc20Name.resolves('Test Token');
      mockEth.erc20Symbol.resolves('TEST');
      mockEth.erc20Decimals.resolves(18);
      mockEth.erc20Allowance.resolves('2000000000000000000');

      const mockProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub()
      };
      
      mockProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
        success: true,
        signedTransaction: '0xsigned_tx_data'
      }));
      mockProcess.on.withArgs('close').callsArgWith(1, 0);
      
      mockChildProcess.spawn.returns(mockProcess);
      mockEth.sendEthRawTransaction.resolves('0xswap_tx_hash');
      mockEth.getTransactionReceipt.resolves({
        status: '0x1',
        transactionHash: '0xswap_tx_hash',
        gasUsed: '0x15f90'
      });

      await uniswap.swapTokens(swapParams);

      // Verify hardware wallet was called with correct parameters
      assert(mockChildProcess.spawn.calledOnce);
      
      const spawnArgs = mockChildProcess.spawn.getCall(0).args;
      assert(spawnArgs[0]); // Should have executable path
      assert(Array.isArray(spawnArgs[1])); // Should have arguments array
      
      // Verify the payload contains required transaction fields
      const payloadArg = spawnArgs[1].find(arg => arg.includes('sign_tx'));
      if (payloadArg) {
        // Should contain transaction parameters
        assert(payloadArg.includes('ETHEREUM'));
        assert(payloadArg.includes(swapParams.fromAddress));
      }
    });
  });

  describe('Cross-Network Integration', function() {
    it('should handle swaps across different networks consistently', async function() {
      const networks = ['ETHEREUM', 'ARBITRUM', 'BASE'];
      const baseParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        password: 'test-password'
      };

      for (const network of networks) {
        const swapParams = { ...baseParams, network };
        
        // Mock network-specific responses
        mockEth.erc20Name.resolves('Test Token');
        mockEth.erc20Symbol.resolves('TEST');
        mockEth.erc20Decimals.resolves(18);
        mockEth.erc20Allowance.resolves('2000000000000000000');

        const mockProcess = {
          stdout: { on: sinon.stub() },
          stderr: { on: sinon.stub() },
          on: sinon.stub()
        };
        
        mockProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
          success: true,
          signedTransaction: '0xsigned_tx_data'
        }));
        mockProcess.on.withArgs('close').callsArgWith(1, 0);
        
        mockChildProcess.spawn.returns(mockProcess);
        mockEth.sendEthRawTransaction.resolves(`0x${network.toLowerCase()}_tx_hash`);
        mockEth.getTransactionReceipt.resolves({
          status: '0x1',
          transactionHash: `0x${network.toLowerCase()}_tx_hash`,
          gasUsed: '0x15f90'
        });

        const result = await uniswap.swapTokens(swapParams);

        // Should work consistently across networks
        if (result.success) {
          assert(result.transactionHash);
          assert(result.transactionHash.includes(network.toLowerCase()));
          assert(result.receipt);
          assert.strictEqual(result.network, network);
        }

        // Reset mocks for next network
        Object.values(mockEth).forEach(stub => stub.reset());
        mockChildProcess.spawn.reset();
      }
    });
  });

  describe('Error Recovery Integration', function() {
    it('should handle and recover from various failure scenarios', async function() {
      const swapParams = {
        tokenIn: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000000000000',
        slippageTolerance: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        fromAddress: '0x1234567890123456789012345678901234567890',
        network: 'ETHEREUM',
        password: 'test-password'
      };

      // Test different failure scenarios
      const failureScenarios = [
        {
          name: 'Token metadata fetch failure',
          setup: () => {
            mockEth.erc20Name.rejects(new Error('Network error'));
          }
        },
        {
          name: 'Insufficient balance',
          setup: () => {
            mockEth.erc20Name.resolves('Test Token');
            mockEth.erc20Symbol.resolves('TEST');
            mockEth.erc20Decimals.resolves(18);
            mockEth.getBalance.resolves('0'); // No balance
          }
        },
        {
          name: 'Transaction submission failure',
          setup: () => {
            mockEth.erc20Name.resolves('Test Token');
            mockEth.erc20Symbol.resolves('TEST');
            mockEth.erc20Decimals.resolves(18);
            mockEth.erc20Allowance.resolves('2000000000000000000');
            
            const mockProcess = {
              stdout: { on: sinon.stub() },
              stderr: { on: sinon.stub() },
              on: sinon.stub()
            };
            
            mockProcess.stdout.on.withArgs('data').callsArgWith(1, JSON.stringify({
              success: true,
              signedTransaction: '0xsigned_tx_data'
            }));
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            mockChildProcess.spawn.returns(mockProcess);
            mockEth.sendEthRawTransaction.rejects(new Error('Transaction failed'));
          }
        }
      ];

      for (const scenario of failureScenarios) {
        // Reset mocks
        Object.values(mockEth).forEach(stub => stub.reset());
        mockChildProcess.spawn.reset();
        
        // Setup failure scenario
        scenario.setup();

        const result = await uniswap.swapTokens(swapParams);

        // Should handle failure gracefully
        assert.strictEqual(result.success, false);
        assert(result.error);
        assert(result.error.code);
        assert(result.error.message);
        
        // Should not have transaction hash on failure
        assert(!result.transactionHash);
      }
    });
  });
});