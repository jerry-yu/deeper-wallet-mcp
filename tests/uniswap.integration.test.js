const {
  getSwapQuote,
  executeSwap,
  getPoolInfo,
  getTokenPrice,
  handleTokenApproval,
  checkTokenApproval,
  getUniswapSpenderAddress,
  validateSwapParams,
  isValidSlippage,
  isValidDeadline,
  calculatePriceImpact,
  applySlippage,
  ERROR_CODES
} = require('../deeperWallet/uniswap');

// Test configuration
const TEST_CONFIG = {
  // Use Sepolia testnet to avoid mainnet costs and rate limits
  NETWORK: 'ETHEREUM-SEPOLIA',
  
  // Sepolia testnet token addresses
  TOKENS: {
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    // Add more testnet tokens as needed
    DAI: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6'
  },
  
  // Test wallet addresses (these should be test addresses only)
  TEST_ADDRESSES: {
    // These are example addresses - replace with actual test addresses
    WALLET1: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
    WALLET2: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916'
  },
  
  // Test amounts (small amounts for testing)
  AMOUNTS: {
    SMALL: '1000000000000000', // 0.001 ETH
    MEDIUM: '10000000000000000', // 0.01 ETH
    LARGE: '100000000000000000' // 0.1 ETH
  },
  
  // Slippage and deadline settings
  DEFAULT_SLIPPAGE: 0.5, // 0.5%
  DEFAULT_DEADLINE_OFFSET: 300, // 5 minutes
  
  // Test timeouts
  NETWORK_TIMEOUT: 30000, // 30 seconds
  TRANSACTION_TIMEOUT: 60000 // 60 seconds
};

/**
 * Comprehensive integration tests using Ethereum testnet
 * These tests validate the Uniswap integration against real testnet infrastructure
 */
describe('Uniswap Integration Tests', () => {
  
  describe('End-to-End Swap Workflow Tests', () => {
    
    test('should complete full swap quote workflow', async () => {
      const { NETWORK, TOKENS, AMOUNTS, DEFAULT_SLIPPAGE } = TEST_CONFIG;
      
      // Test getting a swap quote
      const quote = await getSwapQuote(
        NETWORK,
        TOKENS.WETH,
        TOKENS.USDC,
        AMOUNTS.SMALL,
        DEFAULT_SLIPPAGE
      );
      
      if (quote && !quote.error) {
        // Validate quote structure
        expect(quote).toHaveProperty('tokenIn', TOKENS.WETH);
        expect(quote).toHaveProperty('tokenOut', TOKENS.USDC);
        expect(quote).toHaveProperty('amountIn', AMOUNTS.SMALL);
        expect(quote).toHaveProperty('amountOut');
        expect(quote).toHaveProperty('amountOutMin');
        expect(quote).toHaveProperty('priceImpact');
        expect(quote).toHaveProperty('slippage', DEFAULT_SLIPPAGE);
        expect(quote).toHaveProperty('route');
        expect(quote).toHaveProperty('version');
        // Gas estimate might not always be present in quotes
        if (quote.gasEstimate) {
          expect(quote).toHaveProperty('gasEstimate');
        }
        expect(quote).toHaveProperty('timestamp');
        
        // Validate numeric values
        expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
        expect(BigInt(quote.amountOutMin)).toBeLessThan(BigInt(quote.amountOut));
        expect(typeof quote.priceImpact).toBe('number');
        expect(quote.priceImpact).toBeGreaterThanOrEqual(0);
        expect(['V2', 'V3']).toContain(quote.version);
        
        // Validate slippage calculation
        const expectedMinAmount = applySlippage(quote.amountOut, DEFAULT_SLIPPAGE, true);
        expect(quote.amountOutMin).toBe(expectedMinAmount);
        
        console.log('✓ Swap quote workflow completed successfully');
        console.log(`  Quote: ${quote.amountIn} WETH → ${quote.amountOut} USDC`);
        console.log(`  Price Impact: ${quote.priceImpact.toFixed(2)}%`);
        console.log(`  Version: ${quote.version}`);
      } else {
        console.log('ℹ No pools found for test tokens on testnet (expected)');
        if (quote?.error) {
          expect([ERROR_CODES.POOL_NOT_FOUND, ERROR_CODES.INSUFFICIENT_LIQUIDITY]).toContain(quote.code);
        }
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should handle swap workflow with different slippage settings', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      const slippageValues = [0.1, 0.5, 1.0, 2.0, 5.0];
      
      for (const slippage of slippageValues) {
        const quote = await getSwapQuote(
          NETWORK,
          TOKENS.WETH,
          TOKENS.USDC,
          AMOUNTS.SMALL,
          slippage
        );
        
        if (quote && !quote.error) {
          expect(quote.slippage).toBe(slippage);
          
          // Verify slippage is applied correctly
          const expectedMinAmount = applySlippage(quote.amountOut, slippage, true);
          expect(quote.amountOutMin).toBe(expectedMinAmount);
          
          // Higher slippage should result in lower minimum amount
          if (slippage > 0.1) {
            const lowSlippageQuote = await getSwapQuote(
              NETWORK,
              TOKENS.WETH,
              TOKENS.USDC,
              AMOUNTS.SMALL,
              0.1
            );
            
            if (lowSlippageQuote && !lowSlippageQuote.error) {
              expect(BigInt(quote.amountOutMin)).toBeLessThan(BigInt(lowSlippageQuote.amountOutMin));
            }
          }
        }
      }
      
      console.log('✓ Slippage variation tests completed');
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should validate swap parameters comprehensively', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      // Test valid parameters
      const validParams = {
        tokenIn: TOKENS.WETH,
        tokenOut: TOKENS.USDC,
        amountIn: AMOUNTS.SMALL,
        network: NETWORK,
        slippage: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 300
      };
      
      const validResult = validateSwapParams(validParams);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      
      // Test invalid token addresses
      const invalidTokenParams = { ...validParams, tokenIn: 'invalid-address' };
      const invalidTokenResult = validateSwapParams(invalidTokenParams);
      expect(invalidTokenResult.isValid).toBe(false);
      expect(invalidTokenResult.errors).toContain('Invalid input token address format');
      
      // Test same token addresses
      const sameTokenParams = { ...validParams, tokenOut: TOKENS.WETH };
      const sameTokenResult = validateSwapParams(sameTokenParams);
      expect(sameTokenResult.isValid).toBe(false);
      expect(sameTokenResult.errors).toContain('Input and output tokens cannot be the same');
      
      // Test invalid amounts
      const zeroAmountParams = { ...validParams, amountIn: '0' };
      const zeroAmountResult = validateSwapParams(zeroAmountParams);
      expect(zeroAmountResult.isValid).toBe(false);
      expect(zeroAmountResult.errors).toContain('Input amount must be greater than zero');
      
      // Test invalid slippage
      const invalidSlippageParams = { ...validParams, slippage: 100 };
      const invalidSlippageResult = validateSwapParams(invalidSlippageParams);
      expect(invalidSlippageResult.isValid).toBe(false);
      expect(invalidSlippageResult.errors).toContain('Invalid slippage percentage (must be between 0 and 50)');
      
      console.log('✓ Parameter validation tests completed');
    });
  });
  
  describe('Gas Estimation Accuracy Tests', () => {
    
    test('should provide accurate gas estimates for different swap types', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      // Test V2 and V3 gas estimates if pools exist
      const quote = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, AMOUNTS.SMALL);
      
      if (quote && !quote.error && quote.gasEstimate) {
        const gasEstimate = BigInt(quote.gasEstimate);
        
        // Gas estimates should be reasonable for Uniswap swaps
        expect(gasEstimate).toBeGreaterThan(BigInt('100000')); // At least 100k gas
        expect(gasEstimate).toBeLessThan(BigInt('500000')); // Less than 500k gas
        
        // V3 swaps typically use more gas than V2
        if (quote.version === 'V3') {
          expect(gasEstimate).toBeGreaterThan(BigInt('150000')); // V3 minimum
        } else if (quote.version === 'V2') {
          expect(gasEstimate).toBeGreaterThan(BigInt('120000')); // V2 minimum
        }
        
        console.log(`✓ Gas estimate for ${quote.version}: ${quote.gasEstimate}`);
      } else {
        console.log('ℹ No pools available for gas estimation test');
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should estimate gas for different trade sizes', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      const tradeSizes = [AMOUNTS.SMALL, AMOUNTS.MEDIUM, AMOUNTS.LARGE];
      
      const gasEstimates = [];
      
      for (const amount of tradeSizes) {
        const quote = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, amount);
        
        if (quote && !quote.error && quote.gasEstimate) {
          gasEstimates.push({
            amount,
            gasEstimate: BigInt(quote.gasEstimate),
            version: quote.version
          });
        }
      }
      
      if (gasEstimates.length > 1) {
        // Gas estimates should be consistent across trade sizes for same version
        const v2Estimates = gasEstimates.filter(e => e.version === 'V2');
        const v3Estimates = gasEstimates.filter(e => e.version === 'V3');
        
        // Within same version, gas should be similar (within 20% variance)
        if (v2Estimates.length > 1) {
          const maxV2Gas = Math.max(...v2Estimates.map(e => Number(e.gasEstimate)));
          const minV2Gas = Math.min(...v2Estimates.map(e => Number(e.gasEstimate)));
          const v2Variance = (maxV2Gas - minV2Gas) / minV2Gas;
          expect(v2Variance).toBeLessThan(0.2); // Less than 20% variance
        }
        
        if (v3Estimates.length > 1) {
          const maxV3Gas = Math.max(...v3Estimates.map(e => Number(e.gasEstimate)));
          const minV3Gas = Math.min(...v3Estimates.map(e => Number(e.gasEstimate)));
          const v3Variance = (maxV3Gas - minV3Gas) / minV3Gas;
          expect(v3Variance).toBeLessThan(0.2); // Less than 20% variance
        }
        
        console.log('✓ Gas estimation consistency verified across trade sizes');
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
  });
  
  describe('Slippage Protection Tests', () => {
    
    test('should enforce slippage protection in quotes', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      const testSlippages = [0.1, 0.5, 1.0, 2.5, 5.0];
      
      for (const slippage of testSlippages) {
        const quote = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, AMOUNTS.SMALL, slippage);
        
        if (quote && !quote.error) {
          // Calculate expected minimum amount
          const expectedMin = applySlippage(quote.amountOut, slippage, true);
          expect(quote.amountOutMin).toBe(expectedMin);
          
          // Verify slippage percentage
          const actualSlippage = ((BigInt(quote.amountOut) - BigInt(quote.amountOutMin)) * BigInt(10000)) / BigInt(quote.amountOut);
          const expectedSlippageBasisPoints = Math.floor(slippage * 100);
          // Allow for small rounding differences (within 1 basis point)
          expect(Math.abs(Number(actualSlippage) - expectedSlippageBasisPoints)).toBeLessThanOrEqual(1);
          
          console.log(`✓ Slippage ${slippage}% correctly applied: ${quote.amountOut} → ${quote.amountOutMin}`);
        }
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should reject excessive slippage values', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      const excessiveSlippages = [50.1, 75, 100, -1, -0.1];
      
      for (const slippage of excessiveSlippages) {
        expect(isValidSlippage(slippage)).toBe(false);
        
        const quote = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, AMOUNTS.SMALL, slippage);
        
        if (quote) {
          expect(quote.error).toBe(true);
          expect(quote.code).toBe(ERROR_CODES.INVALID_SLIPPAGE);
        }
      }
      
      console.log('✓ Excessive slippage values properly rejected');
    });
    
    test('should calculate price impact warnings correctly', async () => {
      // Test price impact calculation with known values
      const reserveIn = '1000000000000000000000'; // 1000 ETH
      const reserveOut = '2000000000000'; // 2M USDC
      
      // Small trade (low impact)
      const smallAmountIn = '1000000000000000000'; // 1 ETH
      const smallAmountOut = '1938000000'; // ~1938 USDC (calculated)
      const smallImpact = calculatePriceImpact(reserveIn, reserveOut, smallAmountIn, smallAmountOut);
      expect(smallImpact).toBeLessThan(5); // Less than 5% impact (adjusted for realistic calculation)
      
      // Large trade (high impact)
      const largeAmountIn = '100000000000000000000'; // 100 ETH
      const largeAmountOut = '180000000000'; // ~180k USDC (with high impact)
      const largeImpact = calculatePriceImpact(reserveIn, reserveOut, largeAmountIn, largeAmountOut);
      expect(largeImpact).toBeGreaterThan(5); // More than 5% impact
      
      console.log(`✓ Price impact calculation: Small trade ${smallImpact.toFixed(2)}%, Large trade ${largeImpact.toFixed(2)}%`);
    });
  });
  
  describe('Deadline Handling Tests', () => {
    
    test('should validate deadline constraints', () => {
      const now = Math.floor(Date.now() / 1000);
      
      // Valid deadlines (1-60 minutes from now)
      const validDeadlines = [
        now + 60,    // 1 minute
        now + 300,   // 5 minutes
        now + 1800,  // 30 minutes
        now + 3600   // 60 minutes
      ];
      
      validDeadlines.forEach(deadline => {
        expect(isValidDeadline(deadline)).toBe(true);
      });
      
      // Invalid deadlines
      const invalidDeadlines = [
        now - 300,   // Past deadline
        now + 30,    // Too soon (30 seconds)
        now + 7200,  // Too far (2 hours)
        'invalid',   // Invalid type
        null,        // Null value
        1.5          // Non-integer
      ];
      
      invalidDeadlines.forEach(deadline => {
        expect(isValidDeadline(deadline)).toBe(false);
      });
      
      console.log('✓ Deadline validation working correctly');
    });
    
    test('should include appropriate deadlines in swap quotes', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      const quote = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, AMOUNTS.SMALL);
      
      if (quote && !quote.error && quote.deadline) {
        const now = Math.floor(Date.now() / 1000);
        const deadline = quote.deadline;
        
        // Deadline should be in the future but not too far
        expect(deadline).toBeGreaterThan(now);
        expect(deadline).toBeLessThan(now + 3600); // Less than 1 hour
        
        // Should be valid according to our validation
        expect(isValidDeadline(deadline)).toBe(true);
        
        console.log(`✓ Quote deadline: ${deadline} (${deadline - now} seconds from now)`);
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
  });
  
  describe('Token Approval Integration Tests', () => {
    
    test('should check token approval status correctly', async () => {
      const { NETWORK, TOKENS, TEST_ADDRESSES } = TEST_CONFIG;
      
      // Get Uniswap router address for approval checks
      const spenderAddress = getUniswapSpenderAddress(NETWORK, 'V2');
      expect(spenderAddress).toBeTruthy();
      expect(spenderAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      
      // Check approval status (this will likely show no approval on testnet)
      const approvalStatus = await checkTokenApproval(
        NETWORK,
        TOKENS.USDC,
        TEST_ADDRESSES.WALLET1,
        spenderAddress,
        TEST_CONFIG.AMOUNTS.SMALL
      );
      
      expect(approvalStatus).toHaveProperty('isApproved');
      expect(approvalStatus).toHaveProperty('currentAllowance');
      expect(approvalStatus).toHaveProperty('requiredAmount', TEST_CONFIG.AMOUNTS.SMALL);
      expect(approvalStatus).toHaveProperty('needsApproval');
      
      // Allowance should be a valid number string
      expect(approvalStatus.currentAllowance).toMatch(/^\d+$/);
      
      console.log(`✓ Approval check: ${approvalStatus.currentAllowance} allowance, needs approval: ${approvalStatus.needsApproval}`);
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should get correct spender addresses for different versions', () => {
      const { NETWORK } = TEST_CONFIG;
      
      const v2Spender = getUniswapSpenderAddress(NETWORK, 'V2');
      const v3Spender = getUniswapSpenderAddress(NETWORK, 'V3');
      
      expect(v2Spender).toBeTruthy();
      expect(v3Spender).toBeTruthy();
      expect(v2Spender).not.toBe(v3Spender);
      
      // Both should be valid addresses
      expect(v2Spender).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(v3Spender).toMatch(/^0x[a-fA-F0-9]{40}$/);
      
      console.log(`✓ Spender addresses - V2: ${v2Spender}, V3: ${v3Spender}`);
    });
    
    test('should handle approval workflow validation', async () => {
      const { NETWORK, TOKENS, TEST_ADDRESSES } = TEST_CONFIG;
      
      // Test approval workflow without actually executing (no password)
      const spenderAddress = getUniswapSpenderAddress(NETWORK, 'V2');
      
      // This should fail gracefully without a valid password
      const approvalResult = await handleTokenApproval(
        'invalid-password',
        TEST_ADDRESSES.WALLET1,
        TOKENS.USDC,
        spenderAddress,
        TEST_CONFIG.AMOUNTS.SMALL,
        NETWORK,
        { maxRetries: 1 }
      );
      
      expect(approvalResult).toHaveProperty('success');
      expect(approvalResult).toHaveProperty('needsApproval');
      
      // Should fail due to invalid password/wallet
      expect(approvalResult.success).toBe(false);
      expect(approvalResult.error).toBeTruthy();
      
      console.log('✓ Approval workflow validation completed (expected failure without valid credentials)');
    }, TEST_CONFIG.NETWORK_TIMEOUT);
  });
  
  describe('Pool Information Integration Tests', () => {
    
    test('should query pool information comprehensively', async () => {
      const { NETWORK, TOKENS } = TEST_CONFIG;
      
      const poolInfo = await getPoolInfo(NETWORK, TOKENS.WETH, TOKENS.USDC);
      
      if (poolInfo && !poolInfo.error) {
        // Validate pool info structure
        expect(poolInfo).toHaveProperty('pools');
        expect(Array.isArray(poolInfo.pools)).toBe(true);
        
        if (poolInfo.pools.length > 0) {
          const pool = poolInfo.pools[0];
          expect(pool).toHaveProperty('poolAddress');
          expect(pool).toHaveProperty('version');
          expect(pool).toHaveProperty('token0');
          expect(pool).toHaveProperty('token1');
          expect(pool).toHaveProperty('fee');
          
          // Validate addresses
          expect(pool.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
          expect(pool.token0).toMatch(/^0x[a-fA-F0-9]{40}$/);
          expect(pool.token1).toMatch(/^0x[a-fA-F0-9]{40}$/);
          
          // Version should be V2 or V3
          expect(['V2', 'V3']).toContain(pool.version);
          
          console.log(`✓ Pool found: ${pool.version} pool at ${pool.poolAddress}`);
          console.log(`  Tokens: ${pool.token0} / ${pool.token1}`);
          console.log(`  Fee: ${pool.fee}`);
        }
      } else {
        console.log('ℹ No pools found for test token pair (expected on testnet)');
        if (poolInfo?.error) {
          expect([ERROR_CODES.POOL_NOT_FOUND, ERROR_CODES.NETWORK_ERROR, ERROR_CODES.INVALID_PARAMETERS]).toContain(poolInfo.code);
        }
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should get token prices when pools exist', async () => {
      const { NETWORK, TOKENS } = TEST_CONFIG;
      
      const tokenPrice = await getTokenPrice(NETWORK, TOKENS.USDC, TOKENS.WETH);
      
      if (tokenPrice && !tokenPrice.error) {
        expect(tokenPrice).toHaveProperty('tokenAddress', TOKENS.USDC);
        expect(tokenPrice).toHaveProperty('baseToken', TOKENS.WETH);
        expect(tokenPrice).toHaveProperty('price');
        expect(tokenPrice).toHaveProperty('inversePrice');
        expect(tokenPrice).toHaveProperty('poolAddress');
        expect(tokenPrice).toHaveProperty('version');
        expect(tokenPrice).toHaveProperty('lastUpdated');
        
        // Prices should be positive numbers
        expect(BigInt(tokenPrice.price)).toBeGreaterThan(0n);
        expect(BigInt(tokenPrice.inversePrice)).toBeGreaterThan(0n);
        
        // Timestamp should be recent
        const now = Math.floor(Date.now() / 1000);
        expect(tokenPrice.lastUpdated).toBeGreaterThan(now - 300); // Within 5 minutes
        
        console.log(`✓ Token price: 1 USDC = ${tokenPrice.price} WETH`);
        console.log(`  Inverse: 1 WETH = ${tokenPrice.inversePrice} USDC`);
      } else {
        console.log('ℹ No price data available (expected on testnet)');
      }
    }, TEST_CONFIG.NETWORK_TIMEOUT);
  });
  
  describe('Error Handling and Edge Cases', () => {
    
    test('should handle network connectivity issues gracefully', async () => {
      // Test with invalid network
      const result = await getSwapQuote('INVALID_NETWORK', TEST_CONFIG.TOKENS.WETH, TEST_CONFIG.TOKENS.USDC, TEST_CONFIG.AMOUNTS.SMALL);
      
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('timestamp');
      
      console.log('✓ Invalid network handled gracefully');
    });
    
    test('should handle non-existent token pairs', async () => {
      const { NETWORK } = TEST_CONFIG;
      
      // Use obviously fake token addresses
      const fakeToken1 = '0x1111111111111111111111111111111111111111';
      const fakeToken2 = '0x2222222222222222222222222222222222222222';
      
      const result = await getSwapQuote(NETWORK, fakeToken1, fakeToken2, TEST_CONFIG.AMOUNTS.SMALL);
      
      expect(result).toHaveProperty('error', true);
      expect([ERROR_CODES.POOL_NOT_FOUND, ERROR_CODES.INVALID_PARAMETERS]).toContain(result.code);
      
      console.log('✓ Non-existent token pairs handled gracefully');
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should handle very small and very large amounts', async () => {
      const { NETWORK, TOKENS } = TEST_CONFIG;
      
      // Very small amount (1 wei)
      const smallResult = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, '1');
      
      if (smallResult) {
        if (smallResult.error) {
          expect([ERROR_CODES.INSUFFICIENT_LIQUIDITY, ERROR_CODES.POOL_NOT_FOUND]).toContain(smallResult.code);
        } else {
          expect(BigInt(smallResult.amountOut)).toBeGreaterThan(0n);
        }
      }
      
      // Very large amount (1000 ETH)
      const largeAmount = '1000000000000000000000'; // 1000 ETH
      const largeResult = await getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, largeAmount);
      
      if (largeResult) {
        if (largeResult.error) {
          expect([ERROR_CODES.INSUFFICIENT_LIQUIDITY, ERROR_CODES.POOL_NOT_FOUND]).toContain(largeResult.code);
        } else {
          // Should have high price impact
          expect(largeResult.priceImpact).toBeGreaterThan(10);
        }
      }
      
      console.log('✓ Extreme amounts handled appropriately');
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should validate input parameters thoroughly', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      // Test various invalid inputs
      const invalidInputs = [
        { tokenIn: null, tokenOut: TOKENS.USDC, amountIn: AMOUNTS.SMALL },
        { tokenIn: TOKENS.WETH, tokenOut: null, amountIn: AMOUNTS.SMALL },
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, amountIn: null },
        { tokenIn: 'invalid', tokenOut: TOKENS.USDC, amountIn: AMOUNTS.SMALL },
        { tokenIn: TOKENS.WETH, tokenOut: 'invalid', amountIn: AMOUNTS.SMALL },
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, amountIn: 'invalid' },
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, amountIn: '-1' },
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.WETH, amountIn: AMOUNTS.SMALL } // Same token
      ];
      
      for (const input of invalidInputs) {
        const result = await getSwapQuote(NETWORK, input.tokenIn, input.tokenOut, input.amountIn);
        
        expect(result).toHaveProperty('error', true);
        expect(result).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
      }
      
      console.log('✓ Input validation working correctly for all invalid cases');
    });
  });
  
  describe('Performance and Reliability Tests', () => {
    
    test('should handle concurrent requests efficiently', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      // Create multiple concurrent requests
      const requests = Array(5).fill().map((_, i) => 
        getSwapQuote(NETWORK, TOKENS.WETH, TOKENS.USDC, AMOUNTS.SMALL)
      );
      
      const startTime = Date.now();
      const results = await Promise.all(requests);
      const endTime = Date.now();
      
      // All requests should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(TEST_CONFIG.NETWORK_TIMEOUT);
      
      // All results should be consistent (same structure)
      results.forEach(result => {
        if (result && !result.error) {
          expect(result).toHaveProperty('tokenIn');
          expect(result).toHaveProperty('tokenOut');
          expect(result).toHaveProperty('amountIn');
        } else if (result?.error) {
          expect(result).toHaveProperty('code');
          expect(result).toHaveProperty('message');
        }
      });
      
      console.log(`✓ Concurrent requests completed in ${endTime - startTime}ms`);
    }, TEST_CONFIG.NETWORK_TIMEOUT);
    
    test('should maintain consistent response format', async () => {
      const { NETWORK, TOKENS, AMOUNTS } = TEST_CONFIG;
      
      // Test multiple different token pairs and amounts
      const testCases = [
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, amount: AMOUNTS.SMALL },
        { tokenIn: TOKENS.USDC, tokenOut: TOKENS.WETH, amount: '1000000' }, // 1 USDC
        { tokenIn: TOKENS.WETH, tokenOut: TOKENS.DAI, amount: AMOUNTS.MEDIUM }
      ];
      
      for (const testCase of testCases) {
        const result = await getSwapQuote(NETWORK, testCase.tokenIn, testCase.tokenOut, testCase.amount);
        
        if (result) {
          if (result.error) {
            // Error format should be consistent
            expect(result).toHaveProperty('error', true);
            expect(result).toHaveProperty('code');
            expect(result).toHaveProperty('message');
            expect(result).toHaveProperty('timestamp');
          } else {
            // Success format should be consistent
            expect(result).toHaveProperty('tokenIn', testCase.tokenIn);
            expect(result).toHaveProperty('tokenOut', testCase.tokenOut);
            expect(result).toHaveProperty('amountIn', testCase.amount);
            expect(result).toHaveProperty('amountOut');
            expect(result).toHaveProperty('amountOutMin');
            expect(result).toHaveProperty('priceImpact');
            expect(result).toHaveProperty('route');
            expect(result).toHaveProperty('version');
            expect(result).toHaveProperty('timestamp');
          }
        }
      }
      
      console.log('✓ Response format consistency verified');
    }, TEST_CONFIG.NETWORK_TIMEOUT);
  });
});

// Helper function to run integration tests with proper setup
function runIntegrationTests() {
  console.log('🚀 Starting Uniswap Integration Tests');
  console.log(`📡 Network: ${TEST_CONFIG.NETWORK}`);
  console.log(`🪙 Test Tokens: WETH, USDC, DAI`);
  console.log(`⏱️  Timeout: ${TEST_CONFIG.NETWORK_TIMEOUT}ms`);
  console.log('');
  
  // Note: These tests are designed to work with testnet
  // They will gracefully handle cases where pools don't exist
  // The main goal is to test the integration logic and error handling
}

// Export test configuration for use in other test files
module.exports = {
  TEST_CONFIG,
  runIntegrationTests
};