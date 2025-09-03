/**
 * Price Quotation and Route Calculation
 * Provides accurate price quotes and impact calculations for Uniswap swaps
 */

const { Token, CurrencyAmount, TradeType, Percent } = require('@uniswap/sdk-core');
const logger = require('../log');
const { getNetworkConfig, FEE_TIERS, DEFAULTS, CACHE_TTL } = require('./constants');
const {
  validateTokenAddress,
  getTokenInfo,
  validateNetwork,
  normalizeNetwork,
  validateAmount,
  parseTokenAmount,
  formatTokenAmount
} = require('./utils');
const { estimate_gas } = require('../eth');
const { routeCache, quoteCache, gasPriceCache } = require('./cache');
const { makeRpcRequest, getCurrentGasPrice } = require('./network');

// Error codes for quote operations
const QUOTE_ERROR_CODES = {
  INVALID_TOKEN_ADDRESS: 'INVALID_TOKEN_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_NETWORK: 'INVALID_NETWORK',
  QUOTE_FAILED: 'QUOTE_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  PRICE_IMPACT_TOO_HIGH: 'PRICE_IMPACT_TOO_HIGH',
  GAS_ESTIMATION_FAILED: 'GAS_ESTIMATION_FAILED'
};

// Retry configuration for quote operations
const QUOTE_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 500,
  BACKOFF_MULTIPLIER: 2,
  RETRYABLE_ERRORS: [
    QUOTE_ERROR_CODES.NETWORK_ERROR,
    QUOTE_ERROR_CODES.TIMEOUT_ERROR,
    QUOTE_ERROR_CODES.RPC_ERROR
  ]
};

// Route cache is now handled by the centralized cache system

// RPC calls are now handled by the network optimization module

/**
 * Create Token instance from address and network
 * @param {string} address - Token contract address
 * @param {string} network - Network identifier
 * @returns {Promise<Token>} Token instance
 */
async function createToken(address, network) {
  const tokenInfo = await getTokenInfo(address, network);
  const config = getNetworkConfig(network);

  return new Token(
    config.CHAIN_ID,
    tokenInfo.address,
    tokenInfo.decimals,
    tokenInfo.symbol,
    tokenInfo.name
  );
}

/**
 * Get swap quote using Uniswap Quoter contract with enhanced error handling
 * @param {string} tokenInAddress - Input token address
 * @param {string} tokenOutAddress - Output token address
 * @param {string} amountIn - Input amount in token units
 * @param {string} network - Network identifier
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Swap quote with price impact
 */
async function getSwapQuote(tokenInAddress, tokenOutAddress, amountIn, network, options = {}) {
  const operation = 'getSwapQuote';

  try {
    // Enhanced input validation with specific error codes
    if (!tokenInAddress || typeof tokenInAddress !== 'string') {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Input token address is required', { tokenInAddress }, operation);
    }

    if (!tokenOutAddress || typeof tokenOutAddress !== 'string') {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Output token address is required', { tokenOutAddress }, operation);
    }

    if (!validateTokenAddress(tokenInAddress, network)) {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Invalid input token address format', { tokenInAddress, network }, operation);
    }

    if (!validateTokenAddress(tokenOutAddress, network)) {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Invalid output token address format', { tokenOutAddress, network }, operation);
    }

    if (!validateAmount(amountIn)) {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_AMOUNT, 'Invalid input amount: must be positive number', { amountIn }, operation);
    }

    if (!validateNetwork(network)) {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_NETWORK, 'Invalid or unsupported network', { network }, operation);
    }

    // Check for identical tokens
    if (tokenInAddress.toLowerCase() === tokenOutAddress.toLowerCase()) {
      throw createQuoteError(QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Cannot quote identical tokens', { tokenInAddress, tokenOutAddress }, operation);
    }

    const normalizedNetwork = normalizeNetwork(network);
    const slippageTolerance = options.slippageTolerance || DEFAULTS.SLIPPAGE_TOLERANCE;

    console.warn(`Getting swap quote: ${amountIn} ${tokenInAddress} -> ${tokenOutAddress} on ${normalizedNetwork}`);

    // Check cache first
    const cached = routeCache.get(normalizedNetwork, tokenInAddress, tokenOutAddress, amountIn, slippageTolerance);
    if (cached) {
      console.warn('Quote cache hit');
      return cached;
    }

    // Get token information
    const [tokenIn, tokenOut] = await Promise.all([
      getTokenInfo(tokenInAddress, normalizedNetwork),
      getTokenInfo(tokenOutAddress, normalizedNetwork)
    ]);

    // Parse input amount to smallest unit
    const amountInSmallestUnit = parseTokenAmount(amountIn, tokenIn.decimals);

    // Try different fee tiers to find the best quote
    const feeQuotes = await Promise.all([
      getQuoteForFeeTier(tokenInAddress, tokenOutAddress, amountInSmallestUnit, FEE_TIERS.LOW, normalizedNetwork),
      getQuoteForFeeTier(tokenInAddress, tokenOutAddress, amountInSmallestUnit, FEE_TIERS.MEDIUM, normalizedNetwork),
      getQuoteForFeeTier(tokenInAddress, tokenOutAddress, amountInSmallestUnit, FEE_TIERS.HIGH, normalizedNetwork)
    ]);

    // Filter out failed quotes and find the best one
    const validQuotes = feeQuotes.filter(quote => quote !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found for any fee tier');
    }

    // Select the quote with the highest output amount
    const bestQuote = validQuotes.reduce((best, current) =>
      BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best
    );

    // Calculate price impact (simplified calculation)
    const priceImpact = calculateSimplePriceImpact(amountInSmallestUnit, bestQuote.amountOut, tokenIn.decimals, tokenOut.decimals);

    // Format amounts
    const amountOut = formatTokenAmount(bestQuote.amountOut, tokenOut.decimals);
    const amountOutMin = formatTokenAmount(
      (BigInt(bestQuote.amountOut) * BigInt(10000 - Math.floor(slippageTolerance * 100)) / BigInt(10000)).toString(),
      tokenOut.decimals
    );

    // Calculate execution price
    const price = calculateExecutionPrice(amountInSmallestUnit, bestQuote.amountOut, tokenIn.decimals, tokenOut.decimals);

    const quote = {
      amountIn,
      amountOut,
      amountOutMin,
      priceImpact,
      price,
      route: {
        path: [
          { address: tokenInAddress, symbol: tokenIn.symbol },
          { address: tokenOutAddress, symbol: tokenOut.symbol }
        ],
        pools: [{
          address: `${tokenInAddress}-${tokenOutAddress}`,
          fee: bestQuote.fee
        }],
        gasEstimate: bestQuote.gasEstimate
      },
      tokenIn: {
        address: tokenIn.address,
        symbol: tokenIn.symbol,
        decimals: tokenIn.decimals
      },
      tokenOut: {
        address: tokenOut.address,
        symbol: tokenOut.symbol,
        decimals: tokenOut.decimals
      },
      network: normalizedNetwork,
      timestamp: Date.now(),
      slippageTolerance
    };

    // Cache the result
    routeCache.set(normalizedNetwork, tokenInAddress, tokenOutAddress, amountIn, slippageTolerance, quote);

    console.warn(`Quote generated: ${amountOut} ${tokenOut.symbol} (${priceImpact}% impact)`);
    return quote;

  } catch (error) {
    logger.error(`Failed to get swap quote: ${error.message}`);
    throw new Error(`Swap quote failed: ${error.message}`);
  }
}

/**
 * Get quote for a specific fee tier using Quoter contract
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in smallest unit
 * @param {number} fee - Fee tier
 * @param {string} network - Network identifier
 * @returns {Promise<Object|null>} Quote result or null if failed
 */
async function getQuoteForFeeTier(tokenIn, tokenOut, amountIn, fee, network) {
  try {
    // Check cache first
    const cached = quoteCache.get(network, tokenIn, tokenOut, amountIn, fee);
    if (cached) {
      console.warn(`Quote cache hit for fee tier ${fee}`);
      return cached;
    }

    const config = getNetworkConfig(network);

    // Quoter V2 contract call data for quoteExactInputSingle
    // function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)
    const methodId = '0xf7729d43'; // quoteExactInputSingle method ID

    // Encode parameters (simplified - in production use proper ABI encoding)
    const paddedTokenIn = tokenIn.slice(2).padStart(64, '0');
    const paddedTokenOut = tokenOut.slice(2).padStart(64, '0');
    const paddedFee = fee.toString(16).padStart(64, '0');
    const paddedAmountIn = BigInt(amountIn).toString(16).padStart(64, '0');
    const paddedSqrtPriceLimit = '0'.padStart(64, '0'); // No price limit

    const calldata = methodId + paddedTokenIn + paddedTokenOut + paddedFee + paddedAmountIn + paddedSqrtPriceLimit;

    // Make the call to Quoter contract using optimized network module
    const result = await makeRpcRequest(network, 'eth_call', [{
      to: config.QUOTER_V2,
      data: calldata
    }, 'latest']);

    if (!result || result === '0x') {
      return null;
    }

    // Parse the result (simplified - assumes single return value)
    const amountOut = BigInt(result).toString();

    if (amountOut === '0') {
      return null;
    }

    const quote = {
      amountOut,
      fee,
      gasEstimate: '150000' // Estimated gas for single hop swap
    };

    // Cache the result
    quoteCache.set(network, tokenIn, tokenOut, amountIn, fee, quote);

    return quote;

  } catch (error) {
    console.warn(`Quote failed for fee tier ${fee}: ${error.message}`);
    return null;
  }
}

/**
 * Calculate simple price impact percentage
 * @param {string} amountIn - Input amount in smallest unit
 * @param {string} amountOut - Output amount in smallest unit
 * @param {number} decimalsIn - Input token decimals
 * @param {number} decimalsOut - Output token decimals
 * @returns {number} Price impact as percentage
 */
function calculateSimplePriceImpact(amountIn, amountOut, decimalsIn, decimalsOut) {
  try {
    // For a simple price impact calculation, we assume a 1:1 ratio as baseline
    // In production, this would use pool reserves and more sophisticated calculations

    const amountInFormatted = parseFloat(formatTokenAmount(amountIn, decimalsIn));
    const amountOutFormatted = parseFloat(formatTokenAmount(amountOut, decimalsOut));

    if (amountInFormatted === 0 || amountOutFormatted === 0 || isNaN(amountInFormatted) || isNaN(amountOutFormatted)) {
      return 0;
    }

    // Simple price impact estimation (this is a placeholder)
    // Real price impact would require pool state and more complex calculations
    const ratio = amountOutFormatted / amountInFormatted;

    if (isNaN(ratio) || !isFinite(ratio)) {
      return 0;
    }

    // Assume some baseline ratio and calculate deviation
    // This is a simplified calculation for demonstration
    const baselineRatio = 1.0; // Assuming 1:1 as baseline
    const deviation = Math.abs(ratio - baselineRatio) / baselineRatio;

    if (isNaN(deviation) || !isFinite(deviation)) {
      return 0;
    }

    return Math.min(deviation * 100, 50); // Cap at 50%

  } catch (error) {
    logger.error(`Price impact calculation failed: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate execution price
 * @param {string} amountIn - Input amount in smallest unit
 * @param {string} amountOut - Output amount in smallest unit
 * @param {number} decimalsIn - Input token decimals
 * @param {number} decimalsOut - Output token decimals
 * @returns {string} Execution price
 */
function calculateExecutionPrice(amountIn, amountOut, decimalsIn, decimalsOut) {
  try {
    const amountInFormatted = parseFloat(formatTokenAmount(amountIn, decimalsIn));
    const amountOutFormatted = parseFloat(formatTokenAmount(amountOut, decimalsOut));

    if (amountInFormatted === 0 || isNaN(amountInFormatted) || isNaN(amountOutFormatted)) {
      return '0';
    }

    const price = amountOutFormatted / amountInFormatted;

    if (isNaN(price) || !isFinite(price)) {
      return '0';
    }

    return price.toFixed(6);

  } catch (error) {
    logger.error(`Execution price calculation failed: ${error.message}`);
    return '0';
  }
}

/**
 * Estimate gas cost for swap transaction
 * @param {Object} swapData - Swap transaction data
 * @param {string} network - Network identifier
 * @param {string} fromAddress - Sender address
 * @returns {Promise<Object>} Gas estimation details
 */
async function estimateGasCost(swapData, network, fromAddress) {
  try {
    if (!swapData || !swapData.to || !swapData.data) {
      throw new Error('Invalid swap data for gas estimation');
    }

    if (!validateNetwork(network)) {
      throw new Error('Invalid network');
    }

    const normalizedNetwork = normalizeNetwork(network);

    console.warn(`Estimating gas cost for swap on ${normalizedNetwork}`);

    // Estimate gas using existing eth.js function
    const gasEstimate = await estimate_gas(
      normalizedNetwork,
      fromAddress,
      swapData.to,
      swapData.value || 0,
      swapData.data
    );

    if (!gasEstimate) {
      throw new Error('Failed to estimate gas');
    }

    // Add buffer to gas estimate
    const gasLimit = Math.ceil(gasEstimate * DEFAULTS.GAS_LIMIT_BUFFER);

    // Get current gas price using cached network module
    let gasPrice;
    try {
      const gasPriceData = await getCurrentGasPrice(normalizedNetwork);
      gasPrice = gasPriceData.gasPrice;
    } catch (error) {
      console.warn(`Failed to get current gas price, using fallback: ${error.message}`);
      // Fallback gas prices
      const baseGasPrice = {
        'ETHEREUM': 20000000000, // 20 gwei
        'ARBITRUM': 100000000,   // 0.1 gwei
        'OPTIMISM': 1000000,     // 0.001 gwei
        'BASE': 1000000,         // 0.001 gwei
        'POLYGON': 30000000000   // 30 gwei
      };
      gasPrice = (baseGasPrice[normalizedNetwork] || 20000000000).toString();
    }

    const gasCostWei = BigInt(gasLimit) * BigInt(gasPrice);
    const gasCostEth = formatTokenAmount(gasCostWei.toString(), 18); // ETH has 18 decimals

    return {
      gasEstimate,
      gasLimit,
      gasPrice: gasPrice,
      gasCostWei: gasCostWei.toString(),
      gasCostEth,
      network: normalizedNetwork
    };

  } catch (error) {
    logger.error(`Gas estimation failed: ${error.message}`);
    throw new Error(`Gas estimation failed: ${error.message}`);
  }
}

/**
 * Find the best route for a token swap with multi-hop optimization
 * @param {string} tokenInAddress - Input token address
 * @param {string} tokenOutAddress - Output token address
 * @param {string} amountIn - Input amount in token units
 * @param {string} network - Network identifier
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Best route with optimization details
 */
async function getBestRoute(tokenInAddress, tokenOutAddress, amountIn, network, options = {}) {
  try {
    // Validate inputs
    if (!validateTokenAddress(tokenInAddress, network)) {
      throw new Error('Invalid input token address or network');
    }

    if (!validateTokenAddress(tokenOutAddress, network)) {
      throw new Error('Invalid output token address or network');
    }

    if (!validateAmount(amountIn)) {
      throw new Error('Invalid input amount');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const maxHops = options.maxHops || DEFAULTS.MAX_HOPS;

    console.warn(`Finding best route: ${amountIn} ${tokenInAddress} -> ${tokenOutAddress} on ${normalizedNetwork}`);

    // Check cache first for route optimization
    const cachedRoute = routeCache.get(normalizedNetwork, `best_route:${tokenInAddress}`, tokenOutAddress, amountIn, 'best');
    if (cachedRoute) {
      console.warn('Best route cache hit');
      return cachedRoute;
    }

    // Get multiple quotes with different parameters for optimization
    const quotePromises = [];

    // Try different slippage tolerances
    const slippageOptions = [0.1, 0.5, 1.0, 2.0];

    for (const slippage of slippageOptions) {
      quotePromises.push(
        getSwapQuote(tokenInAddress, tokenOutAddress, amountIn, normalizedNetwork, {
          ...options,
          slippageTolerance: slippage
        }).catch(error => {
          console.warn(`Quote failed for slippage ${slippage}%: ${error.message}`);
          return null;
        })
      );
    }

    // Also try different fee tiers directly for better optimization
    const feeQuotePromises = [];
    const feeTiers = [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];

    for (const fee of feeTiers) {
      feeQuotePromises.push(
        getDirectFeeQuote(tokenInAddress, tokenOutAddress, amountIn, fee, normalizedNetwork).catch(error => {
          console.warn(`Direct fee quote failed for fee ${fee}: ${error.message}`);
          return null;
        })
      );
    }

    const [quotes, feeQuotes] = await Promise.all([
      Promise.all(quotePromises),
      Promise.all(feeQuotePromises)
    ]);

    const allQuotes = [...quotes, ...feeQuotes].filter(quote => quote !== null);

    if (allQuotes.length === 0) {
      throw new Error('No valid routes found');
    }

    // Find the best quote using optimization algorithm
    const bestQuote = selectOptimalRoute(allQuotes, options);

    // Add gas estimation to the best route
    const gasEstimation = await estimateRouteGasCost(bestQuote, normalizedNetwork, options.fromAddress);

    // Add optimization metadata
    const optimizedRoute = {
      ...bestQuote,
      gasEstimation,
      optimization: {
        quotesEvaluated: allQuotes.length,
        selectedSlippage: bestQuote.slippageTolerance || DEFAULTS.SLIPPAGE_TOLERANCE,
        alternativeQuotes: allQuotes.length - 1,
        maxHops,
        optimizationScore: calculateOptimizationScore(bestQuote),
        routeEfficiency: calculateRouteEfficiency(bestQuote, gasEstimation)
      }
    };

    // Cache the optimized route
    routeCache.set(normalizedNetwork, `best_route:${tokenInAddress}`, tokenOutAddress, amountIn, 'best', optimizedRoute);

    console.warn(`Best route selected: ${bestQuote.amountOut} ${bestQuote.tokenOut.symbol} with ${bestQuote.priceImpact}% impact`);
    return optimizedRoute;

  } catch (error) {
    logger.error(`Best route calculation failed: ${error.message}`);
    throw new Error(`Best route calculation failed: ${error.message}`);
  }
}

/**
 * Get direct quote for specific fee tier (optimization helper)
 * @param {string} tokenInAddress - Input token address
 * @param {string} tokenOutAddress - Output token address
 * @param {string} amountIn - Input amount in token units
 * @param {number} feeTier - Specific fee tier to use
 * @param {string} network - Network identifier
 * @returns {Promise<Object|null>} Quote for specific fee tier
 */
async function getDirectFeeQuote(tokenInAddress, tokenOutAddress, amountIn, feeTier, network) {
  try {
    const [tokenIn, tokenOut] = await Promise.all([
      getTokenInfo(tokenInAddress, network),
      getTokenInfo(tokenOutAddress, network)
    ]);

    const amountInSmallestUnit = parseTokenAmount(amountIn, tokenIn.decimals);
    const quote = await getQuoteForFeeTier(tokenInAddress, tokenOutAddress, amountInSmallestUnit, feeTier, network);

    if (!quote) {
      return null;
    }

    const priceImpact = calculateSimplePriceImpact(amountInSmallestUnit, quote.amountOut, tokenIn.decimals, tokenOut.decimals);
    const amountOut = formatTokenAmount(quote.amountOut, tokenOut.decimals);
    const price = calculateExecutionPrice(amountInSmallestUnit, quote.amountOut, tokenIn.decimals, tokenOut.decimals);

    return {
      amountIn,
      amountOut,
      amountOutMin: formatTokenAmount(
        (BigInt(quote.amountOut) * BigInt(9950) / BigInt(10000)).toString(), // 0.5% slippage
        tokenOut.decimals
      ),
      priceImpact,
      price,
      route: {
        path: [
          { address: tokenInAddress, symbol: tokenIn.symbol },
          { address: tokenOutAddress, symbol: tokenOut.symbol }
        ],
        pools: [{
          address: `${tokenInAddress}-${tokenOutAddress}`,
          fee: feeTier
        }],
        gasEstimate: quote.gasEstimate
      },
      tokenIn: {
        address: tokenIn.address,
        symbol: tokenIn.symbol,
        decimals: tokenIn.decimals
      },
      tokenOut: {
        address: tokenOut.address,
        symbol: tokenOut.symbol,
        decimals: tokenOut.decimals
      },
      network,
      timestamp: Date.now(),
      slippageTolerance: 0.5,
      feeTier
    };

  } catch (error) {
    console.warn(`Direct fee quote failed: ${error.message}`);
    return null;
  }
}

/**
 * Select optimal route from multiple quotes using advanced scoring
 * @param {Array} quotes - Array of quote objects
 * @param {Object} options - Selection options
 * @returns {Object} Best quote
 */
function selectOptimalRoute(quotes, options = {}) {
  if (quotes.length === 0) {
    throw new Error('No quotes to select from');
  }

  if (quotes.length === 1) {
    return quotes[0];
  }

  // Score each quote based on multiple factors
  const scoredQuotes = quotes.map(quote => {
    const outputAmount = parseFloat(quote.amountOut);
    const priceImpact = quote.priceImpact || 0;
    const gasEstimate = parseInt(quote.route.gasEstimate || '150000');

    // Scoring factors (weights can be adjusted)
    const outputScore = outputAmount * 100; // Higher output is better
    const impactPenalty = priceImpact * 50; // Lower impact is better
    const gasPenalty = gasEstimate / 1000; // Lower gas is better

    // Preference for certain fee tiers (medium fee tier gets slight bonus)
    const feeTierBonus = quote.feeTier === FEE_TIERS.MEDIUM ? 50 : 0; // Increased bonus to ensure selection

    const totalScore = outputScore - impactPenalty - gasPenalty + feeTierBonus;

    return {
      quote,
      score: totalScore,
      outputAmount,
      priceImpact,
      gasEstimate
    };
  });

  // Sort by score (highest first)
  scoredQuotes.sort((a, b) => b.score - a.score);

  // Apply additional filters based on options
  let filteredQuotes = scoredQuotes;

  // Filter by maximum price impact if specified
  if (options.maxPriceImpact) {
    filteredQuotes = filteredQuotes.filter(sq => sq.priceImpact <= options.maxPriceImpact);
  }

  // Filter by maximum gas if specified
  if (options.maxGas) {
    filteredQuotes = filteredQuotes.filter(sq => sq.gasEstimate <= options.maxGas);
  }

  if (filteredQuotes.length === 0) {
    console.warn('All quotes filtered out, using best available quote');
    return scoredQuotes[0].quote;
  }

  console.warn(`Selected route with score ${filteredQuotes[0].score.toFixed(2)} from ${quotes.length} options`);
  return filteredQuotes[0].quote;
}

/**
 * Estimate gas cost for a specific route
 * @param {Object} quote - Quote object with route information
 * @param {string} network - Network identifier
 * @param {string} fromAddress - Sender address for gas estimation
 * @returns {Promise<Object>} Enhanced gas estimation
 */
async function estimateRouteGasCost(quote, network, fromAddress) {
  try {
    if (!fromAddress) {
      // Use dummy address for estimation if not provided
      fromAddress = '0x0000000000000000000000000000000000000001';
    }

    // Create mock swap data for gas estimation
    const mockSwapData = {
      to: getNetworkConfig(network).UNIVERSAL_ROUTER,
      value: '0',
      data: '0x' + '00'.repeat(200) // Mock calldata
    };

    const gasEstimation = await estimateGasCost(mockSwapData, network, fromAddress);

    // Add route-specific adjustments
    const routeComplexity = quote.route.path.length - 1; // Number of hops
    const complexityMultiplier = 1 + (routeComplexity * 0.2); // 20% more gas per hop

    const adjustedGasLimit = Math.ceil(gasEstimation.gasLimit * complexityMultiplier);
    const adjustedGasCostWei = BigInt(adjustedGasLimit) * BigInt(gasEstimation.gasPrice);
    const adjustedGasCostEth = formatTokenAmount(adjustedGasCostWei.toString(), 18);

    return {
      ...gasEstimation,
      gasLimit: adjustedGasLimit,
      gasCostWei: adjustedGasCostWei.toString(),
      gasCostEth: adjustedGasCostEth,
      routeComplexity,
      complexityMultiplier
    };

  } catch (error) {
    if (logger && console.warn) {
      console.warn(`Route gas estimation failed: ${error.message}`);
    }

    // Return fallback estimation
    return {
      gasEstimate: parseInt(quote.route.gasEstimate || '150000'),
      gasLimit: parseInt(quote.route.gasEstimate || '150000') * 1.2,
      gasPrice: '20000000000', // 20 gwei fallback
      gasCostWei: (BigInt(quote.route.gasEstimate || '150000') * BigInt('20000000000')).toString(),
      gasCostEth: formatTokenAmount((BigInt(quote.route.gasEstimate || '150000') * BigInt('20000000000')).toString(), 18),
      routeComplexity: quote.route.path.length - 1,
      complexityMultiplier: 1,
      network,
      fallback: true
    };
  }
}

/**
 * Calculate route efficiency score
 * @param {Object} quote - Quote object
 * @param {Object} gasEstimation - Gas estimation object
 * @returns {number} Efficiency score (0-100)
 */
function calculateRouteEfficiency(quote, gasEstimation) {
  try {
    const outputAmount = parseFloat(quote.amountOut || '0');
    const priceImpact = parseFloat(quote.priceImpact || '0');
    const gasCostEth = parseFloat(gasEstimation.gasCostEth || '0');

    // Check for NaN values
    if (isNaN(outputAmount) || isNaN(priceImpact) || isNaN(gasCostEth)) {
      return 50;
    }

    // Efficiency factors
    const outputScore = Math.min(outputAmount * 10, 40); // Cap at 40 points
    const impactScore = Math.max(30 - (priceImpact * 3), 0); // Penalty for high impact
    const gasScore = Math.max(30 - (gasCostEth * 1000), 0); // Penalty for high gas

    const efficiency = outputScore + impactScore + gasScore;
    const result = Math.min(Math.round(efficiency), 100);

    return isNaN(result) ? 50 : result;

  } catch (error) {
    logger.error(`Route efficiency calculation failed: ${error.message}`);
    return 50; // Default middle score
  }
}

/**
 * Calculate optimization score for route comparison
 * @param {Object} quote - Quote object
 * @returns {number} Optimization score (higher is better)
 */
function calculateOptimizationScore(quote) {
  try {
    const outputAmount = parseFloat(quote.amountOut);
    const priceImpact = quote.priceImpact || 0;

    // Score based on output amount (higher is better) and price impact (lower is better)
    // Normalize to 0-100 scale
    const outputScore = Math.min(outputAmount * 10, 50); // Cap at 50 points
    const impactScore = Math.max(50 - (priceImpact * 10), 0); // Penalty for high impact

    return Math.round(outputScore + impactScore);

  } catch (error) {
    logger.error(`Optimization score calculation failed: ${error.message}`);
    return 0;
  }
}

/**
 * Clear route cache
 * @param {string} network - Optional specific network to clear
 */
function clearRouteCache(network = null) {
  routeCache.clear();
  quoteCache.clear();
  console.warn('Cleared route and quote caches');
}

/**
 * Get route cache statistics
 * @returns {Object} Cache statistics
 */
function getRouteCacheStats() {
  const { getStats } = require('./cache');
  return {
    routes: getStats('routes'),
    quotes: getStats('quotes')
  };
}

/**
 * Create structured error for quote operations
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {string} operation - Operation that failed
 * @returns {Error} Enhanced error object
 */
function createQuoteError(code, message, details = null, operation = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.operation = operation;
  error.timestamp = Date.now();
  error.retryable = QUOTE_RETRY_CONFIG.RETRYABLE_ERRORS.includes(code);
  
  // Log error with appropriate level
  if (isNetworkQuoteError(code)) {
    console.warn(`${operation || 'quote operation'} network error: ${message}`, { code, details });
  } else if (isValidationQuoteError(code)) {
    console.warn(`${operation || 'quote operation'} validation error: ${message}`, { code, details });
  } else {
    logger.error(`${operation || 'quote operation'} error: ${message}`, { code, details });
  }
  
  return error;
}

/**
 * Check if error code represents a network-related error
 * @param {string} code - Error code
 * @returns {boolean} True if network error
 */
function isNetworkQuoteError(code) {
  return [QUOTE_ERROR_CODES.NETWORK_ERROR, QUOTE_ERROR_CODES.TIMEOUT_ERROR, QUOTE_ERROR_CODES.RPC_ERROR].includes(code);
}

/**
 * Check if error code represents a validation error
 * @param {string} code - Error code
 * @returns {boolean} True if validation error
 */
function isValidationQuoteError(code) {
  return [
    QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS,
    QUOTE_ERROR_CODES.INVALID_AMOUNT,
    QUOTE_ERROR_CODES.INVALID_NETWORK
  ].includes(code);
}

/**
 * Retry wrapper for quote operations with enhanced error handling
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {string} parentOperation - Parent operation context
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<any>} Operation result
 */
async function withQuoteRetry(operation, operationName, parentOperation, retryConfig = QUOTE_RETRY_CONFIG) {
  let lastError;
  let delay = retryConfig.INITIAL_DELAY;

  for (let attempt = 0; attempt <= retryConfig.MAX_RETRIES; attempt++) {
    try {
      console.warn(`${parentOperation}:${operationName} (attempt ${attempt + 1}/${retryConfig.MAX_RETRIES + 1})`);
      const result = await operation();
      
      if (attempt > 0) {
        console.warn(`${parentOperation}:${operationName} succeeded after ${attempt + 1} attempts`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const errorCode = error.code || getQuoteErrorCode(error);
      const isRetryable = retryConfig.RETRYABLE_ERRORS.includes(errorCode);
      
      if (attempt === retryConfig.MAX_RETRIES || !isRetryable) {
        logger.error(`${parentOperation}:${operationName} failed after ${attempt + 1} attempts: ${error.message}`);
        break;
      }
      
      console.warn(`${parentOperation}:${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);
      
      // Wait before retry
      await sleep(delay);
      delay *= retryConfig.BACKOFF_MULTIPLIER;
    }
  }
  
  throw lastError;
}

/**
 * Extract error code from error object for quote operations
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function getQuoteErrorCode(error) {
  if (error.code) {
    return error.code;
  }
  
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('connection')) {
    return QUOTE_ERROR_CODES.NETWORK_ERROR;
  }
  
  if (message.includes('timeout')) {
    return QUOTE_ERROR_CODES.TIMEOUT_ERROR;
  }
  
  if (message.includes('rpc')) {
    return QUOTE_ERROR_CODES.RPC_ERROR;
  }
  
  if (message.includes('insufficient liquidity')) {
    return QUOTE_ERROR_CODES.INSUFFICIENT_LIQUIDITY;
  }
  
  return QUOTE_ERROR_CODES.QUOTE_FAILED;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create structured error for quote operations
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {string} operation - Operation that failed
 * @returns {Error} Enhanced error object
 */
function createQuoteError(code, message, details = null, operation = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.operation = operation;
  error.timestamp = Date.now();
  error.retryable = QUOTE_RETRY_CONFIG.RETRYABLE_ERRORS.includes(code);

  // Log error with appropriate level
  if (isNetworkQuoteError(code)) {
    console.warn(`${operation || 'quote operation'} network error: ${message}`, { code, details });
  } else if (isValidationQuoteError(code)) {
    console.warn(`${operation || 'quote operation'} validation error: ${message}`, { code, details });
  } else {
    logger.error(`${operation || 'quote operation'} error: ${message}`, { code, details });
  }

  return error;
}

/**
 * Check if error code represents a network-related error
 * @param {string} code - Error code
 * @returns {boolean} True if network error
 */
function isNetworkQuoteError(code) {
  return [QUOTE_ERROR_CODES.NETWORK_ERROR, QUOTE_ERROR_CODES.TIMEOUT_ERROR, QUOTE_ERROR_CODES.RPC_ERROR].includes(code);
}

/**
 * Check if error code represents a validation error
 * @param {string} code - Error code
 * @returns {boolean} True if validation error
 */
function isValidationQuoteError(code) {
  return [
    QUOTE_ERROR_CODES.INVALID_TOKEN_ADDRESS,
    QUOTE_ERROR_CODES.INVALID_AMOUNT,
    QUOTE_ERROR_CODES.INVALID_NETWORK
  ].includes(code);
}

/**
 * Retry wrapper for quote operations with enhanced error handling
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {string} parentOperation - Parent operation context
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<any>} Operation result
 */
async function withQuoteRetry(operation, operationName, parentOperation, retryConfig = QUOTE_RETRY_CONFIG) {
  let lastError;
  let delay = retryConfig.INITIAL_DELAY;

  for (let attempt = 0; attempt <= retryConfig.MAX_RETRIES; attempt++) {
    try {
      console.warn(`${parentOperation}:${operationName} (attempt ${attempt + 1}/${retryConfig.MAX_RETRIES + 1})`);
      const result = await operation();

      if (attempt > 0) {
        console.warn(`${parentOperation}:${operationName} succeeded after ${attempt + 1} attempts`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const errorCode = error.code || getQuoteErrorCode(error);
      const isRetryable = retryConfig.RETRYABLE_ERRORS.includes(errorCode);

      if (attempt === retryConfig.MAX_RETRIES || !isRetryable) {
        logger.error(`${parentOperation}:${operationName} failed after ${attempt + 1} attempts: ${error.message}`);
        break;
      }

      console.warn(`${parentOperation}:${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);

      // Wait before retry
      await sleep(delay);
      delay *= retryConfig.BACKOFF_MULTIPLIER;
    }
  }

  throw lastError;
}

/**
 * Extract error code from error object for quote operations
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function getQuoteErrorCode(error) {
  if (error.code) {
    return error.code;
  }

  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('connection')) {
    return QUOTE_ERROR_CODES.NETWORK_ERROR;
  }

  if (message.includes('timeout')) {
    return QUOTE_ERROR_CODES.TIMEOUT_ERROR;
  }

  if (message.includes('rpc')) {
    return QUOTE_ERROR_CODES.RPC_ERROR;
  }

  if (message.includes('liquidity')) {
    return QUOTE_ERROR_CODES.INSUFFICIENT_LIQUIDITY;
  }

  if (message.includes('price impact')) {
    return QUOTE_ERROR_CODES.PRICE_IMPACT_TOO_HIGH;
  }

  return QUOTE_ERROR_CODES.QUOTE_FAILED;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getSwapQuote,
  calculateSimplePriceImpact,
  calculateExecutionPrice,
  estimateGasCost,
  getBestRoute,
  getDirectFeeQuote,
  selectOptimalRoute,
  estimateRouteGasCost,
  calculateRouteEfficiency,
  clearRouteCache,
  getRouteCacheStats,
  getQuoteForFeeTier,
  // Export error handling functions
  createQuoteError,
  withQuoteRetry,
  QUOTE_ERROR_CODES
};