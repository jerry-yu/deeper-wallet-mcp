/**
 * Uniswap Integration Module
 * Main module exports and orchestration for Uniswap functionality
 */

const logger = require('../log');
const swap = require('./swap');
const pool = require('./pool');
const quote = require('./quote');
const utils = require('./utils');
const { validateNetwork, normalizeNetwork, validateTokenAddress, validateAmount } = utils;

// Error codes for structured error responses
const ERROR_CODES = {
  // Parameter validation errors
  INVALID_PARAMS: 'INVALID_PARAMS',
  INVALID_TOKEN_IN: 'INVALID_TOKEN_IN',
  INVALID_TOKEN_OUT: 'INVALID_TOKEN_OUT',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  INVALID_NETWORK: 'INVALID_NETWORK',
  INVALID_SLIPPAGE: 'INVALID_SLIPPAGE',
  INVALID_DEADLINE: 'INVALID_DEADLINE',
  INVALID_FEE: 'INVALID_FEE',
  
  // Operation errors
  ROUTE_CALCULATION_FAILED: 'ROUTE_CALCULATION_FAILED',
  TRANSACTION_PREPARATION_FAILED: 'TRANSACTION_PREPARATION_FAILED',
  SWAP_EXECUTION_FAILED: 'SWAP_EXECUTION_FAILED',
  QUOTE_FAILED: 'QUOTE_FAILED',
  POOL_INFO_FAILED: 'POOL_INFO_FAILED',
  POOL_LIST_FAILED: 'POOL_LIST_FAILED',
  SUPPORTED_TOKENS_FAILED: 'SUPPORTED_TOKENS_FAILED',
  BEST_ROUTE_FAILED: 'BEST_ROUTE_FAILED',
  
  // Network and infrastructure errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  
  // General errors
  SWAP_FAILED: 'SWAP_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Retry configuration
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000, // 1 second
  BACKOFF_MULTIPLIER: 2,
  RETRYABLE_ERRORS: [
    'NETWORK_ERROR',
    'RPC_ERROR',
    'TIMEOUT_ERROR',
    'RATE_LIMIT_ERROR'
  ]
};

/**
 * Execute a token swap on Uniswap
 * @param {Object} params - Swap parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string} params.amountIn - Input amount in token units
 * @param {number} params.slippageTolerance - Slippage tolerance (0.5 = 0.5%)
 * @param {number} params.deadline - Transaction deadline timestamp
 * @param {string} params.recipient - Recipient address
 * @param {string} params.network - Network identifier
 * @param {string} password - Wallet password for signing
 * @returns {Promise<Object>} Swap result with transaction hash
 */
async function swapTokens(params, password) {
  return handleOperation(async () => {
    // Validate required parameters
    const requiredFields = ['tokenIn', 'tokenOut', 'amountIn', 'recipient', 'network'];
    const validationError = validateInputParameters(params, requiredFields, 'swapTokens');
    if (validationError) {
      return validationError;
    }

    const { tokenIn, tokenOut, amountIn, slippageTolerance, deadline, recipient, network } = params;

    // Validate inputs with detailed error messages
    if (!validateTokenAddress(tokenIn, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_IN, 'Invalid input token address or network', 
        { tokenIn, network }, 'swapTokens');
    }

    if (!validateTokenAddress(tokenOut, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_OUT, 'Invalid output token address or network', 
        { tokenOut, network }, 'swapTokens');
    }

    if (!validateAmount(amountIn)) {
      return createErrorResponse(ERROR_CODES.INVALID_AMOUNT, 'Invalid input amount', 
        { amountIn }, 'swapTokens');
    }

    if (!password || typeof password !== 'string') {
      return createErrorResponse(ERROR_CODES.INVALID_PASSWORD, 'Password is required for signing', 
        null, 'swapTokens');
    }

    if (!recipient || !utils.isValidAddress(recipient)) {
      return createErrorResponse(ERROR_CODES.INVALID_RECIPIENT, 'Invalid recipient address', 
        { recipient }, 'swapTokens');
    }

    // Set defaults for optional parameters
    const finalSlippage = slippageTolerance || 0.5;
    const finalDeadline = deadline || Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now

    // Validate slippage and deadline
    if (typeof finalSlippage !== 'number' || finalSlippage < 0.1 || finalSlippage > 50) {
      return createErrorResponse(ERROR_CODES.INVALID_SLIPPAGE, 'Slippage tolerance must be between 0.1% and 50%', 
        { slippage: finalSlippage }, 'swapTokens');
    }

    if (typeof finalDeadline !== 'number' || finalDeadline <= Math.floor(Date.now() / 1000)) {
      return createErrorResponse(ERROR_CODES.INVALID_DEADLINE, 'Deadline must be a future timestamp', 
        { deadline: finalDeadline, currentTime: Math.floor(Date.now() / 1000) }, 'swapTokens');
    }

    // Calculate swap route with retry logic
    const route = await withRetry(
      () => swap.calculateSwapRoute(tokenIn, tokenOut, amountIn, network),
      'calculateSwapRoute'
    );
    
    if (!route) {
      return createErrorResponse(ERROR_CODES.ROUTE_CALCULATION_FAILED, 'Failed to calculate swap route', 
        { tokenIn, tokenOut, amountIn, network }, 'swapTokens');
    }

    // Prepare swap transaction with retry logic
    const swapData = await withRetry(
      () => swap.prepareSwapTransaction(route, finalSlippage, finalDeadline),
      'prepareSwapTransaction'
    );
    
    if (!swapData) {
      return createErrorResponse(ERROR_CODES.TRANSACTION_PREPARATION_FAILED, 'Failed to prepare swap transaction', 
        { route, slippage: finalSlippage, deadline: finalDeadline }, 'swapTokens');
    }

    // Execute swap with signing (no retry for signing operations)
    const result = await swap.executeSwap(password, recipient, swapData, network);
    
    if (!result.success) {
      return createErrorResponse(ERROR_CODES.SWAP_EXECUTION_FAILED, result.error?.message || 'Swap execution failed', 
        { swapData, result }, 'swapTokens');
    }

    console.warn(`Token swap completed successfully: ${result.transactionHash}`, {
      tokenIn, tokenOut, amountIn, recipient, network,
      transactionHash: result.transactionHash,
      gasUsed: result.gasUsed
    });

    return {
      success: true,
      transactionHash: result.transactionHash,
      gasUsed: result.gasUsed,
      gasFee: result.gasFee,
      swapData: result.swapData
    };
  }, 'swapTokens', { tokenIn: params?.tokenIn, tokenOut: params?.tokenOut, network: params?.network });
}

/**
 * Get a quote for a token swap
 * @param {Object} params - Quote parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string} params.amountIn - Input amount in token units
 * @param {string} params.network - Network identifier
 * @param {number} params.slippageTolerance - Optional slippage tolerance
 * @returns {Promise<Object>} Swap quote with expected output and price impact
 */
async function getSwapQuote(params) {
  return handleOperation(async () => {
    // Validate required parameters
    const requiredFields = ['tokenIn', 'tokenOut', 'amountIn', 'network'];
    const validationError = validateInputParameters(params, requiredFields, 'getSwapQuote');
    if (validationError) {
      return validationError;
    }

    const { tokenIn, tokenOut, amountIn, network, slippageTolerance } = params;

    // Validate inputs with detailed error messages
    if (!validateTokenAddress(tokenIn, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_IN, 'Invalid input token address or network', 
        { tokenIn, network }, 'getSwapQuote');
    }

    if (!validateTokenAddress(tokenOut, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_OUT, 'Invalid output token address or network', 
        { tokenOut, network }, 'getSwapQuote');
    }

    if (!validateAmount(amountIn)) {
      return createErrorResponse(ERROR_CODES.INVALID_AMOUNT, 'Invalid input amount', 
        { amountIn }, 'getSwapQuote');
    }

    // Get quote using quote module with retry logic
    const quoteResult = await withRetry(
      () => quote.getSwapQuote(tokenIn, tokenOut, amountIn, network, {
        slippageTolerance: slippageTolerance || 0.5
      }),
      'getSwapQuote'
    );

    console.warn(`Quote generated: ${quoteResult.amountOut} ${quoteResult.tokenOut.symbol}`, {
      tokenIn, tokenOut, amountIn, network,
      amountOut: quoteResult.amountOut,
      priceImpact: quoteResult.priceImpact
    });

    return {
      success: true,
      quote: quoteResult
    };
  }, 'getSwapQuote', { tokenIn: params?.tokenIn, tokenOut: params?.tokenOut, network: params?.network });
}

/**
 * Get information about a specific pool
 * @param {Object} params - Pool query parameters
 * @param {string} params.token0 - First token address
 * @param {string} params.token1 - Second token address
 * @param {number} params.fee - Pool fee tier
 * @param {string} params.network - Network identifier
 * @returns {Promise<Object>} Pool information
 */
async function getPoolInfo(params) {
  return handleOperation(async () => {
    // Validate required parameters
    const requiredFields = ['token0', 'token1', 'fee', 'network'];
    const validationError = validateInputParameters(params, requiredFields, 'getPoolInfo');
    if (validationError) {
      return validationError;
    }

    const { token0, token1, fee, network } = params;

    // Validate inputs with detailed error messages
    if (!validateTokenAddress(token0, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_IN, 'Invalid token0 address or network', 
        { token0, network }, 'getPoolInfo');
    }

    if (!validateTokenAddress(token1, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_OUT, 'Invalid token1 address or network', 
        { token1, network }, 'getPoolInfo');
    }

    if (!fee || typeof fee !== 'number') {
      return createErrorResponse(ERROR_CODES.INVALID_FEE, 'Fee tier is required and must be a number', 
        { fee }, 'getPoolInfo');
    }

    // Get pool information with retry logic
    const poolInfo = await withRetry(
      () => pool.getPoolByTokens(token0, token1, fee, network),
      'getPoolByTokens'
    );

    console.warn(`Pool info retrieved for ${token0}/${token1} with fee ${fee}`, {
      token0, token1, fee, network,
      poolExists: poolInfo.exists,
      poolAddress: poolInfo.address
    });

    return {
      success: true,
      pool: poolInfo
    };
  }, 'getPoolInfo', { token0: params?.token0, token1: params?.token1, fee: params?.fee, network: params?.network });
}

/**
 * Get list of pools for a token pair
 * @param {Object} params - Pool list parameters
 * @param {string} params.token0 - First token address
 * @param {string} params.token1 - Second token address
 * @param {string} params.network - Network identifier
 * @returns {Promise<Object>} List of pools for the pair
 */
async function getPoolList(params) {
  return handleOperation(async () => {
    // Validate required parameters
    const requiredFields = ['token0', 'token1', 'network'];
    const validationError = validateInputParameters(params, requiredFields, 'getPoolList');
    if (validationError) {
      return validationError;
    }

    const { token0, token1, network } = params;

    // Validate inputs with detailed error messages
    if (!validateTokenAddress(token0, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_IN, 'Invalid token0 address or network', 
        { token0, network }, 'getPoolList');
    }

    if (!validateTokenAddress(token1, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_OUT, 'Invalid token1 address or network', 
        { token1, network }, 'getPoolList');
    }

    // Get all pools for the pair with retry logic
    const poolList = await withRetry(
      () => pool.getAllPoolsForPair(token0, token1, network),
      'getAllPoolsForPair'
    );

    console.warn(`Found ${poolList.totalPools} pools for ${token0}/${token1}`, {
      token0, token1, network,
      totalPools: poolList.totalPools,
      poolCount: poolList.pools?.length || 0
    });

    return {
      success: true,
      pools: poolList
    };
  }, 'getPoolList', { token0: params?.token0, token1: params?.token1, network: params?.network });
}

/**
 * Get supported tokens for a network
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} List of supported tokens
 */
async function getSupportedTokens(network) {
  return handleOperation(async () => {
    // Validate network
    if (!validateNetwork(network)) {
      return createErrorResponse(ERROR_CODES.INVALID_NETWORK, 'Invalid or unsupported network', 
        { network }, 'getSupportedTokens');
    }

    const normalizedNetwork = normalizeNetwork(network);

    // For this implementation, we'll return a basic list of common tokens
    // In production, this would be fetched from a token registry or database
    const commonTokens = getCommonTokensForNetwork(normalizedNetwork);

    console.warn(`Retrieved ${commonTokens.length} supported tokens for ${normalizedNetwork}`, {
      network: normalizedNetwork,
      tokenCount: commonTokens.length,
      tokens: commonTokens.map(t => t.symbol)
    });

    return {
      success: true,
      network: normalizedNetwork,
      tokens: commonTokens,
      count: commonTokens.length
    };
  }, 'getSupportedTokens', { network });
}

/**
 * Get best route for a token swap with optimization
 * @param {Object} params - Route parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string} params.amountIn - Input amount in token units
 * @param {string} params.network - Network identifier
 * @param {Object} params.options - Additional options
 * @returns {Promise<Object>} Best route with optimization details
 */
async function getBestRoute(params) {
  return handleOperation(async () => {
    // Validate required parameters
    const requiredFields = ['tokenIn', 'tokenOut', 'amountIn', 'network'];
    const validationError = validateInputParameters(params, requiredFields, 'getBestRoute');
    if (validationError) {
      return validationError;
    }

    const { tokenIn, tokenOut, amountIn, network, options = {} } = params;

    // Validate inputs with detailed error messages
    if (!validateTokenAddress(tokenIn, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_IN, 'Invalid input token address or network', 
        { tokenIn, network }, 'getBestRoute');
    }

    if (!validateTokenAddress(tokenOut, network)) {
      return createErrorResponse(ERROR_CODES.INVALID_TOKEN_OUT, 'Invalid output token address or network', 
        { tokenOut, network }, 'getBestRoute');
    }

    if (!validateAmount(amountIn)) {
      return createErrorResponse(ERROR_CODES.INVALID_AMOUNT, 'Invalid input amount', 
        { amountIn }, 'getBestRoute');
    }

    // Get best route using quote module with retry logic
    const bestRoute = await withRetry(
      () => quote.getBestRoute(tokenIn, tokenOut, amountIn, network, options),
      'getBestRoute'
    );

    console.warn(`Best route found with ${bestRoute.optimization.quotesEvaluated} quotes evaluated`, {
      tokenIn, tokenOut, amountIn, network,
      quotesEvaluated: bestRoute.optimization.quotesEvaluated,
      optimizationScore: bestRoute.optimization.optimizationScore,
      routeEfficiency: bestRoute.optimization.routeEfficiency
    });

    return {
      success: true,
      route: bestRoute
    };
  }, 'getBestRoute', { tokenIn: params?.tokenIn, tokenOut: params?.tokenOut, network: params?.network });
}

/**
 * Create standardized error response with enhanced logging
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {string} operation - Operation that failed
 * @returns {Object} Error response object
 */
function createErrorResponse(code, message, details = null, operation = null) {
  const errorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      operation,
      timestamp: Date.now(),
      retryable: RETRY_CONFIG.RETRYABLE_ERRORS.includes(code)
    }
  };

  // Log error with appropriate level based on error type
  const logContext = {
    code,
    message,
    operation,
    details: details ? JSON.stringify(details) : null
  };

  if (isNetworkError(code)) {
    console.warn(`Network error in ${operation || 'unknown operation'}: ${message}`, logContext);
  } else if (isValidationError(code)) {
    console.warn(`Validation error in ${operation || 'unknown operation'}: ${message}`, logContext);
  } else {
    logger.error(`Error in ${operation || 'unknown operation'}: ${message}`, logContext);
  }

  return errorResponse;
}

/**
 * Check if error code represents a network-related error
 * @param {string} code - Error code
 * @returns {boolean} True if network error
 */
function isNetworkError(code) {
  return ['NETWORK_ERROR', 'RPC_ERROR', 'TIMEOUT_ERROR', 'RATE_LIMIT_ERROR'].includes(code);
}

/**
 * Check if error code represents a validation error
 * @param {string} code - Error code
 * @returns {boolean} True if validation error
 */
function isValidationError(code) {
  return code.startsWith('INVALID_');
}

/**
 * Retry wrapper for operations that may fail due to network issues
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<any>} Operation result
 */
async function withRetry(operation, operationName, retryConfig = RETRY_CONFIG) {
  let lastError;
  let delay = retryConfig.INITIAL_DELAY;

  for (let attempt = 0; attempt <= retryConfig.MAX_RETRIES; attempt++) {
    try {
      console.warn(`Executing ${operationName} (attempt ${attempt + 1}/${retryConfig.MAX_RETRIES + 1})`);
      const result = await operation();
      
      if (attempt > 0) {
        console.warn(`${operationName} succeeded after ${attempt + 1} attempts`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const errorCode = getErrorCode(error);
      const isRetryable = retryConfig.RETRYABLE_ERRORS.includes(errorCode);
      
      if (attempt === retryConfig.MAX_RETRIES || !isRetryable) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts: ${error.message}`);
        break;
      }
      
      console.warn(`${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);
      
      // Wait before retry
      await sleep(delay);
      delay *= retryConfig.BACKOFF_MULTIPLIER;
    }
  }
  
  throw lastError;
}

/**
 * Extract error code from error object
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function getErrorCode(error) {
  if (error.code) {
    return error.code;
  }
  
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('connection')) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  
  if (message.includes('timeout')) {
    return ERROR_CODES.TIMEOUT_ERROR;
  }
  
  if (message.includes('rate limit')) {
    return ERROR_CODES.RATE_LIMIT_ERROR;
  }
  
  if (message.includes('rpc')) {
    return ERROR_CODES.RPC_ERROR;
  }
  
  return ERROR_CODES.UNKNOWN_ERROR;
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
 * Validate and sanitize input parameters
 * @param {Object} params - Parameters to validate
 * @param {Array} requiredFields - Required field names
 * @param {string} operation - Operation name for error context
 * @returns {Object|null} Validation result or null if valid
 */
function validateInputParameters(params, requiredFields, operation) {
  if (!params || typeof params !== 'object') {
    return createErrorResponse(ERROR_CODES.INVALID_PARAMS, 'Invalid parameters object', null, operation);
  }

  for (const field of requiredFields) {
    if (!params[field]) {
      return createErrorResponse(
        ERROR_CODES.INVALID_PARAMS, 
        `Missing required parameter: ${field}`, 
        { field, requiredFields }, 
        operation
      );
    }
  }

  return null; // Valid
}

/**
 * Enhanced error handling wrapper for async operations
 * @param {Function} operation - Async operation to wrap
 * @param {string} operationName - Name of the operation
 * @param {Object} context - Additional context for error logging
 * @returns {Promise<Object>} Operation result or error response
 */
async function handleOperation(operation, operationName, context = {}) {
  try {
    console.warn(`Starting ${operationName}`, context);
    const startTime = Date.now();
    
    const result = await operation();
    
    const duration = Date.now() - startTime;
    console.warn(`${operationName} completed successfully in ${duration}ms`, { ...context, duration });
    
    return result;
  } catch (error) {
    const errorCode = getErrorCode(error);
    const errorMessage = error.message || 'Unknown error occurred';
    
    logger.error(`${operationName} failed: ${errorMessage}`, {
      ...context,
      error: errorMessage,
      stack: error.stack
    });
    
    return createErrorResponse(errorCode, errorMessage, { 
      originalError: error.message,
      context 
    }, operationName);
  }
}

/**
 * Get common tokens for a specific network
 * @param {string} network - Network identifier
 * @returns {Array} Array of common token objects
 */
function getCommonTokensForNetwork(network) {
  const commonTokens = {
    'ETHEREUM': [
      {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
      },
      {
        address: '0xA0b86a33E6441E6C8D3C1c4c9b8b8b8b8b8b8b8b',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6
      }
    ],
    'ARBITRUM': [
      {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
      },
      {
        address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      }
    ],
    'OPTIMISM': [
      {
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
      },
      {
        address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      }
    ],
    'BASE': [
      {
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
      },
      {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      }
    ],
    'POLYGON': [
      {
        address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
      },
      {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
      }
    ]
  };

  return commonTokens[network] || [];
}

module.exports = {
  swapTokens,
  getSwapQuote,
  getPoolInfo,
  getPoolList,
  getSupportedTokens,
  getBestRoute
};