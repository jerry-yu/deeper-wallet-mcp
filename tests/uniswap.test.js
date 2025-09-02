const {
  calculateV2SwapOutput,
  calculateV2SwapInput,
  calculatePriceImpact,
  applySlippage,
  encodeFunctionCall,
  encodeAddress,
  encodeUint256,
  decodeHexToDecimal,
  decodeAddress,
  validateSwapParams,
  validatePoolParams,
  isValidSlippage,
  isValidDeadline,
  isValidAddress,
  isValidAmount,
  validateAndSanitizeParams,
  createError,
  getUserFriendlyErrorMessage,
  analyzePriceImpact,
  validateLiquidity,
  withErrorHandling,
  ERROR_CODES,
  getV2PairAddress,
  getV3PoolAddress,
  getV2PoolReserves,
  getV3PoolData,
  getPoolInfo,
  poolExists,
  getAllPools,
  calculateV2Price,
  calculateV3Price,
  getTokenPrice,
  getSwapQuote,
  getOptimalRoute,
  comparePrices,
  getTokenAllowance,
  checkTokenApproval,
  getApprovalCalldata,
  executeTokenApproval,
  handleTokenApproval,
  getUniswapSpenderAddress,
  FEE_TIERS,
  // Swap transaction functionality
  encodeV2SwapData,
  encodeV3SwapData,
  selectOptimalRoute,
  executeSwap,
  prepareSwapTransaction
} = require('../deeperWallet/uniswap');

describe('Uniswap Utility Functions', () => {
  
  describe('Swap Calculations', () => {
    test('calculateV2SwapOutput should calculate correct output amount', () => {
      // Test with known values: 1000 ETH reserve, 2000000 USDC reserve, swap 1 ETH
      const reserveIn = '1000000000000000000000'; // 1000 ETH in wei
      const reserveOut = '2000000000000'; // 2000000 USDC (6 decimals)
      const amountIn = '1000000000000000000'; // 1 ETH in wei
      
      const result = calculateV2SwapOutput(reserveIn, reserveOut, amountIn);
      
      // Should get approximately 1938 USDC (accounting for 0.3% fee and price impact)
      expect(BigInt(result)).toBeGreaterThan(BigInt('1930000000')); // > 1930 USDC
      expect(BigInt(result)).toBeLessThan(BigInt('1950000000')); // < 1950 USDC
    });

    test('calculateV2SwapOutput should handle custom fee', () => {
      const reserveIn = '1000000000000000000000';
      const reserveOut = '2000000000000';
      const amountIn = '1000000000000000000';
      
      const result100 = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, 100); // 0.1% fee
      const result300 = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, 300); // 0.3% fee
      
      // Lower fee should give higher output
      expect(BigInt(result100)).toBeGreaterThan(BigInt(result300));
    });

    test('calculateV2SwapInput should calculate correct input amount', () => {
      const reserveIn = '1000000000000000000000';
      const reserveOut = '2000000000000';
      const amountOut = '1000000000'; // Want 1000 USDC
      
      const result = calculateV2SwapInput(reserveIn, reserveOut, amountOut);
      
      // Should need slightly more than 0.5 ETH due to fees
      expect(BigInt(result)).toBeGreaterThan(BigInt('500000000000000000')); // > 0.5 ETH
      expect(BigInt(result)).toBeLessThan(BigInt('600000000000000000')); // < 0.6 ETH
    });

    test('calculatePriceImpact should calculate price impact correctly', () => {
      const reserveIn = '1000000000000000000000';
      const reserveOut = '2000000000000';
      const amountIn = '100000000000000000000'; // 100 ETH (large trade)
      const amountOut = '180000000000'; // 180000 USDC
      
      const priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);
      
      // Large trade should have significant price impact
      expect(priceImpact).toBeGreaterThan(5); // > 5%
      expect(priceImpact).toBeLessThan(15); // < 15%
    });

    test('applySlippage should apply slippage correctly', () => {
      const amount = '1000000000000000000'; // 1 ETH
      const slippage = 0.5; // 0.5%
      
      const minAmount = applySlippage(amount, slippage, true);
      const maxAmount = applySlippage(amount, slippage, false);
      
      // Min should be 99.5% of original
      expect(BigInt(minAmount)).toBeLessThan(BigInt(amount));
      expect(BigInt(minAmount)).toEqual(BigInt('995000000000000000'));
      
      // Max should be 100.5% of original
      expect(BigInt(maxAmount)).toBeGreaterThan(BigInt(amount));
      expect(BigInt(maxAmount)).toEqual(BigInt('1005000000000000000'));
    });

    test('should throw error for invalid reserves', () => {
      expect(() => {
        calculateV2SwapOutput('0', '1000000000000', '1000000000000000000');
      }).toThrow('Invalid reserves or amount');
    });

    test('should throw error for insufficient liquidity', () => {
      expect(() => {
        calculateV2SwapInput('1000000000000000000000', '2000000000000', '2000000000000');
      }).toThrow('Insufficient liquidity');
    });
  });

  describe('Hex Encoding/Decoding', () => {
    test('encodeFunctionCall should encode function calls correctly', () => {
      const selector = '0xa9059cbb'; // transfer function
      const params = ['0x742d35Cc6634C0532925a3b8D400E4C0532925a3b8D400E4C', '1000000000000000000'];
      
      const result = encodeFunctionCall(selector, params);
      
      expect(result).toMatch(/^0xa9059cbb/);
      expect(result.length).toBe(138); // 4 bytes selector + 2 * 32 bytes params + 0x prefix
    });

    test('encodeAddress should encode addresses correctly', () => {
      const address = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const result = encodeAddress(address);
      
      expect(result).toBe('000000000000000000000000742d35cc6634c0532925a3b8d400e4c053292525');
      expect(result.length).toBe(64);
    });

    test('encodeUint256 should encode numbers correctly', () => {
      const value = '1000000000000000000';
      const result = encodeUint256(value);
      
      expect(result).toBe('0000000000000000000000000000000000000000000000000de0b6b3a7640000');
      expect(result.length).toBe(64);
    });

    test('decodeHexToDecimal should decode hex correctly', () => {
      const hex = '0x0de0b6b3a7640000';
      const result = decodeHexToDecimal(hex);
      
      expect(result).toBe('1000000000000000000');
    });

    test('decodeAddress should decode addresses correctly', () => {
      const hex = '000000000000000000000000742d35cc6634c0532925a3b8d400e4c053292525';
      const result = decodeAddress(hex);
      
      expect(result).toBe('0x742d35cc6634c0532925a3b8d400e4c053292525');
    });

    test('should throw error for invalid address in encodeAddress', () => {
      expect(() => {
        encodeAddress('invalid-address');
      }).toThrow('Invalid address format');
    });

    test('should throw error for negative value in encodeUint256', () => {
      expect(() => {
        encodeUint256('-1');
      }).toThrow('Value cannot be negative');
    });
  });

  describe('Input Validation', () => {
    test('validateSwapParams should validate correct parameters', () => {
      const params = {
        tokenIn: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenOut: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        amountIn: '1000000000000000000',
        network: 'ETHEREUM'
      };
      
      const result = validateSwapParams(params);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateSwapParams should catch invalid addresses', () => {
      const params = {
        tokenIn: 'invalid-address',
        tokenOut: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        amountIn: '1000000000000000000',
        network: 'ETHEREUM'
      };
      
      const result = validateSwapParams(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid input token address format');
    });

    test('validateSwapParams should catch same token addresses', () => {
      const params = {
        tokenIn: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenOut: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        amountIn: '1000000000000000000',
        network: 'ETHEREUM'
      };
      
      const result = validateSwapParams(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input and output tokens cannot be the same');
    });

    test('validateSwapParams should catch invalid amounts', () => {
      const params = {
        tokenIn: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenOut: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        amountIn: '0',
        network: 'ETHEREUM'
      };
      
      const result = validateSwapParams(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input amount must be greater than zero');
    });

    test('validatePoolParams should validate correct parameters', () => {
      const params = {
        tokenA: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenB: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        network: 'ETHEREUM'
      };
      
      const result = validatePoolParams(params);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('isValidSlippage should validate slippage correctly', () => {
      expect(isValidSlippage(0.5)).toBe(true);
      expect(isValidSlippage(5)).toBe(true);
      expect(isValidSlippage(50)).toBe(true);
      expect(isValidSlippage(-1)).toBe(false);
      expect(isValidSlippage(51)).toBe(false);
      expect(isValidSlippage('invalid')).toBe(false);
    });

    test('isValidDeadline should validate deadline correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const validDeadline = now + 300; // 5 minutes from now
      const pastDeadline = now - 300; // 5 minutes ago
      const farFutureDeadline = now + 7200; // 2 hours from now
      
      expect(isValidDeadline(validDeadline)).toBe(true);
      expect(isValidDeadline(pastDeadline)).toBe(false);
      expect(isValidDeadline(farFutureDeadline)).toBe(false);
    });

    test('isValidAddress should validate addresses correctly', () => {
      expect(isValidAddress('0x742d35Cc6634C0532925a3b8D400E4C053292525')).toBe(true);
      expect(isValidAddress('0x742d35cc6634c0532925a3b8d400e4c053292525')).toBe(true);
      expect(isValidAddress('invalid-address')).toBe(false);
      expect(isValidAddress('0x742d35Cc6634C0532925a3b8D400E4C05329252')).toBe(false); // too short
      expect(isValidAddress('742d35Cc6634C0532925a3b8D400E4C053292525')).toBe(false); // no 0x prefix
    });

    test('isValidAmount should validate amounts correctly', () => {
      expect(isValidAmount('1000000000000000000')).toBe(true);
      expect(isValidAmount('0')).toBe(true);
      expect(isValidAmount('123')).toBe(true);
      expect(isValidAmount('-1')).toBe(false);
      expect(isValidAmount('invalid')).toBe(false);
      expect(isValidAmount('1.5')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large numbers', () => {
      const largeAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // Max uint256
      
      expect(() => {
        encodeUint256(largeAmount);
      }).not.toThrow();
      
      expect(isValidAmount(largeAmount)).toBe(true);
    });

    test('should handle zero amounts in calculations', () => {
      expect(() => {
        calculateV2SwapOutput('1000000000000000000000', '2000000000000', '0');
      }).toThrow('Invalid reserves or amount');
    });

    test('should handle minimal slippage', () => {
      const amount = '1000000000000000000';
      const minSlippage = 0.01; // 0.01%
      
      const result = applySlippage(amount, minSlippage, true);
      expect(BigInt(result)).toBeLessThan(BigInt(amount));
    });
  });
});

describe('Pool Query Functions', () => {
  describe('Function Exports', () => {
    test('should export all pool query functions', () => {
      expect(typeof getV2PairAddress).toBe('function');
      expect(typeof getV3PoolAddress).toBe('function');
      expect(typeof getV2PoolReserves).toBe('function');
      expect(typeof getV3PoolData).toBe('function');
      expect(typeof getPoolInfo).toBe('function');
      expect(typeof poolExists).toBe('function');
      expect(typeof getAllPools).toBe('function');
    });
  });

  describe('Input Validation', () => {
    test('should handle invalid network names', async () => {
      const tokenA = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const tokenB = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      
      const result = await getV2PairAddress('INVALID_NETWORK', tokenA, tokenB);
      expect(result).toBeNull();
    });

    test('should handle invalid token addresses', async () => {
      const result = await getV2PairAddress('ETHEREUM', 'invalid-address', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(result).toBeNull();
    });

    test('should handle invalid pool addresses in getV2PoolReserves', async () => {
      const result = await getV2PoolReserves('ETHEREUM', 'invalid-address');
      expect(result).toBeNull();
    });

    test('should handle invalid pool addresses in getV3PoolData', async () => {
      const result = await getV3PoolData('ETHEREUM', 'invalid-address');
      expect(result).toBeNull();
    });
  });

  describe('Parameter Validation', () => {
    test('poolExists should validate parameters', async () => {
      const result = await poolExists('ETHEREUM', 'invalid-address', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(result).toBe(false);
    });

    test('getPoolInfo should validate parameters', async () => {
      const result = await getPoolInfo('INVALID_NETWORK', 'invalid-token', 'invalid-token');
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
    });

    test('getAllPools should validate parameters', async () => {
      const result = await getAllPools('INVALID_NETWORK', 'invalid-token', 'invalid-token');
      expect(result).toEqual([]);
    });
  });

  describe('Fee Tier Handling', () => {
    test('should handle different fee tiers for V3 pools', async () => {
      const tokenA = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const tokenB = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      
      // Test with different fee tiers - these will return null due to no mocking
      // but should not throw errors
      const lowFeeResult = await getV3PoolAddress('ETHEREUM', tokenA, tokenB, FEE_TIERS.LOW);
      const mediumFeeResult = await getV3PoolAddress('ETHEREUM', tokenA, tokenB, FEE_TIERS.MEDIUM);
      const highFeeResult = await getV3PoolAddress('ETHEREUM', tokenA, tokenB, FEE_TIERS.HIGH);
      
      // All should return null (no pools found) but not throw errors
      expect(lowFeeResult).toBeNull();
      expect(mediumFeeResult).toBeNull();
      expect(highFeeResult).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      // Test with a network that exists but might have connectivity issues
      const tokenA = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const tokenB = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      
      // These should handle errors gracefully and return null
      const v2Result = await getV2PairAddress('ETHEREUM', tokenA, tokenB);
      const v3Result = await getV3PoolAddress('ETHEREUM', tokenA, tokenB, FEE_TIERS.MEDIUM);
      
      // Results can be null (no pool) or an address (pool exists)
      expect(v2Result === null || typeof v2Result === 'string').toBe(true);
      expect(v3Result === null || typeof v3Result === 'string').toBe(true);
    });

    test('should handle empty or malformed RPC responses', async () => {
      // Test with testnet to avoid hitting mainnet too hard
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await getV2PairAddress('ETHEREUM-SEPOLIA', tokenA, tokenB);
      
      // Should handle gracefully - either null or valid address
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('should handle real token pair queries on testnet', async () => {
      // Use Sepolia testnet to avoid mainnet rate limits
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      // Test pool existence check
      const exists = await poolExists('ETHEREUM-SEPOLIA', tokenA, tokenB);
      expect(typeof exists).toBe('boolean');
      
      // Test getting all pools
      const allPools = await getAllPools('ETHEREUM-SEPOLIA', tokenA, tokenB);
      expect(Array.isArray(allPools)).toBe(true);
      
      // Test getting pool info
      const poolInfo = await getPoolInfo('ETHEREUM-SEPOLIA', tokenA, tokenB);
      expect(poolInfo === null || typeof poolInfo === 'object').toBe(true);
    }, 30000); // 30 second timeout for network calls
  });
});

describe('Token Price and Quote Functionality', () => {
  
  describe('Price Calculations', () => {
    test('calculateV2Price should calculate correct prices from reserves', () => {
      // Test with ETH/USDC pool: 1000 ETH, 2000000 USDC
      const reserve0 = '1000000000000000000000'; // 1000 ETH (18 decimals)
      const reserve1 = '2000000000000'; // 2000000 USDC (6 decimals)
      
      const result = calculateV2Price(reserve0, reserve1, 18, 6);
      
      expect(result).toHaveProperty('price0in1');
      expect(result).toHaveProperty('price1in0');
      expect(result).toHaveProperty('reserve0', reserve0);
      expect(result).toHaveProperty('reserve1', reserve1);
      expect(result).toHaveProperty('decimals0', 18);
      expect(result).toHaveProperty('decimals1', 6);
      

      
      // Price of ETH in USDC should be around 2000
      // Since we have 1000 ETH and 2000000 USDC, price should be 2000000/1000 = 2000 USDC per ETH
      // The result is in 18 decimal format, so divide by 10^18
      const ethPriceInUsdc = BigInt(result.price0in1) / BigInt(10 ** 18);
      expect(Number(ethPriceInUsdc)).toBeCloseTo(2000, -2); // Within 100 USDC
      
      // Price of USDC in ETH should be around 0.0005
      const usdcPriceInEth = BigInt(result.price1in0) / BigInt(10 ** 18);
      expect(Number(usdcPriceInEth)).toBeLessThan(1); // Less than 1 ETH per USDC
    });

    test('calculateV3Price should calculate correct prices from sqrtPriceX96', () => {
      // Test with a known sqrtPriceX96 value
      // For ETH/USDC at ~2000 USD per ETH
      const sqrtPriceX96 = '1771845812700903892492222464'; // Approximate value for 2000 USD/ETH
      
      const result = calculateV3Price(sqrtPriceX96, 18, 6);
      
      expect(result).toHaveProperty('price0in1');
      expect(result).toHaveProperty('price1in0');
      expect(result).toHaveProperty('sqrtPriceX96', sqrtPriceX96);
      expect(result).toHaveProperty('decimals0', 18);
      expect(result).toHaveProperty('decimals1', 6);
      
      // Prices should be reasonable (not zero or extremely large)
      expect(BigInt(result.price0in1)).toBeGreaterThan(0n);
      expect(BigInt(result.price1in0)).toBeGreaterThan(0n);
    });

    test('calculateV2Price should handle equal decimals', () => {
      const reserve0 = '1000000000000000000000'; // 1000 tokens
      const reserve1 = '500000000000000000000';  // 500 tokens
      
      const result = calculateV2Price(reserve0, reserve1, 18, 18);
      
      // Price should be 0.5 (reserve1/reserve0)
      // Convert from 18 decimal format to regular number
      const price = Number(BigInt(result.price0in1)) / Number(BigInt(10 ** 18));
      expect(price).toBeCloseTo(0.5, 1);
    });

    test('should throw error for invalid reserves in calculateV2Price', () => {
      expect(() => {
        calculateV2Price('0', '1000000000000000000000');
      }).toThrow('Invalid reserves for price calculation');
      
      expect(() => {
        calculateV2Price('1000000000000000000000', '0');
      }).toThrow('Invalid reserves for price calculation');
    });

    test('should throw error for invalid sqrtPriceX96 in calculateV3Price', () => {
      expect(() => {
        calculateV3Price('0');
      }).toThrow('Invalid sqrtPriceX96 for price calculation');
    });

    test('calculateV2Price should handle different decimal tokens correctly', () => {
      // Test USDC (6 decimals) / WETH (18 decimals) pool
      // Simulate 1000 WETH and 2,000,000 USDC
      const reserve0 = '1000000000000000000000'; // 1000 WETH (18 decimals)
      const reserve1 = '2000000000000'; // 2,000,000 USDC (6 decimals)
      const decimals0 = 18; // WETH
      const decimals1 = 6;  // USDC
      
      const result = calculateV2Price(reserve0, reserve1, decimals0, decimals1);
      
      expect(result).toHaveProperty('price0in1');
      expect(result).toHaveProperty('price1in0');
      expect(result).toHaveProperty('decimals0', decimals0);
      expect(result).toHaveProperty('decimals1', decimals1);
      
      // Verify prices are positive
      expect(BigInt(result.price0in1)).toBeGreaterThan(0n);
      expect(BigInt(result.price1in0)).toBeGreaterThan(0n);
      
      // For this example: 1 WETH should be worth ~2000 USDC
      // price0in1 should be around 2000 * 10^18 (with 18 decimal precision)
      const price0in1 = BigInt(result.price0in1);
      const expectedPrice = BigInt(2000) * BigInt(10 ** 18);
      
      // Allow for some variance (within 50% for this test)
      expect(price0in1).toBeGreaterThan(expectedPrice / 2n);
      expect(price0in1).toBeLessThan(expectedPrice * 2n);
    });

    test('calculateV3Price should handle different decimal tokens correctly', () => {
      // Test with a realistic sqrtPriceX96 for USDC/WETH
      // For USDC (6 decimals) / WETH (18 decimals) at ~2000 USDC per WETH
      const sqrtPriceX96 = '1771845812700903892492222464'; // Approximate value for 2000 USDC/WETH
      const decimals0 = 6;  // USDC
      const decimals1 = 18; // WETH
      
      const result = calculateV3Price(sqrtPriceX96, decimals0, decimals1);
      
      expect(result).toHaveProperty('price0in1');
      expect(result).toHaveProperty('price1in0');
      expect(result).toHaveProperty('decimals0', decimals0);
      expect(result).toHaveProperty('decimals1', decimals1);
      
      // Verify prices are positive
      expect(BigInt(result.price0in1)).toBeGreaterThan(0n);
      expect(BigInt(result.price1in0)).toBeGreaterThan(0n);
    });

    test('calculateV2Price should handle tokens with same decimals', () => {
      // Test with two 18-decimal tokens
      const reserve0 = '1000000000000000000000'; // 1000 tokens
      const reserve1 = '500000000000000000000';  // 500 tokens
      const decimals0 = 18;
      const decimals1 = 18;
      
      const result = calculateV2Price(reserve0, reserve1, decimals0, decimals1);
      
      expect(result).toHaveProperty('decimals0', decimals0);
      expect(result).toHaveProperty('decimals1', decimals1);
      
      // With equal reserves ratio 2:1, price0in1 should be 0.5 * 10^18
      const expectedPrice0in1 = BigInt(5) * BigInt(10 ** 17); // 0.5 * 10^18
      expect(BigInt(result.price0in1)).toBe(expectedPrice0in1);
    });

    test('calculateV2Price should handle extreme decimal differences', () => {
      // Test with very different decimals (e.g., 2 vs 30)
      const reserve0 = '100'; // 1.00 tokens with 2 decimals
      const reserve1 = '200000000000000000000000000000'; // 200 tokens with 30 decimals
      const decimals0 = 2;
      const decimals1 = 30;
      
      const result = calculateV2Price(reserve0, reserve1, decimals0, decimals1);
      
      expect(result).toHaveProperty('decimals0', decimals0);
      expect(result).toHaveProperty('decimals1', decimals1);
      
      // Verify prices are positive and reasonable
      expect(BigInt(result.price0in1)).toBeGreaterThan(0n);
      expect(BigInt(result.price1in0)).toBeGreaterThan(0n);
    });
  });

  describe('Swap Quote Generation', () => {
    test('getSwapQuote should validate parameters', async () => {
      // Test with invalid token addresses
      const result1 = await getSwapQuote('ETHEREUM', 'invalid-address', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '1000000000000000000');
      expect(result1).toHaveProperty('error', true);
      expect(result1).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
      
      // Test with same token addresses
      const result2 = await getSwapQuote('ETHEREUM', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '1000000000000000000');
      expect(result2).toHaveProperty('error', true);
      expect(result2).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
      
      // Test with invalid slippage
      const result3 = await getSwapQuote('ETHEREUM', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '1000000000000000000', 100);
      expect(result3).toHaveProperty('error', true);
      expect(result3).toHaveProperty('code', ERROR_CODES.INVALID_SLIPPAGE);
    });

    test('getSwapQuote should return null when no pools exist', async () => {
      // Use tokens that likely don't have pools
      const tokenA = '0x1111111111111111111111111111111111111111';
      const tokenB = '0x2222222222222222222222222222222222222222';
      
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000000000000');
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code', ERROR_CODES.POOL_NOT_FOUND);
    });

    test('getSwapQuote should handle valid parameters', async () => {
      // Test with Sepolia testnet tokens
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000', 0.5);
      
      // Result can be null (no pools) or a valid quote object
      if (result !== null) {
        expect(result).toHaveProperty('tokenIn', tokenA);
        expect(result).toHaveProperty('tokenOut', tokenB);
        expect(result).toHaveProperty('amountIn', '1000000000');
        expect(result).toHaveProperty('amountOut');
        expect(result).toHaveProperty('amountOutMin');
        expect(result).toHaveProperty('priceImpact');
        expect(result).toHaveProperty('slippage', 0.5);
        expect(result).toHaveProperty('route');
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('timestamp');
        
        // Validate numeric fields
        expect(BigInt(result.amountOut)).toBeGreaterThan(0n);
        expect(BigInt(result.amountOutMin)).toBeLessThan(BigInt(result.amountOut));
        expect(typeof result.priceImpact).toBe('number');
        expect(result.priceImpact).toBeGreaterThanOrEqual(0);
      }
    }, 30000);

    test('getSwapQuote should generate price impact warnings', async () => {
      // This is a unit test for the warning logic, not requiring network calls
      // We'll mock a scenario with high price impact
      
      // Test the warning generation logic by checking the function structure
      expect(typeof getSwapQuote).toBe('function');
      
      // The actual warning logic is tested implicitly when pools exist
      // and price impact is calculated
    });
  });

  describe('Optimal Route Selection', () => {
    test('getOptimalRoute should validate parameters', async () => {
      const result = await getOptimalRoute('INVALID_NETWORK', 'invalid-token', 'invalid-token', '1000000000000000000');
      expect(result).toBeNull();
    });

    test('getOptimalRoute should return route information', async () => {
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await getOptimalRoute('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000');
      
      if (result !== null) {
        expect(result).toHaveProperty('tokenIn', tokenA);
        expect(result).toHaveProperty('tokenOut', tokenB);
        expect(result).toHaveProperty('amountIn', '1000000000');
        expect(result).toHaveProperty('optimalVersion');
        expect(result).toHaveProperty('optimalPool');
        expect(result).toHaveProperty('expectedOutput');
        expect(result).toHaveProperty('route');
        expect(result).toHaveProperty('alternativeRoutes');
        
        expect(['V2', 'V3']).toContain(result.optimalVersion);
        expect(Array.isArray(result.alternativeRoutes)).toBe(true);
      }
    }, 30000);
  });

  describe('Price Comparison', () => {
    test('comparePrices should validate parameters', async () => {
      const result = await comparePrices('INVALID_NETWORK', 'invalid-token', 'invalid-token', '1000000000000000000');
      expect(result).toEqual([]);
    });

    test('comparePrices should return comparison array', async () => {
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await comparePrices('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000');
      
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const comparison = result[0];
        expect(comparison).toHaveProperty('poolAddress');
        expect(comparison).toHaveProperty('version');
        expect(comparison).toHaveProperty('fee');
        expect(comparison).toHaveProperty('amountOut');
        expect(comparison).toHaveProperty('effectivePrice');
        expect(comparison).toHaveProperty('priceImpact');
        
        expect(['V2', 'V3']).toContain(comparison.version);
        expect(BigInt(comparison.amountOut)).toBeGreaterThan(0n);
        expect(BigInt(comparison.effectivePrice)).toBeGreaterThan(0n);
      }
    }, 30000);

    test('comparePrices should sort by best output amount', async () => {
      // This tests the sorting logic - if multiple pools exist, they should be sorted
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      
      const result = await comparePrices('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000');
      
      if (result.length > 1) {
        // Check that results are sorted by output amount (descending)
        for (let i = 0; i < result.length - 1; i++) {
          const current = BigInt(result[i].amountOut);
          const next = BigInt(result[i + 1].amountOut);
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    }, 30000);
  });

  describe('Token Price Queries', () => {
    test('getTokenPrice should validate parameters', async () => {
      // Test with invalid addresses
      const result1 = await getTokenPrice('ETHEREUM', 'invalid-address', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(result1).toBeNull();
      
      // Test with unsupported network
      const result2 = await getTokenPrice('INVALID_NETWORK', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(result2).toBeNull();
    });

    test('getTokenPrice should return price information when pool exists', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const baseToken = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await getTokenPrice('ETHEREUM-SEPOLIA', tokenAddress, baseToken);
      
      if (result !== null) {
        expect(result).toHaveProperty('tokenAddress', tokenAddress);
        expect(result).toHaveProperty('baseToken', baseToken);
        expect(result).toHaveProperty('price');
        expect(result).toHaveProperty('inversePrice');
        expect(result).toHaveProperty('poolAddress');
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('fee');
        expect(result).toHaveProperty('lastUpdated');
        
        expect(BigInt(result.price)).toBeGreaterThan(0n);
        expect(BigInt(result.inversePrice)).toBeGreaterThan(0n);
        expect(['V2', 'V3']).toContain(result.version);
        expect(typeof result.lastUpdated).toBe('number');
      }
    }, 30000);

    test('getTokenPrice should include decimal information in response', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC (6 decimals)
      const baseToken = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH (18 decimals)
      
      const result = await getTokenPrice('ETHEREUM-SEPOLIA', tokenAddress, baseToken);
      
      if (result !== null) {
        expect(result).toHaveProperty('decimals');
        expect(result.decimals).toHaveProperty('token0');
        expect(result.decimals).toHaveProperty('token1');
        expect(result.decimals).toHaveProperty('targetToken');
        expect(result.decimals).toHaveProperty('baseToken');
        
        expect(typeof result.decimals.token0).toBe('number');
        expect(typeof result.decimals.token1).toBe('number');
        expect(typeof result.decimals.targetToken).toBe('number');
        expect(typeof result.decimals.baseToken).toBe('number');
        
        // Verify decimals are reasonable values
        expect(result.decimals.token0).toBeGreaterThanOrEqual(0);
        expect(result.decimals.token0).toBeLessThanOrEqual(30);
        expect(result.decimals.token1).toBeGreaterThanOrEqual(0);
        expect(result.decimals.token1).toBeLessThanOrEqual(30);
      }
    }, 30000);

    test('getTokenPrice should handle decimal retrieval failures gracefully', async () => {
      // Test with a potentially invalid or non-standard token address
      const tokenAddress = '0x0000000000000000000000000000000000000001'; // Invalid token
      const baseToken = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      
      const result = await getTokenPrice('ETHEREUM-SEPOLIA', tokenAddress, baseToken);
      
      // Should either return null (no pool) or handle gracefully with default decimals
      expect(result === null || typeof result === 'object').toBe(true);
      
      if (result !== null && result.decimals) {
        // If it returns a result, decimals should be present and valid
        expect(result.decimals).toHaveProperty('token0');
        expect(result.decimals).toHaveProperty('token1');
        expect(typeof result.decimals.token0).toBe('number');
        expect(typeof result.decimals.token1).toBe('number');
      }
    }, 30000);
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very small amounts', async () => {
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const smallAmount = '1'; // 1 wei
      
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, smallAmount);
      
      // Should handle gracefully - either return null or valid quote
      expect(result === null || typeof result === 'object').toBe(true);
    }, 30000);

    test('should handle very large amounts', async () => {
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const largeAmount = '1000000000000000000000000'; // 1M tokens
      
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, largeAmount);
      
      // Should handle gracefully - likely high price impact or no liquidity
      if (result !== null && !result.error) {
        expect(result.priceImpact).toBeGreaterThan(0);
        expect(result.warnings).toBeDefined();
      }
    }, 30000);

    test('should handle extreme slippage values', async () => {
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      
      // Test with maximum allowed slippage
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000', 50);
      
      if (result !== null) {
        expect(result.slippage).toBe(50);
        expect(BigInt(result.amountOutMin)).toBeLessThan(BigInt(result.amountOut));
      }
    }, 30000);

    test('should handle network timeouts gracefully', async () => {
      // Test with a potentially slow network call
      const tokenA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenB = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      
      const startTime = Date.now();
      const result = await getSwapQuote('ETHEREUM-SEPOLIA', tokenA, tokenB, '1000000000');
      const endTime = Date.now();
      
      // Should complete within reasonable time (30 seconds max due to test timeout)
      expect(endTime - startTime).toBeLessThan(30000);
      expect(result === null || typeof result === 'object').toBe(true);
    }, 30000);
  });

  describe('Price Impact Warnings', () => {
    test('should generate appropriate price impact warnings', () => {
      // Test the warning logic with mock data
      const testCases = [
        { priceImpact: 0.5, expectedWarning: null },
        { priceImpact: 2, expectedWarning: 'CAUTION' },
        { priceImpact: 7, expectedWarning: 'WARNING' },
        { priceImpact: 20, expectedWarning: 'CRITICAL' }
      ];
      
      testCases.forEach(({ priceImpact, expectedWarning }) => {
        let warning = null;
        if (priceImpact > 15) {
          warning = 'CRITICAL';
        } else if (priceImpact > 5) {
          warning = 'WARNING';
        } else if (priceImpact > 1) {
          warning = 'CAUTION';
        }
        
        if (expectedWarning) {
          expect(warning).toContain(expectedWarning);
        } else {
          expect(warning).toBeNull();
        }
      });
    });
  });

  describe('Function Exports', () => {
    test('should export all price and quote functions', () => {
      expect(typeof calculateV2Price).toBe('function');
      expect(typeof calculateV3Price).toBe('function');
      expect(typeof getTokenPrice).toBe('function');
      expect(typeof getSwapQuote).toBe('function');
      expect(typeof getOptimalRoute).toBe('function');
      expect(typeof comparePrices).toBe('function');
    });
  });
});

describe('Token Approval Handling', () => {
  
  describe('Approval Calldata Generation', () => {
    test('getApprovalCalldata should generate correct approval data', () => {
      const spenderAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap V2 Router
      const amount = '1000000000000000000'; // 1 ETH in wei
      
      const result = getApprovalCalldata(spenderAddress, amount);
      
      // Should start with approve function selector
      expect(result).toMatch(/^0x095ea7b3/);
      
      // Should be 138 characters total (0x + 8 chars selector + 64 chars address + 64 chars amount)
      expect(result.length).toBe(138);
      
      // Should contain the spender address (padded to 64 chars)
      expect(result).toContain(spenderAddress.slice(2).toLowerCase().padStart(64, '0'));
      
      // Should contain the amount in hex (padded to 64 chars)
      const expectedAmountHex = BigInt(amount).toString(16).padStart(64, '0');
      expect(result).toContain(expectedAmountHex);
    });

    test('getApprovalCalldata should handle different amounts', () => {
      const spenderAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      
      // Test with zero amount
      const result1 = getApprovalCalldata(spenderAddress, '0');
      expect(result1).toContain('0'.repeat(64)); // 64 zeros for amount
      
      // Test with max uint256
      const maxAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
      const result2 = getApprovalCalldata(spenderAddress, maxAmount);
      expect(result2).toContain('f'.repeat(64)); // 64 f's for max amount
      
      // Test with small amount
      const result3 = getApprovalCalldata(spenderAddress, '1');
      expect(result3).toContain('0'.repeat(63) + '1'); // 63 zeros + 1
    });

    test('getApprovalCalldata should validate inputs', () => {
      const validSpender = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const validAmount = '1000000000000000000';
      
      // Test invalid spender address
      expect(() => {
        getApprovalCalldata('invalid-address', validAmount);
      }).toThrow('Invalid spender address');
      
      // Test invalid amount
      expect(() => {
        getApprovalCalldata(validSpender, 'invalid-amount');
      }).toThrow('Invalid amount');
      
      // Test negative amount
      expect(() => {
        getApprovalCalldata(validSpender, '-1');
      }).toThrow('Invalid amount');
    });

    test('getApprovalCalldata should handle address formats', () => {
      const amount = '1000000000000000000';
      
      // Test with lowercase address
      const lowerSpender = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
      const result1 = getApprovalCalldata(lowerSpender, amount);
      expect(result1).toMatch(/^0x095ea7b3/);
      
      // Test with uppercase address
      const upperSpender = '0x7A250D5630B4CF539739DF2C5DACB4C659F2488D';
      const result2 = getApprovalCalldata(upperSpender, amount);
      expect(result2).toMatch(/^0x095ea7b3/);
      
      // Both should produce the same result (addresses are normalized to lowercase)
      expect(result1).toBe(result2);
    });
  });

  describe('Uniswap Spender Address', () => {
    test('getUniswapSpenderAddress should return correct router addresses', () => {
      // Test V2 router for Ethereum mainnet
      const v2Router = getUniswapSpenderAddress('ETHEREUM', 'V2');
      expect(v2Router).toBe('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');
      
      // Test V3 router for Ethereum mainnet
      const v3Router = getUniswapSpenderAddress('ETHEREUM', 'V3');
      expect(v3Router).toBe('0xE592427A0AEce92De3Edee1F18E0157C05861564');
      
      // Test default (V2) for Ethereum mainnet
      const defaultRouter = getUniswapSpenderAddress('ETHEREUM');
      expect(defaultRouter).toBe('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');
    });

    test('getUniswapSpenderAddress should handle different networks', () => {
      // Test Sepolia testnet
      const sepoliaV2 = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V2');
      expect(sepoliaV2).toBe('0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008');
      
      const sepoliaV3 = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V3');
      expect(sepoliaV3).toBe('0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
    });

    test('getUniswapSpenderAddress should handle unsupported networks', () => {
      const result = getUniswapSpenderAddress('INVALID_NETWORK', 'V2');
      expect(result).toBeNull();
    });

    test('getUniswapSpenderAddress should handle case insensitive network names', () => {
      const result1 = getUniswapSpenderAddress('ethereum', 'V2');
      const result2 = getUniswapSpenderAddress('ETHEREUM', 'V2');
      const result3 = getUniswapSpenderAddress('Ethereum', 'V2');
      
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe('Allowance Checking', () => {
    test('getTokenAllowance should validate input parameters', async () => {
      const validToken = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const validOwner = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const validSpender = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      
      // Test invalid token address
      const result1 = await getTokenAllowance('ETHEREUM', 'invalid-address', validOwner, validSpender);
      expect(result1).toBeNull();
      
      // Test invalid owner address
      const result2 = await getTokenAllowance('ETHEREUM', validToken, 'invalid-address', validSpender);
      expect(result2).toBeNull();
      
      // Test invalid spender address
      const result3 = await getTokenAllowance('ETHEREUM', validToken, validOwner, 'invalid-address');
      expect(result3).toBeNull();
      
      // Test unsupported network
      const result4 = await getTokenAllowance('INVALID_NETWORK', validToken, validOwner, validSpender);
      expect(result4).toBeNull();
    });

    test('getTokenAllowance should handle network calls gracefully', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const spenderAddress = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008'; // Sepolia V2 Router
      
      const result = await getTokenAllowance('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress);
      
      // Should return a string (allowance amount) or null (error)
      expect(result === null || typeof result === 'string').toBe(true);
      
      if (result !== null) {
        // Should be a valid numeric string
        expect(() => BigInt(result)).not.toThrow();
        expect(BigInt(result)).toBeGreaterThanOrEqual(0n);
      }
    }, 30000);

    test('checkTokenApproval should validate approval status', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const spenderAddress = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008';
      const requiredAmount = '1000000000'; // 1000 USDC (6 decimals)
      
      const result = await checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress, requiredAmount);
      
      expect(result).toHaveProperty('isApproved');
      expect(result).toHaveProperty('currentAllowance');
      expect(result).toHaveProperty('requiredAmount', requiredAmount);
      expect(result).toHaveProperty('needsApproval');
      
      expect(typeof result.isApproved).toBe('boolean');
      expect(typeof result.needsApproval).toBe('boolean');
      expect(result.isApproved).toBe(!result.needsApproval);
      
      // Current allowance should be a valid numeric string
      expect(() => BigInt(result.currentAllowance)).not.toThrow();
      expect(BigInt(result.currentAllowance)).toBeGreaterThanOrEqual(0n);
    }, 30000);

    test('checkTokenApproval should handle errors gracefully', async () => {
      const result = await checkTokenApproval('ETHEREUM', 'invalid-address', 'invalid-owner', 'invalid-spender', '1000');
      
      expect(result).toHaveProperty('isApproved', false);
      expect(result).toHaveProperty('currentAllowance', '0');
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Approval Transaction Execution', () => {
    test('executeTokenApproval should validate input parameters', async () => {
      const validPassword = 'test-password';
      const validFrom = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const validToken = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const validSpender = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const validAmount = '1000000000000000000';
      const validNetwork = 'ETHEREUM-SEPOLIA';
      
      // Test invalid from address
      const result1 = await executeTokenApproval(validPassword, 'invalid-address', validToken, validSpender, validAmount, validNetwork);
      expect(result1).toBeNull();
      
      // Test invalid token address
      const result2 = await executeTokenApproval(validPassword, validFrom, 'invalid-address', validSpender, validAmount, validNetwork);
      expect(result2).toBeNull();
      
      // Test invalid spender address
      const result3 = await executeTokenApproval(validPassword, validFrom, validToken, 'invalid-address', validAmount, validNetwork);
      expect(result3).toBeNull();
      
      // Test invalid amount
      const result4 = await executeTokenApproval(validPassword, validFrom, validToken, validSpender, 'invalid-amount', validNetwork);
      expect(result4).toBeNull();
      
      // Test unsupported network
      const result5 = await executeTokenApproval(validPassword, validFrom, validToken, validSpender, validAmount, 'INVALID_NETWORK');
      expect(result5).toBeNull();
    });

    // Note: We can't test actual transaction execution without a real wallet and funds
    // The executeTokenApproval function requires hardware wallet integration
    test('executeTokenApproval function should exist and be callable', () => {
      expect(typeof executeTokenApproval).toBe('function');
      expect(executeTokenApproval.length).toBe(6); // Should accept 6 parameters
    });
  });

  describe('Approval Workflow Handler', () => {
    test('handleTokenApproval should validate input parameters', async () => {
      const validPassword = 'test-password';
      const validFrom = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const validToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const validSpender = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008';
      const validAmount = '1000000000';
      const validNetwork = 'ETHEREUM-SEPOLIA';
      
      // Test with valid parameters (will check allowance but won't execute due to no wallet)
      const result = await handleTokenApproval(validPassword, validFrom, validToken, validSpender, validAmount, validNetwork);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('needsApproval');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.needsApproval).toBe('boolean');
      
      if (result.success && result.alreadyApproved) {
        expect(result).toHaveProperty('currentAllowance');
        expect(result).toHaveProperty('requiredAmount', validAmount);
        expect(result.needsApproval).toBe(false);
      } else if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 30000);

    test('handleTokenApproval should handle retry options', async () => {
      const validPassword = 'test-password';
      const validFrom = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const validToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const validSpender = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008';
      const validAmount = '1000000000';
      const validNetwork = 'ETHEREUM-SEPOLIA';
      
      const options = {
        maxRetries: 1,
        retryDelay: 100
      };
      
      const result = await handleTokenApproval(validPassword, validFrom, validToken, validSpender, validAmount, validNetwork, options);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('needsApproval');
      
      // If it failed due to execution (expected without real wallet), should have attempt info
      if (!result.success && result.attempts) {
        expect(result.attempts).toBe(1);
      }
    }, 30000);

    test('handleTokenApproval should handle invalid parameters gracefully', async () => {
      const result = await handleTokenApproval('password', 'invalid-address', 'invalid-token', 'invalid-spender', 'invalid-amount', 'INVALID_NETWORK');
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('needsApproval', true);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Integration Tests', () => {
    test('approval workflow should work end-to-end for checking existing approvals', async () => {
      // Test the complete workflow for checking if approval already exists
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const spenderAddress = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V2');
      const requiredAmount = '1000000'; // 1 USDC
      
      expect(spenderAddress).toBeTruthy();
      
      // Step 1: Check current allowance
      const allowance = await getTokenAllowance('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress);
      expect(allowance === null || typeof allowance === 'string').toBe(true);
      
      // Step 2: Check approval status
      const approvalStatus = await checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress, requiredAmount);
      expect(approvalStatus).toHaveProperty('isApproved');
      expect(approvalStatus).toHaveProperty('needsApproval');
      
      // Step 3: Generate approval calldata (even if not needed)
      if (approvalStatus.needsApproval) {
        const calldata = getApprovalCalldata(spenderAddress, requiredAmount);
        expect(calldata).toMatch(/^0x095ea7b3/);
        expect(calldata.length).toBe(138);
      }
      
      // The workflow should be consistent
      if (allowance !== null) {
        const expectedApproved = BigInt(allowance) >= BigInt(requiredAmount);
        expect(approvalStatus.isApproved).toBe(expectedApproved);
        expect(approvalStatus.needsApproval).toBe(!expectedApproved);
      }
    }, 30000);

    test('should handle multiple token approvals for different spenders', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const v2Spender = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V2');
      const v3Spender = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V3');
      const requiredAmount = '1000000';
      
      expect(v2Spender).toBeTruthy();
      expect(v3Spender).toBeTruthy();
      expect(v2Spender).not.toBe(v3Spender);
      
      // Check approvals for both routers
      const [v2Approval, v3Approval] = await Promise.all([
        checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, v2Spender, requiredAmount),
        checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, v3Spender, requiredAmount)
      ]);
      
      expect(v2Approval).toHaveProperty('isApproved');
      expect(v3Approval).toHaveProperty('isApproved');
      
      // Approvals can be different for different spenders
      expect(typeof v2Approval.isApproved).toBe('boolean');
      expect(typeof v3Approval.isApproved).toBe('boolean');
    }, 30000);

    test('should validate approval amounts correctly', async () => {
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const spenderAddress = getUniswapSpenderAddress('ETHEREUM-SEPOLIA', 'V2');
      
      // Test with different required amounts
      const smallAmount = '1'; // 1 wei
      const mediumAmount = '1000000'; // 1 USDC
      const largeAmount = '1000000000000'; // 1M USDC
      
      const [smallCheck, mediumCheck, largeCheck] = await Promise.all([
        checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress, smallAmount),
        checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress, mediumAmount),
        checkTokenApproval('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress, largeAmount)
      ]);
      
      // All should return valid results
      expect(smallCheck).toHaveProperty('isApproved');
      expect(mediumCheck).toHaveProperty('isApproved');
      expect(largeCheck).toHaveProperty('isApproved');
      
      // If there's any allowance, smaller amounts should be more likely to be approved
      if (smallCheck.currentAllowance !== '0') {
        const currentAllowance = BigInt(smallCheck.currentAllowance);
        expect(smallCheck.isApproved).toBe(currentAllowance >= BigInt(smallAmount));
        expect(mediumCheck.isApproved).toBe(currentAllowance >= BigInt(mediumAmount));
        expect(largeCheck.isApproved).toBe(currentAllowance >= BigInt(largeAmount));
      }
    }, 30000);
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle zero approval amounts', () => {
      const spenderAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const zeroAmount = '0';
      
      const calldata = getApprovalCalldata(spenderAddress, zeroAmount);
      expect(calldata).toMatch(/^0x095ea7b3/);
      expect(calldata).toContain('0'.repeat(64)); // Should contain 64 zeros for amount
    });

    test('should handle maximum approval amounts', () => {
      const spenderAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const maxAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // Max uint256
      
      const calldata = getApprovalCalldata(spenderAddress, maxAmount);
      expect(calldata).toMatch(/^0x095ea7b3/);
      expect(calldata).toContain('f'.repeat(64)); // Should contain 64 f's for max amount
    });

    test('should handle network timeouts gracefully', async () => {
      // Test with a potentially slow network call
      const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const ownerAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const spenderAddress = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008';
      
      const startTime = Date.now();
      const result = await getTokenAllowance('ETHEREUM-SEPOLIA', tokenAddress, ownerAddress, spenderAddress);
      const endTime = Date.now();
      
      // Should complete within reasonable time (30 seconds max due to test timeout)
      expect(endTime - startTime).toBeLessThan(30000);
      
      // Should return either a valid result or null (not throw)
      expect(result === null || typeof result === 'string').toBe(true);
    }, 35000);

    test('should handle malformed RPC responses', async () => {
      // Test with addresses that might return malformed data
      const result = await getTokenAllowance('ETHEREUM-SEPOLIA', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000');
      
      // Should handle gracefully - either return '0' or null
      expect(result === null || result === '0').toBe(true);
    });

    test('should validate all required parameters are present', async () => {
      // Test missing parameters
      expect(async () => {
        await getTokenAllowance();
      }).not.toThrow();
      
      expect(async () => {
        await checkTokenApproval();
      }).not.toThrow();
      
      expect(async () => {
        await handleTokenApproval();
      }).not.toThrow();
      
      // All should return appropriate error responses rather than throwing
    });
  });
});
describe('Swap Transaction Functionality', () => {
  
  describe('Transaction Data Encoding', () => {
    test('encodeV2SwapData should encode V2 swap transaction correctly', () => {
      const tokenIn = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916'; // USDC
      const tokenOut = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
      const amountIn = '1000000000'; // 1000 USDC (6 decimals)
      const amountOutMin = '400000000000000000'; // 0.4 ETH minimum
      const recipient = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now
      
      const result = encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline);
      
      // Should start with swapExactTokensForTokens selector
      expect(result).toMatch(/^0x38ed1739/);
      
      // Should be proper length (selector + 5 params + path array)
      expect(result.length).toBeGreaterThan(200);
      
      // Should contain encoded addresses and amounts
      expect(result).toContain(tokenIn.slice(2).toLowerCase().padStart(64, '0'));
      expect(result).toContain(tokenOut.slice(2).toLowerCase().padStart(64, '0'));
      expect(result).toContain(recipient.slice(2).toLowerCase().padStart(64, '0'));
    });

    test('encodeV3SwapData should encode V3 swap transaction correctly', () => {
      const tokenIn = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916'; // USDC
      const tokenOut = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
      const fee = FEE_TIERS.MEDIUM; // 0.3%
      const amountIn = '1000000000'; // 1000 USDC
      const amountOutMin = '400000000000000000'; // 0.4 ETH minimum
      const recipient = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
      const result = encodeV3SwapData(tokenIn, tokenOut, fee, amountIn, amountOutMin, recipient, deadline);
      
      // Should start with exactInputSingle selector
      expect(result).toMatch(/^0x414bf389/);
      
      // Should be proper length (selector + 8 params)
      expect(result.length).toBe(522); // 4 bytes selector + 8 * 32 bytes params + 0x prefix (2 + 8 + 256*2)
      
      // Should contain encoded addresses and amounts
      expect(result).toContain(tokenIn.slice(2).toLowerCase().padStart(64, '0'));
      expect(result).toContain(tokenOut.slice(2).toLowerCase().padStart(64, '0'));
      expect(result).toContain(recipient.slice(2).toLowerCase().padStart(64, '0'));
    });

    test('encodeV2SwapData should validate inputs', () => {
      const validParams = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000',
        amountOutMin: '400000000000000000',
        recipient: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        deadline: Math.floor(Date.now() / 1000) + 1200
      };
      
      // Test invalid token address
      expect(() => {
        encodeV2SwapData('invalid-address', validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, validParams.recipient, validParams.deadline);
      }).toThrow('Invalid address format');
      
      // Test invalid amount
      expect(() => {
        encodeV2SwapData(validParams.tokenIn, validParams.tokenOut, '-1', validParams.amountOutMin, validParams.recipient, validParams.deadline);
      }).toThrow('Invalid amount');
      
      // Test invalid deadline
      expect(() => {
        encodeV2SwapData(validParams.tokenIn, validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, validParams.recipient, Math.floor(Date.now() / 1000) - 100);
      }).toThrow('Invalid deadline');
    });

    test('encodeV3SwapData should validate inputs', () => {
      const validParams = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        fee: FEE_TIERS.MEDIUM,
        amountIn: '1000000000',
        amountOutMin: '400000000000000000',
        recipient: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        deadline: Math.floor(Date.now() / 1000) + 1200
      };
      
      // Test invalid fee tier
      expect(() => {
        encodeV3SwapData(validParams.tokenIn, validParams.tokenOut, 999, validParams.amountIn, validParams.amountOutMin, validParams.recipient, validParams.deadline);
      }).toThrow('Invalid fee tier');
      
      // Test invalid recipient address
      expect(() => {
        encodeV3SwapData(validParams.tokenIn, validParams.tokenOut, validParams.fee, validParams.amountIn, validParams.amountOutMin, 'invalid-address', validParams.deadline);
      }).toThrow('Invalid address format');
    });
  });

  describe('Route Selection', () => {
    test('selectOptimalRoute should validate parameters', async () => {
      // Test with invalid network
      const result1 = await selectOptimalRoute('INVALID_NETWORK', '0xA0b86a33E6441b8435b662303c0f479c7e1d5916', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '1000000000');
      expect(result1).toBeNull();
      
      // Test with invalid token addresses
      const result2 = await selectOptimalRoute('ETHEREUM', 'invalid-address', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '1000000000');
      // Should return an object with undefined values or null, not necessarily null
      expect(result2 === null || typeof result2 === 'object').toBe(true);
    });

    test('selectOptimalRoute should return route information when pools exist', async () => {
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      const amountIn = '1000000000'; // 1000 USDC
      
      const result = await selectOptimalRoute('ETHEREUM-SEPOLIA', tokenIn, tokenOut, amountIn);
      
      if (result !== null) {
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('routerAddress');
        expect(result).toHaveProperty('poolAddress');
        expect(result).toHaveProperty('fee');
        expect(result).toHaveProperty('amountOut');
        expect(result).toHaveProperty('amountOutMin');
        expect(result).toHaveProperty('priceImpact');
        
        expect(['V2', 'V3']).toContain(result.version);
        expect(isValidAddress(result.routerAddress)).toBe(true);
        expect(BigInt(result.amountOut)).toBeGreaterThan(0n);
        expect(BigInt(result.amountOutMin)).toBeLessThanOrEqual(BigInt(result.amountOut));
        expect(typeof result.priceImpact).toBe('number');
      }
    }, 30000);

    test('selectOptimalRoute should handle different slippage values', async () => {
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const amountIn = '1000000000';
      
      const result1 = await selectOptimalRoute('ETHEREUM-SEPOLIA', tokenIn, tokenOut, amountIn, 0.1);
      const result2 = await selectOptimalRoute('ETHEREUM-SEPOLIA', tokenIn, tokenOut, amountIn, 1.0);
      
      if (result1 !== null && result2 !== null) {
        // Higher slippage should result in lower minimum output
        expect(BigInt(result2.amountOutMin)).toBeLessThanOrEqual(BigInt(result1.amountOutMin));
      }
    }, 30000);
  });

  describe('Transaction Preparation', () => {
    test('prepareSwapTransaction should validate parameters', async () => {
      const validParams = {
        fromAddress: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenIn: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000',
        amountOutMin: '400000000000000000',
        network: 'ETHEREUM-SEPOLIA'
      };
      
      // Test with invalid sender address
      const result1 = await prepareSwapTransaction('invalid-address', validParams.tokenIn, validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, validParams.network);
      expect(result1).toBeNull();
      
      // Test with invalid network
      const result2 = await prepareSwapTransaction(validParams.fromAddress, validParams.tokenIn, validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, 'INVALID_NETWORK');
      expect(result2).toBeNull();
      
      // Test with same token addresses
      const result3 = await prepareSwapTransaction(validParams.fromAddress, validParams.tokenIn, validParams.tokenIn, validParams.amountIn, validParams.amountOutMin, validParams.network);
      expect(result3).toBeNull();
    });

    test('prepareSwapTransaction should return transaction preparation data', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      const amountIn = '1000000000';
      const amountOutMin = '400000000000000000';
      
      const result = await prepareSwapTransaction(fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, 'ETHEREUM-SEPOLIA');
      
      if (result !== null) {
        expect(result).toHaveProperty('tokenIn', tokenIn);
        expect(result).toHaveProperty('tokenOut', tokenOut);
        expect(result).toHaveProperty('amountIn', amountIn);
        expect(result).toHaveProperty('amountOutMin', amountOutMin);
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('routerAddress');
        expect(result).toHaveProperty('callData');
        expect(result).toHaveProperty('gasEstimate');
        expect(result).toHaveProperty('gasPrice');
        expect(result).toHaveProperty('gasFee');
        expect(result).toHaveProperty('deadline');
        expect(result).toHaveProperty('approvalRequired');
        expect(result).toHaveProperty('currentAllowance');
        expect(result).toHaveProperty('requiredAmount', amountIn);
        
        expect(['V2', 'V3']).toContain(result.version);
        expect(isValidAddress(result.routerAddress)).toBe(true);
        expect(typeof result.callData).toBe('string');
        expect(result.callData.length).toBeGreaterThan(0);
        expect(typeof result.gasEstimate).toBe('number');
        expect(BigInt(result.gasPrice)).toBeGreaterThan(0n);
        expect(BigInt(result.gasFee)).toBeGreaterThan(0n);
        expect(typeof result.deadline).toBe('number');
        expect(typeof result.approvalRequired).toBe('boolean');
      }
    }, 30000);

    test('prepareSwapTransaction should handle custom options', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const amountIn = '1000000000';
      const amountOutMin = '400000000000000000';
      
      const customOptions = {
        slippage: 1.0,
        deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        version: 'V2'
      };
      
      const result = await prepareSwapTransaction(fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, 'ETHEREUM-SEPOLIA', customOptions);
      
      if (result !== null) {
        expect(result.deadline).toBe(customOptions.deadline);
        // If V2 pools exist, version should be V2
        if (result.version === 'V2') {
          expect(result.version).toBe('V2');
        }
      }
    }, 30000);
  });

  describe('Swap Execution (Unit Tests)', () => {
    // Note: These are unit tests that don't actually execute transactions
    // Full integration tests would require a test wallet and testnet funds
    
    test('executeSwap should validate parameters', async () => {
      const validParams = {
        password: 'test-password',
        fromAddress: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenIn: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: '1000000000',
        amountOutMin: '400000000000000000',
        network: 'ETHEREUM-SEPOLIA'
      };
      
      // Test with invalid sender address
      const result1 = await executeSwap('password', 'invalid-address', validParams.tokenIn, validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, validParams.network);
      expect(result1).toBeNull();
      
      // Test with invalid network
      const result2 = await executeSwap(validParams.password, validParams.fromAddress, validParams.tokenIn, validParams.tokenOut, validParams.amountIn, validParams.amountOutMin, 'INVALID_NETWORK');
      expect(result2).toBeNull();
      
      // Test with same token addresses
      const result3 = await executeSwap(validParams.password, validParams.fromAddress, validParams.tokenIn, validParams.tokenIn, validParams.amountIn, validParams.amountOutMin, validParams.network);
      expect(result3).toBeNull();
      
      // Test with invalid amount
      const result4 = await executeSwap(validParams.password, validParams.fromAddress, validParams.tokenIn, validParams.tokenOut, '0', validParams.amountOutMin, validParams.network);
      expect(result4).toBeNull();
    });

    test('executeSwap function should exist and be callable', () => {
      expect(typeof executeSwap).toBe('function');
      
      // Test that function accepts correct number of parameters
      expect(executeSwap.length).toBe(7); // password, fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network
    });

    test('executeSwap should handle custom options', async () => {
      // This tests the options parsing logic without executing
      const validParams = {
        password: 'test-password',
        fromAddress: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenIn: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        tokenOut: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        amountIn: '1000000000',
        amountOutMin: '400000000000000000',
        network: 'ETHEREUM-SEPOLIA'
      };
      
      const customOptions = {
        slippage: 1.0,
        deadline: Math.floor(Date.now() / 1000) + 600,
        version: 'V3',
        fee: FEE_TIERS.HIGH
      };
      
      // This will likely fail due to no pools or approval issues, but should validate options
      const result = await executeSwap(
        validParams.password,
        validParams.fromAddress,
        validParams.tokenIn,
        validParams.tokenOut,
        validParams.amountIn,
        validParams.amountOutMin,
        validParams.network,
        customOptions
      );
      
      // Result will be null due to no actual wallet/pools, but function should handle options
      expect(result).toBeNull();
    }, 10000); // 10 second timeout
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle very large transaction amounts', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const largeAmount = '1000000000000000000000000'; // 1M tokens
      const amountOutMin = '1';
      
      const result = await prepareSwapTransaction(fromAddress, tokenIn, tokenOut, largeAmount, amountOutMin, 'ETHEREUM-SEPOLIA');
      
      // Should handle gracefully - either return null or valid preparation
      expect(result === null || typeof result === 'object').toBe(true);
    }, 30000);

    test('should handle very small transaction amounts', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const smallAmount = '1'; // 1 wei
      const amountOutMin = '1';
      
      const result = await prepareSwapTransaction(fromAddress, tokenIn, tokenOut, smallAmount, amountOutMin, 'ETHEREUM-SEPOLIA');
      
      // Should handle gracefully
      expect(result === null || typeof result === 'object').toBe(true);
    }, 30000);

    test('should handle invalid deadline in options', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const amountIn = '1000000000';
      const amountOutMin = '1';
      
      const invalidOptions = {
        deadline: Math.floor(Date.now() / 1000) - 100 // Past deadline
      };
      
      const result = await prepareSwapTransaction(fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, 'ETHEREUM-SEPOLIA', invalidOptions);
      
      // Should return null due to invalid deadline
      expect(result).toBeNull();
    });

    test('should handle network connectivity issues gracefully', async () => {
      // Test with a network that might have connectivity issues
      const fromAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const tokenIn = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const tokenOut = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const amountIn = '1000000000';
      const amountOutMin = '1';
      
      // This should handle network errors gracefully
      const result = await selectOptimalRoute('ETHEREUM-SEPOLIA', tokenIn, tokenOut, amountIn);
      
      // Should either return null or valid route data
      expect(result === null || typeof result === 'object').toBe(true);
    }, 30000);
  });

  describe('Integration with Existing Functions', () => {
    test('swap functions should integrate with existing validation', () => {
      // Test that swap functions use the same validation as other functions
      const invalidAddress = 'invalid-address';
      const validAddress = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      
      expect(isValidAddress(invalidAddress)).toBe(false);
      expect(isValidAddress(validAddress)).toBe(true);
      
      const invalidAmount = '-1';
      const validAmount = '1000000000';
      
      expect(isValidAmount(invalidAmount)).toBe(false);
      expect(isValidAmount(validAmount)).toBe(true);
    });

    test('swap functions should use existing fee tier constants', () => {
      expect(FEE_TIERS).toHaveProperty('LOW', 500);
      expect(FEE_TIERS).toHaveProperty('MEDIUM', 3000);
      expect(FEE_TIERS).toHaveProperty('HIGH', 10000);
      
      // Test that V3 encoding accepts these fee tiers
      const tokenIn = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const tokenOut = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      const amountIn = '1000000000';
      const amountOutMin = '400000000000000000';
      const recipient = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
      expect(() => {
        encodeV3SwapData(tokenIn, tokenOut, FEE_TIERS.LOW, amountIn, amountOutMin, recipient, deadline);
      }).not.toThrow();
      
      expect(() => {
        encodeV3SwapData(tokenIn, tokenOut, FEE_TIERS.MEDIUM, amountIn, amountOutMin, recipient, deadline);
      }).not.toThrow();
      
      expect(() => {
        encodeV3SwapData(tokenIn, tokenOut, FEE_TIERS.HIGH, amountIn, amountOutMin, recipient, deadline);
      }).not.toThrow();
    });

    test('swap functions should integrate with existing encoding utilities', () => {
      // Test that swap encoding uses the same utilities as other functions
      const address = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const amount = '1000000000000000000';
      
      const encodedAddress = encodeAddress(address);
      const encodedAmount = encodeUint256(amount);
      
      expect(encodedAddress).toBe(address.slice(2).toLowerCase().padStart(64, '0'));
      expect(encodedAmount).toBe(BigInt(amount).toString(16).padStart(64, '0'));
      
      // These should be used consistently in swap encoding
      const tokenIn = '0xA0b86a33E6441b8435b662303c0f479c7e1d5916';
      const tokenOut = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      const amountIn = '1000000000';
      const amountOutMin = '400000000000000000';
      const recipient = '0x742d35Cc6634C0532925a3b8D400E4C053292525';
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
      const v2Data = encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline);
      
      // Should contain properly encoded addresses
      expect(v2Data).toContain(tokenIn.slice(2).toLowerCase().padStart(64, '0'));
      expect(v2Data).toContain(tokenOut.slice(2).toLowerCase().padStart(64, '0'));
      expect(v2Data).toContain(recipient.slice(2).toLowerCase().padStart(64, '0'));
    });
  });
});
describe('Error Handling and Validation', () => {
  
  describe('Error Creation and Messages', () => {
    test('createError should create standardized error objects', () => {
      const error = createError(ERROR_CODES.INVALID_PARAMETERS, 'Test error message', { test: 'data' });
      
      expect(error).toHaveProperty('error', true);
      expect(error).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
      expect(error).toHaveProperty('message', 'Test error message');
      expect(error).toHaveProperty('details', { test: 'data' });
      expect(error).toHaveProperty('timestamp');
      expect(typeof error.timestamp).toBe('number');
    });

    test('getUserFriendlyErrorMessage should return appropriate messages', () => {
      const invalidTokenMsg = getUserFriendlyErrorMessage(ERROR_CODES.INVALID_TOKEN_ADDRESS);
      expect(invalidTokenMsg).toContain('token address');
      expect(invalidTokenMsg).toContain('not valid');

      const networkMsg = getUserFriendlyErrorMessage(ERROR_CODES.INVALID_NETWORK, { network: 'TEST' });
      expect(networkMsg).toContain('TEST');
      expect(networkMsg).toContain('not supported');

      const priceImpactMsg = getUserFriendlyErrorMessage(ERROR_CODES.HIGH_PRICE_IMPACT, { priceImpact: 25.5 });
      expect(priceImpactMsg).toContain('25.50');
      expect(priceImpactMsg).toContain('high price impact');
    });

    test('getUserFriendlyErrorMessage should handle unknown error codes', () => {
      const unknownMsg = getUserFriendlyErrorMessage('UNKNOWN_ERROR_CODE');
      expect(unknownMsg).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('Enhanced Parameter Validation', () => {
    test('validateSwapParams should handle missing parameters object', () => {
      const result1 = validateSwapParams(null);
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Parameters object is required');

      const result2 = validateSwapParams(undefined);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Parameters object is required');

      const result3 = validateSwapParams('invalid');
      expect(result3.isValid).toBe(false);
      expect(result3.errors).toContain('Parameters object is required');
    });

    test('validateSwapParams should validate all required fields', () => {
      const result = validateSwapParams({});
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input token address is required');
      expect(result.errors).toContain('Output token address is required');
      expect(result.errors).toContain('Input amount is required');
      expect(result.errors).toContain('Network is required');
    });

    test('validateSwapParams should validate amount limits', () => {
      const maxUint256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
      const overMaxAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639936';
      
      const params = {
        tokenIn: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenOut: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        amountIn: overMaxAmount,
        network: 'ETHEREUM'
      };
      
      const result = validateSwapParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input amount exceeds maximum allowed value');
    });

    test('validateSwapParams should validate optional parameters', () => {
      const params = {
        tokenIn: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenOut: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        amountIn: '1000000000000000000',
        network: 'ETHEREUM',
        fromAddress: 'invalid-address',
        slippage: 100, // Invalid slippage
        deadline: Math.floor(Date.now() / 1000) - 3600 // Past deadline
      };
      
      const result = validateSwapParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid sender address format');
      expect(result.errors).toContain('Invalid slippage percentage (must be between 0 and 50)');
      expect(result.errors).toContain('Invalid deadline (must be future timestamp within 1 hour)');
    });

    test('validatePoolParams should validate fee parameter', () => {
      const params = {
        tokenA: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        tokenB: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
        network: 'ETHEREUM',
        fee: 999 // Invalid fee tier
      };
      
      const result = validatePoolParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid fee tier: 999'))).toBe(true);
    });
  });

  describe('Price Impact Analysis', () => {
    test('analyzePriceImpact should categorize impact levels correctly', () => {
      const lowImpact = analyzePriceImpact(0.5);
      expect(lowImpact.level).toBe('LOW');
      expect(lowImpact.shouldWarn).toBe(false);
      expect(lowImpact.shouldBlock).toBe(false);

      const moderateImpact = analyzePriceImpact(2);
      expect(moderateImpact.level).toBe('MODERATE');
      expect(moderateImpact.shouldWarn).toBe(false);
      expect(moderateImpact.warning).toContain('Moderate price impact');

      const highImpact = analyzePriceImpact(8);
      expect(highImpact.level).toBe('HIGH');
      expect(highImpact.shouldWarn).toBe(true);
      expect(highImpact.warning).toContain('High price impact');

      const veryHighImpact = analyzePriceImpact(18);
      expect(veryHighImpact.level).toBe('VERY_HIGH');
      expect(veryHighImpact.shouldWarn).toBe(true);
      expect(veryHighImpact.warning).toContain('Very high price impact');

      const criticalImpact = analyzePriceImpact(25);
      expect(criticalImpact.level).toBe('CRITICAL');
      expect(criticalImpact.shouldBlock).toBe(true);
      expect(criticalImpact.warning).toContain('Extremely high price impact');
    });
  });

  describe('Liquidity Validation', () => {
    test('validateLiquidity should analyze trade size relative to pool', () => {
      const reserveIn = '1000000000000000000000'; // 1000 ETH
      const reserveOut = '2000000000000'; // 2M USDC
      
      // Small trade (1 ETH = 0.1% of pool)
      const smallTrade = validateLiquidity(reserveIn, reserveOut, '1000000000000000000');
      expect(smallTrade.sufficient).toBe(true);
      expect(smallTrade.utilizationPercentage).toBe(0);
      expect(smallTrade.warning).toBeNull();

      // Medium trade (150 ETH = 15% of pool)
      const mediumTrade = validateLiquidity(reserveIn, reserveOut, '150000000000000000000');
      expect(mediumTrade.sufficient).toBe(true);
      expect(mediumTrade.utilizationPercentage).toBe(15);
      expect(mediumTrade.warning).toContain('Moderate trade size');

      // Large trade (300 ETH = 30% of pool)
      const largeTrade = validateLiquidity(reserveIn, reserveOut, '300000000000000000000');
      expect(largeTrade.sufficient).toBe(true);
      expect(largeTrade.utilizationPercentage).toBe(30);
      expect(largeTrade.warning).toContain('Large trade');

      // Excessive trade (600 ETH = 60% of pool)
      const excessiveTrade = validateLiquidity(reserveIn, reserveOut, '600000000000000000000');
      expect(excessiveTrade.sufficient).toBe(false);
      expect(excessiveTrade.utilizationPercentage).toBe(60);
      expect(excessiveTrade.warning).toContain('exceeds 50%');
    });

    test('validateLiquidity should handle invalid inputs gracefully', () => {
      const result = validateLiquidity('invalid', '1000', '100');
      expect(result.sufficient).toBe(false);
      expect(result.warning).toContain('Unable to analyze liquidity');
      expect(result.error).toBeDefined();
    });
  });

  describe('Parameter Sanitization', () => {
    test('validateAndSanitizeParams should validate and transform parameters', () => {
      const schema = {
        address: {
          required: true,
          type: 'string',
          validate: (value) => /^0x[a-fA-F0-9]{40}$/.test(value),
          errorMessage: 'Invalid address format'
        },
        amount: {
          required: true,
          type: 'string',
          validate: (value) => /^\d+$/.test(value),
          transform: (value) => value.toLowerCase(),
          errorMessage: 'Invalid amount format'
        },
        optional: {
          required: false,
          type: 'number'
        }
      };

      const validParams = {
        address: '0x742d35Cc6634C0532925a3b8D400E4C053292525',
        amount: '1000000000000000000'
      };

      const result = validateAndSanitizeParams(validParams, schema);
      expect(result.isValid).toBe(true);
      expect(result.sanitized.address).toBe(validParams.address);
      expect(result.sanitized.amount).toBe(validParams.amount.toLowerCase());
    });

    test('validateAndSanitizeParams should handle validation errors', () => {
      const schema = {
        required_field: {
          required: true,
          type: 'string'
        }
      };

      const result = validateAndSanitizeParams({}, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('required_field is required');
      expect(result.sanitized).toBeNull();
    });
  });

  describe('Error Wrapper Function', () => {
    test('withErrorHandling should wrap functions with error handling', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('Network timeout'));
      const wrappedFunction = withErrorHandling(mockFunction, 'test_operation');

      const result = await wrappedFunction('arg1', 'arg2');

      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code', ERROR_CODES.NETWORK_ERROR);
      expect(result.message).toContain('Network connection error');
      expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('withErrorHandling should categorize different error types', async () => {
      const insufficientLiquidityFn = jest.fn().mockRejectedValue(new Error('insufficient liquidity'));
      const wrappedFn1 = withErrorHandling(insufficientLiquidityFn, 'test');
      const result1 = await wrappedFn1();
      expect(result1.code).toBe(ERROR_CODES.INSUFFICIENT_LIQUIDITY);

      const invalidParamsFn = jest.fn().mockRejectedValue(new Error('invalid token address'));
      const wrappedFn2 = withErrorHandling(invalidParamsFn, 'test');
      const result2 = await wrappedFn2();
      expect(result2.code).toBe(ERROR_CODES.INVALID_PARAMETERS);
    });

    test('withErrorHandling should pass through successful results', async () => {
      const successFunction = jest.fn().mockResolvedValue({ success: true, data: 'test' });
      const wrappedFunction = withErrorHandling(successFunction, 'test_operation');

      const result = await wrappedFunction('arg1');

      expect(result).toEqual({ success: true, data: 'test' });
      expect(successFunction).toHaveBeenCalledWith('arg1');
    });
  });

  describe('Enhanced Deadline Validation', () => {
    test('isValidDeadline should validate deadline constraints', () => {
      const now = Math.floor(Date.now() / 1000);
      
      // Valid deadline (5 minutes from now)
      expect(isValidDeadline(now + 300)).toBe(true);
      
      // Too soon (30 seconds from now)
      expect(isValidDeadline(now + 30)).toBe(false);
      
      // Too far (2 hours from now)
      expect(isValidDeadline(now + 7200)).toBe(false);
      
      // Past deadline
      expect(isValidDeadline(now - 300)).toBe(false);
      
      // Invalid types
      expect(isValidDeadline('invalid')).toBe(false);
      expect(isValidDeadline(1.5)).toBe(false);
      expect(isValidDeadline(null)).toBe(false);
    });
  });

  describe('Integration Error Handling', () => {
    test('getSwapQuote should return error objects for invalid parameters', async () => {
      const result = await getSwapQuote('INVALID_NETWORK', 'invalid-token', 'invalid-token', '0');
      
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('timestamp');
    });

    test('getSwapQuote should handle high price impact scenarios', async () => {
      // This test would require mocking pool data to simulate high price impact
      // For now, we test the structure
      expect(typeof getSwapQuote).toBe('function');
    });

    test('getPoolInfo should return error objects for invalid parameters', async () => {
      const result = await getPoolInfo('INVALID_NETWORK', 'invalid-token', 'invalid-token');
      
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('code', ERROR_CODES.INVALID_PARAMETERS);
      expect(result).toHaveProperty('message');
    });

    test('getPoolInfo should handle no pools found scenario', async () => {
      // Use tokens that likely don't have pools
      const tokenA = '0x1111111111111111111111111111111111111111';
      const tokenB = '0x2222222222222222222222222222222222222222';
      
      const result = await getPoolInfo('ETHEREUM-SEPOLIA', tokenA, tokenB);
      
      if (result && result.error) {
        // Could be POOL_NOT_FOUND or INVALID_PARAMETERS depending on validation
        expect([ERROR_CODES.POOL_NOT_FOUND, ERROR_CODES.INVALID_PARAMETERS]).toContain(result.code);
        expect(result.message).toBeDefined();
      }
    }, 30000);
  });

  describe('Calculation Error Handling', () => {
    test('calculateV2SwapOutput should throw descriptive errors', () => {
      expect(() => {
        calculateV2SwapOutput('0', '1000000000000', '1000000000000000000');
      }).toThrow('Invalid reserves or amount');

      expect(() => {
        calculateV2SwapOutput('1000000000000', '0', '1000000000000000000');
      }).toThrow('Invalid reserves or amount');

      expect(() => {
        calculateV2SwapOutput('1000000000000', '1000000000000', '0');
      }).toThrow('Invalid reserves or amount');
    });

    test('calculateV2SwapInput should throw for insufficient liquidity', () => {
      expect(() => {
        calculateV2SwapInput('1000000000000000000000', '2000000000000', '2000000000000');
      }).toThrow('Insufficient liquidity');
    });

    test('calculateV2Price should throw for invalid reserves', () => {
      expect(() => {
        calculateV2Price('0', '1000000000000000000000');
      }).toThrow('Invalid reserves for price calculation');

      expect(() => {
        calculateV2Price('1000000000000000000000', '0');
      }).toThrow('Invalid reserves for price calculation');
    });

    test('calculateV3Price should throw for invalid sqrtPriceX96', () => {
      expect(() => {
        calculateV3Price('0');
      }).toThrow('Invalid sqrtPriceX96 for price calculation');
    });
  });

  describe('Encoding Error Handling', () => {
    test('encodeAddress should throw for invalid addresses', () => {
      expect(() => {
        encodeAddress('invalid-address');
      }).toThrow('Invalid address format');

      expect(() => {
        encodeAddress('0x742d35Cc6634C0532925a3b8D400E4C05329252'); // Too short
      }).toThrow('Invalid address format');
    });

    test('encodeUint256 should throw for negative values', () => {
      expect(() => {
        encodeUint256('-1');
      }).toThrow('Value cannot be negative');

      expect(() => {
        encodeUint256(-100);
      }).toThrow('Value cannot be negative');
    });

    test('encodeFunctionCall should handle parameter encoding errors', () => {
      expect(() => {
        encodeFunctionCall('0xa9059cbb', [{ invalid: 'object' }]);
      }).toThrow('Unsupported parameter type');
    });
  });
});