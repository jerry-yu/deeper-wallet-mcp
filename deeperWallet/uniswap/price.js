const { isValidAddress, isNetworkSupported, getCommonTokens } = require('./utils');
const { ERROR_CODES } = require('./constants');
const { performanceCache } = require('./cache');
const { getAllPools, getPoolInfo, getV2PoolReserves } = require('./pool');
const { calculateV2Price, calculateV3Price, calculateV2SwapOutput, calculatePriceImpact, analyzePriceImpact, validateLiquidity } = require('./calculations');
const { applySlippage } = require('./calculations');
const { createError, getUserFriendlyErrorMessage } = require('./errors');
const { validateSwapParams, validatePoolParams, isValidSlippage } = require('./validation');

/**
 * Get current token price from the best available pool
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token address to get price for
 * @param {string} baseToken - Base token address (e.g., WETH, USDC)
 * @returns {Promise<Object|null>} Price information or null if no pool found
 */
async function getTokenPrice(network, tokenAddress, baseToken) {
  console.warn(`Fetching price for ${tokenAddress} in terms of ${baseToken} on ${network}`);
  try {
    // Validate inputs
    if (!isValidAddress(tokenAddress) || !isValidAddress(baseToken)) {
      throw new Error('Invalid token addresses');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Get pool information
    const poolInfo = await getPoolInfo(network, tokenAddress, baseToken);
    if (!poolInfo) {
      console.warn('No pool information found');
      return null; // No pool found
    }
    console.warn('Pool info:', poolInfo);

    // Retrieve actual token decimals using getContractMeta
    let token0Decimals = 18; // Default fallback
    let token1Decimals = 18; // Default fallback

    try {
      // Import getContractMeta from the main module
      const { getContractMeta } = require('../index');

      // Get decimals for both tokens in the pool
      const [token0Meta, token1Meta] = await Promise.all([
        getContractMeta(network, poolInfo.token0),
        getContractMeta(network, poolInfo.token1)
      ]);
      console.warn('Token0 meta:', token0Meta);
      console.warn('Token1 meta:', token1Meta);

      if (token0Meta && typeof token0Meta.decimals === 'number') {
        token0Decimals = token0Meta.decimals;
      } else {
        console.warn(`Failed to retrieve decimals for token0 ${poolInfo.token0}, using default 18`);
      }

      if (token1Meta && typeof token1Meta.decimals === 'number') {
        token1Decimals = token1Meta.decimals;
      } else {
        console.warn(`Failed to retrieve decimals for token1 ${poolInfo.token1}, using default 18`);
      }

      console.warn(`Token decimals - token0: ${token0Decimals}, token1: ${token1Decimals}`);
    } catch (decimalError) {
      console.error('Error retrieving token decimals:', decimalError.message);
      console.warn('Using default decimals (18) for both tokens');
      // Continue with default decimals rather than failing completely
    }

    let priceData;

    if (poolInfo.version === 'V2') {
      // Calculate price from V2 reserves with correct decimals
      priceData = calculateV2Price(poolInfo.reserve0, poolInfo.reserve1, token0Decimals, token1Decimals);
    } else if (poolInfo.version === 'V3') {
      // Calculate price from V3 sqrtPriceX96 with correct decimals
      console.warn('Calculating V3 price with sqrtPriceX96:', poolInfo.sqrtPriceX96, token0Decimals, token1Decimals);
      priceData = calculateV3Price(poolInfo.sqrtPriceX96, token0Decimals, token1Decimals);
    } else {
      throw new Error('Unknown pool version');
    }
    console.warn('Price data:', priceData);
    // Determine which token is which in the pool
    const isToken0 = poolInfo.token0.toLowerCase() === tokenAddress.toLowerCase();
    const price = isToken0 ? priceData.price0in1 : priceData.price1in0;
    const inversePrice = isToken0 ? priceData.price1in0 : priceData.price0in1;

    // Ensure both prices are valid
    if (Number(price) <= 0 || Number(inversePrice) <= 0) {
      console.error('Invalid price calculation result');
      return null;
    }

    return {
      tokenAddress,
      baseToken,
      price,
      inversePrice,
      poolAddress: poolInfo.poolAddress,
      version: poolInfo.version,
      fee: poolInfo.fee,
      feeTierName: poolInfo.feeTierName || 'FIXED',
      liquidity: poolInfo.liquidity || 'N/A',
      decimals: {
        token0: token0Decimals,
        token1: token1Decimals,
        targetToken: isToken0 ? token0Decimals : token1Decimals,
        baseToken: isToken0 ? token1Decimals : token0Decimals
      },
      lastUpdated: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error getting token price:', error.message);
    return null;
  }
}

/**
 * Generate swap quote with slippage calculation
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {number} slippage - Slippage percentage (e.g., 0.5 for 0.5%)
 * @returns {Promise<Object|null>} Swap quote or error object
 */
async function getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage = 0.5, options = {}) {
  try {
    // Comprehensive parameter validation (excluding slippage which is handled separately)
    const validation = validateSwapParams({
      tokenIn,
      tokenOut,
      amountIn,
      network
    });

    if (!validation.isValid) {
      return createError(
        ERROR_CODES.INVALID_PARAMETERS,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS),
        { validationErrors: validation.errors }
      );
    }

    // Additional slippage validation (separate from parameter validation)
    if (slippage !== undefined && !isValidSlippage(slippage)) {
      return createError(
        ERROR_CODES.INVALID_SLIPPAGE,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_SLIPPAGE),
        { slippage, validRange: '0-50%' }
      );
    }

    // Check route cache for frequently used pairs
    const { useCache = true } = options;
    if (useCache) {
      const routeCacheKey = [network, tokenIn.toLowerCase(), tokenOut.toLowerCase(), amountIn, slippage.toString()];
      const cachedQuote = performanceCache.get('routes', routeCacheKey);
      if (cachedQuote !== null) {
        console.debug(`Route cache hit for ${tokenIn} -> ${tokenOut}`);
        return cachedQuote;
      }
    }

    // Get all available pools for the token pair
    const pools = await getAllPools(network, tokenIn, tokenOut);
    if (pools.length === 0) {
      return createError(
        ERROR_CODES.POOL_NOT_FOUND,
        getUserFriendlyErrorMessage(ERROR_CODES.POOL_NOT_FOUND),
        { tokenIn, tokenOut, network }
      );
    }

    const quotes = [];
    const poolErrors = [];

    // Calculate quotes for each available pool
    for (const pool of pools) {
      try {
        let amountOut;
        let priceImpact = 0;
        let liquidityAnalysis = null;

        // Determine token order in pool
        const isTokenInToken0 = pool.token0.toLowerCase() === tokenIn.toLowerCase();

        if (pool.version === 'V2') {
          // Calculate V2 swap output
          const reserveIn = isTokenInToken0 ? pool.reserve0 : pool.reserve1;
          const reserveOut = isTokenInToken0 ? pool.reserve1 : pool.reserve0;

          // Validate liquidity before calculation
          liquidityAnalysis = validateLiquidity(reserveIn, reserveOut, amountIn);
          if (!liquidityAnalysis.sufficient) {
            poolErrors.push({
              pool: pool.poolAddress,
              version: pool.version,
              error: liquidityAnalysis.warning || 'Insufficient liquidity'
            });
            continue;
          }

          amountOut = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, pool.fee);
          priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);
        } else if (pool.version === 'V3') {
          console.warn("pool info ", pool)
          // For V3, we'll use a simplified calculation based on current price
          // In a full implementation, this would use the tick math and liquidity calculations
          if (!pool.sqrtPriceX96 || BigInt(pool.sqrtPriceX96) <= 0n) {
            poolErrors.push({
              pool: pool.poolAddress,
              version: pool.version,
              error: 'Invalid pool price data'
            });
            continue;
          }

          const priceData = calculateV3Price(pool.sqrtPriceX96);
          console.warn("price data ", priceData);
          const price = isTokenInToken0 ? priceData.price0in1 : priceData.price1in0;

          // Simple price-based calculation (not accounting for concentrated liquidity)
          amountOut = number(amountIn) * number(price);
          amountOut = amountOut.toFixed(0).toString();

          // Apply V3 fee
          const feeAmount = (BigInt(amountOut) * BigInt(pool.fee)) / BigInt(1000000);
          amountOut = (BigInt(amountOut) - feeAmount).toString();

          // Simplified price impact calculation for V3
          if (pool.liquidity && BigInt(pool.liquidity) > 0n) {
            priceImpact = Number(BigInt(amountIn)) / Number(BigInt(pool.liquidity)) * 100;
            priceImpact = Math.min(priceImpact, 100); // Cap at 100%
          } else {
            priceImpact = 0; // Cannot calculate without liquidity data
          }
        }

        // Validate output amount
        if (!amountOut || BigInt(amountOut) <= 0n) {
          poolErrors.push({
            pool: pool.poolAddress,
            version: pool.version,
            error: 'Invalid output amount calculated'
          });
          continue;
        }

        // Apply slippage protection
        const amountOutMin = applySlippage(amountOut, slippage, true);

        // Analyze price impact
        const priceImpactAnalysis = analyzePriceImpact(priceImpact);

        quotes.push({
          poolAddress: pool.poolAddress,
          version: pool.version,
          fee: pool.fee,
          feeTierName: pool.feeTierName,
          amountOut,
          amountOutMin,
          priceImpact,
          priceImpactAnalysis,
          liquidity: pool.liquidity || pool.reserve0, // Use reserve0 as liquidity proxy for V2
          liquidityAnalysis,
          effectivePrice: (BigInt(amountOut) * BigInt(10 ** 18)) / BigInt(amountIn)
        });
      } catch (poolError) {
        console.error(`Error calculating quote for ${pool.version} pool:`, poolError.message);
        poolErrors.push({
          pool: pool.poolAddress,
          version: pool.version,
          error: poolError.message
        });
        continue; // Skip this pool and try others
      }
    }

    if (quotes.length === 0) {
      return createError(
        ERROR_CODES.INSUFFICIENT_LIQUIDITY,
        'No pools have sufficient liquidity for this trade',
        {
          poolErrors,
          suggestedAction: 'Try reducing the trade amount or check back later'
        }
      );
    }

    // Select the best quote (highest output amount)
    const bestQuote = quotes.reduce((best, current) =>
      BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best
    );

    // Check for critical price impact that should block the trade
    if (bestQuote.priceImpactAnalysis.shouldBlock) {
      return createError(
        ERROR_CODES.HIGH_PRICE_IMPACT,
        getUserFriendlyErrorMessage(ERROR_CODES.HIGH_PRICE_IMPACT, { priceImpact: bestQuote.priceImpact }),
        {
          priceImpact: bestQuote.priceImpact,
          recommendation: 'Reduce trade size significantly or split into multiple smaller trades'
        }
      );
    }

    // Calculate effective exchange rate
    const effectiveRate = (BigInt(bestQuote.amountOut) * BigInt(10 ** 18)) / BigInt(amountIn);

    return {
      success: true,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: bestQuote.amountOut,
      amountOutMin: bestQuote.amountOutMin,
      slippage,
      priceImpact: bestQuote.priceImpact,
      priceImpactAnalysis: bestQuote.priceImpactAnalysis,
      route: [tokenIn, tokenOut],
      version: bestQuote.version,
      poolAddress: bestQuote.poolAddress,
      fee: bestQuote.fee,
      feeTierName: bestQuote.feeTierName,
      effectiveRate: effectiveRate.toString(),
      liquidity: bestQuote.liquidity,
      alternativeQuotes: quotes.filter(q => q.poolAddress !== bestQuote.poolAddress),
      warnings: bestQuote.priceImpactAnalysis.warning ? [bestQuote.priceImpactAnalysis.warning] : [],
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error generating swap quote:', error.message);
    return createError(
      ERROR_CODES.NETWORK_ERROR,
      getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR),
      { originalError: error.message }
    );
  }
}

/**
 * Get optimal swap route between V2 and V3
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @returns {Promise<Object|null>} Optimal route information or null if no route found
 */
async function getOptimalRoute(network, tokenIn, tokenOut, amountIn) {
  try {
    // Get swap quote which already finds the optimal route
    const quote = await getSwapQuote(network, tokenIn, tokenOut, amountIn);
    if (!quote) {
      return null;
    }

    return {
      tokenIn,
      tokenOut,
      amountIn,
      optimalVersion: quote.version,
      optimalPool: quote.poolAddress,
      optimalFee: quote.fee,
      expectedOutput: quote.amountOut,
      priceImpact: quote.priceImpact,
      route: quote.route,
      alternativeRoutes: quote.alternativeQuotes.map(alt => ({
        version: alt.version,
        poolAddress: alt.poolAddress,
        fee: alt.fee,
        expectedOutput: alt.amountOut,
        priceImpact: alt.priceImpact
      }))
    };
  } catch (error) {
    console.error('Error getting optimal route:', error.message);
    return null;
  }
}

/**
 * Compare prices across multiple pools for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} amountIn - Amount to compare (in wei)
 * @returns {Promise<Array>} Array of price comparisons
 */
async function comparePrices(network, tokenA, tokenB, amountIn) {
  try {
    // Validate parameters
    const validation = validateSwapParams({
      tokenIn: tokenA,
      tokenOut: tokenB,
      amountIn,
      network
    });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Check cache first for price comparisons
    const cacheKey = [network, tokenA.toLowerCase(), tokenB.toLowerCase(), amountIn];
    const cachedComparisons = performanceCache.get('prices', cacheKey);
    if (cachedComparisons !== null) {
      return cachedComparisons;
    }

    // Get all available pools (this is now optimized with batch RPC)
    const pools = await getAllPools(network, tokenA, tokenB);
    if (pools.length === 0) {
      return [];
    }

    const comparisons = [];

    for (const pool of pools) {
      try {
        // Get quote for this specific pool
        const isTokenAToken0 = pool.token0.toLowerCase() === tokenA.toLowerCase();
        let amountOut;
        let priceImpact = 0;

        if (pool.version === 'V2') {
          const reserveIn = isTokenAToken0 ? pool.reserve0 : pool.reserve1;
          const reserveOut = isTokenAToken0 ? pool.reserve1 : pool.reserve0;

          amountOut = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, pool.fee);
          priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);
        } else if (pool.version === 'V3') {
          const priceData = calculateV3Price(pool.sqrtPriceX96);
          const price = isTokenAToken0 ? priceData.price0in1 : priceData.price1in0;

          amountOut = (BigInt(amountIn) * BigInt(price)) / BigInt(10 ** 18);
          const feeAmount = (BigInt(amountOut) * BigInt(pool.fee)) / BigInt(1000000);
          amountOut = (BigInt(amountOut) - feeAmount).toString();

          priceImpact = Number(BigInt(amountIn)) / Number(BigInt(pool.liquidity)) * 100;
          priceImpact = Math.min(priceImpact, 100);
        }

        // Calculate effective price
        const effectivePrice = (BigInt(amountOut) * BigInt(10 ** 18)) / BigInt(amountIn);

        comparisons.push({
          poolAddress: pool.poolAddress,
          version: pool.version,
          fee: pool.fee,
          feeTierName: pool.feeTierName,
          amountOut,
          effectivePrice: effectivePrice.toString(),
          priceImpact,
          liquidity: pool.liquidity || pool.reserve0
        });
      } catch (poolError) {
        console.error(`Error comparing price for ${pool.version} pool:`, poolError.message);
        continue;
      }
    }

    // Sort by best output amount
    comparisons.sort((a, b) => {
      const aOut = BigInt(a.amountOut);
      const bOut = BigInt(b.amountOut);
      return bOut > aOut ? 1 : bOut < aOut ? -1 : 0;
    });

    // Cache the results for future requests
    performanceCache.set('prices', cacheKey, comparisons);

    return comparisons;
  } catch (error) {
    console.error('Error comparing prices:', error.message);
    return [];
  }
}

module.exports = {
  getTokenPrice,
  getSwapQuote,
  getOptimalRoute,
  comparePrices
};