/**
 * Pool Query and Information Retrieval
 * Handles Uniswap pool queries, liquidity data, and trading statistics
 */

const logger = require('../log');
const { getNetworkConfig, FEE_TIERS } = require('./constants');
const { validateTokenAddress, validateNetwork, normalizeNetwork, isValidAddress, toChecksumAddress, hexToDecimalString } = require('./utils');
const { Token } = require('@uniswap/sdk-core');
const { computePoolAddress } = require('@uniswap/v3-sdk');
const { poolCache } = require('./cache');
const { makeRpcRequest, makeBatchRpcRequest } = require('./network');

// Error codes for pool operations
const POOL_ERROR_CODES = {
  INVALID_TOKEN_ADDRESS: 'INVALID_TOKEN_ADDRESS',
  INVALID_POOL_ADDRESS: 'INVALID_POOL_ADDRESS',
  INVALID_FEE_TIER: 'INVALID_FEE_TIER',
  INVALID_NETWORK: 'INVALID_NETWORK',
  POOL_NOT_FOUND: 'POOL_NOT_FOUND',
  POOL_QUERY_FAILED: 'POOL_QUERY_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  LIQUIDITY_QUERY_FAILED: 'LIQUIDITY_QUERY_FAILED'
};

// Retry configuration for pool operations
const POOL_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 500,
  BACKOFF_MULTIPLIER: 2,
  RETRYABLE_ERRORS: [
    POOL_ERROR_CODES.NETWORK_ERROR,
    POOL_ERROR_CODES.TIMEOUT_ERROR,
    POOL_ERROR_CODES.RPC_ERROR
  ]
};

// Helper function to make RPC calls (now uses network optimization)
async function sendRpcRequest(network, method, params) {
  return await makeRpcRequest(network, method, params);
}

/**
 * Get specific pool information by token pair and fee
 * @param {string} token0 - First token address
 * @param {string} token1 - Second token address
 * @param {number} fee - Pool fee tier
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Pool information
 */
async function getPoolByTokens(token0, token1, fee, network) {
  try {
    // Validate inputs
    if (!validateTokenAddress(token0, network)) {
      throw new Error('Invalid token0 address or network');
    }
    
    if (!validateTokenAddress(token1, network)) {
      throw new Error('Invalid token1 address or network');
    }
    
    if (!fee || typeof fee !== 'number' || !Object.values(FEE_TIERS).includes(fee)) {
      throw new Error(`Invalid fee tier: ${fee}. Must be one of: ${Object.values(FEE_TIERS).join(', ')}`);
    }

    const normalizedNetwork = normalizeNetwork(network);
    const config = getNetworkConfig(normalizedNetwork);
    
    // const checksumToken0 = toChecksumAddress(token0);
    // const checksumToken1 = toChecksumAddress(token1);
    const checksumToken0 = token0;
    const checksumToken1 = token1;

    console.warn(`Getting pool info for ${checksumToken0}/${checksumToken1} with fee ${fee} on ${normalizedNetwork}`);

    // Create Token objects for SDK
    const tokenA = new Token(config.CHAIN_ID, checksumToken0, 18); // Decimals will be updated from metadata
    const tokenB = new Token(config.CHAIN_ID, checksumToken1, 18);

    // Compute pool address using Uniswap V3 SDK
    const poolAddress = computePoolAddress({
      factoryAddress: config.V3_FACTORY,
      tokenA: tokenA,
      tokenB: tokenB,
      fee: fee
    });
    console.warn(`Using factory address: ${config.V3_FACTORY}`);
    console.warn(`Token0: ${tokenA}, Token1: ${tokenB}`);

    console.warn(`Computed pool address: ${poolAddress}`);

    // Get pool data from blockchain
    const poolData = await getPoolLiquidity(poolAddress, normalizedNetwork);
    
    if (!poolData.exists) {
      return {
        exists: false,
        address: poolAddress,
        token0: checksumToken0,
        token1: checksumToken1,
        fee: fee,
        network: normalizedNetwork
      };
    }

    return {
      exists: true,
      address: poolAddress,
      token0: checksumToken0,
      token1: checksumToken1,
      fee: fee,
      liquidity: poolData.liquidity,
      sqrtPriceX96: poolData.sqrtPriceX96,
      tick: poolData.tick,
      network: normalizedNetwork
    };

  } catch (error) {
    console.error(`Failed to get pool by tokens: ${error.message}`);
    throw new Error(`Pool query failed: ${error.message}`);
  }
}

/**
 * Get current liquidity data for a pool
 * @param {string} poolAddress - Pool contract address
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Liquidity data
 */
async function getPoolLiquidity(poolAddress, network) {
  try {
    // Validate inputs
    if (!isValidAddress(poolAddress)) {
      throw new Error('Invalid pool address');
    }
    
    if (!validateNetwork(network)) {
      throw new Error(`Invalid network: ${network}`);
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumPoolAddress = toChecksumAddress(poolAddress);

    // Check cache first
    const cached = poolCache.get(normalizedNetwork, checksumPoolAddress);
    if (cached) {
      console.warn(`Pool liquidity cache hit for ${checksumPoolAddress} on ${normalizedNetwork}`);
      return cached;
    }

    console.warn(`Getting liquidity data for pool ${checksumPoolAddress} on ${normalizedNetwork}`);

    // Prepare multicall to get pool state
    // slot0() returns: sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked
    const slot0Selector = '0x3850c7bd'; // slot0()
    const liquiditySelector = '0x1a686502'; // liquidity()

    // Use batch RPC request for better performance
    const requests = [
      {
        method: 'eth_call',
        params: [{ to: checksumPoolAddress, data: slot0Selector }, 'latest']
      },
      {
        method: 'eth_call',
        params: [{ to: checksumPoolAddress, data: liquiditySelector }, 'latest']
      }
    ];

    const [slot0Result, liquidityResult] = await makeBatchRpcRequest(normalizedNetwork, requests);

    // Check if pool exists (calls should return data, not revert)
    if (!slot0Result || !liquidityResult || slot0Result === '0x' || liquidityResult === '0x') {
      console.warn(`Pool ${checksumPoolAddress} does not exist or is not initialized`);
      const result = {
        exists: false,
        address: checksumPoolAddress,
        network: normalizedNetwork
      };
      
      // Cache negative result for shorter time
      poolCache.set(normalizedNetwork, checksumPoolAddress, result);
      return result;
    }

    // Parse slot0 result (returns multiple values)
    // sqrtPriceX96 is first 32 bytes, tick is next 32 bytes (but only uses lower bits)
    const sqrtPriceX96Hex = slot0Result.slice(2, 66); // First 32 bytes
    const tickHex = slot0Result.slice(66, 130); // Second 32 bytes
    
    // Parse liquidity result
    const liquidityHex = liquidityResult.slice(2);

    // Convert hex to decimal strings
    const sqrtPriceX96 = hexToDecimalString('0x' + sqrtPriceX96Hex);
    const liquidity = hexToDecimalString('0x' + liquidityHex);
    
    // Convert tick from hex (handle signed integer)
    let tick = parseInt(tickHex, 16);
    // Handle two's complement for negative ticks
    if (tick > 0x7FFFFFFF) {
      tick = tick - 0x100000000;
    }

    console.warn(`Pool liquidity: ${liquidity}, sqrtPriceX96: ${sqrtPriceX96}, tick: ${tick}`);

    const result = {
      exists: true,
      address: checksumPoolAddress,
      liquidity: liquidity,
      sqrtPriceX96: sqrtPriceX96,
      tick: tick,
      network: normalizedNetwork
    };

    // Cache the result
    poolCache.set(normalizedNetwork, checksumPoolAddress, result);
    
    return result;

  } catch (error) {
    console.error(`Failed to get pool liquidity: ${error.message}`);
    throw new Error(`Pool liquidity query failed: ${error.message}`);
  }
}

/**
 * Validate pool address by checking if it's a valid Uniswap V3 pool
 * @param {string} poolAddress - Pool contract address
 * @param {string} network - Network identifier
 * @returns {Promise<boolean>} Validation result
 */
async function validatePoolAddress(poolAddress, network) {
  try {
    if (!isValidAddress(poolAddress)) {
      return false;
    }

    const poolData = await getPoolLiquidity(poolAddress, network);
    return poolData.exists;
  } catch (error) {
    console.error(`Pool address validation failed: ${error.message}`);
    return false;
  }
}

// Pool cache is now handled by the centralized cache system

/**
 * Get pool statistics including volume and price data
 * @param {string} poolAddress - Pool contract address
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Pool statistics
 */
async function getPoolStatistics(poolAddress, network) {
  try {
    // Validate inputs
    if (!isValidAddress(poolAddress)) {
      throw new Error('Invalid pool address');
    }
    
    if (!validateNetwork(network)) {
      throw new Error(`Invalid network: ${network}`);
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumPoolAddress = toChecksumAddress(poolAddress);

    // Check cache first
    const cached = poolCache.getStats(normalizedNetwork, checksumPoolAddress);
    if (cached) {
      console.warn(`Pool statistics cache hit for ${checksumPoolAddress} on ${normalizedNetwork}`);
      return cached;
    }

    console.warn(`Getting pool statistics for ${checksumPoolAddress} on ${normalizedNetwork}`);

    // Get basic pool liquidity data first
    const poolData = await getPoolLiquidity(checksumPoolAddress, normalizedNetwork);
    
    if (!poolData.exists) {
      const result = {
        exists: false,
        address: checksumPoolAddress,
        network: normalizedNetwork
      };
      
      // Cache the result
      poolCache.setStats(normalizedNetwork, checksumPoolAddress, result);
      return result;
    }

    // Get additional pool data
    // For now, we'll return basic statistics. In a production environment,
    // you would integrate with subgraph or other data sources for volume/price data
    const statistics = {
      exists: true,
      address: checksumPoolAddress,
      network: normalizedNetwork,
      liquidity: poolData.liquidity,
      sqrtPriceX96: poolData.sqrtPriceX96,
      tick: poolData.tick,
      // Note: Volume and TVL data would typically come from The Graph subgraph
      // For this implementation, we'll provide placeholder values
      volume24h: '0', // Would be fetched from subgraph in production
      tvl: '0', // Would be calculated from liquidity and token prices
      priceChange24h: 0, // Would be calculated from historical data
      lastUpdated: Date.now()
    };

    // Cache the result
    poolCache.setStats(normalizedNetwork, checksumPoolAddress, statistics);
    
    console.warn(`Pool statistics retrieved for ${checksumPoolAddress}`);
    return statistics;

  } catch (error) {
    console.error(`Failed to get pool statistics: ${error.message}`);
    throw new Error(`Pool statistics query failed: ${error.message}`);
  }
}

/**
 * Get all pools for a token pair across different fee tiers
 * @param {string} token0 - First token address
 * @param {string} token1 - Second token address
 * @param {string} network - Network identifier
 * @returns {Promise<Array>} List of pools
 */
async function getAllPoolsForPair(token0, token1, network) {
  try {
    // Validate inputs
    if (!validateTokenAddress(token0, network)) {
      throw new Error('Invalid token0 address or network');
    }
    
    if (!validateTokenAddress(token1, network)) {
      throw new Error('Invalid token1 address or network');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumToken0 = token0;
    const checksumToken1 = token1;
    
    // Create cache key (order tokens consistently)
    const [tokenA, tokenB] = checksumToken0.toLowerCase() < checksumToken1.toLowerCase() 
      ? [checksumToken0, checksumToken1] 
      : [checksumToken1, checksumToken0];

    // Check cache first
    const cached = poolCache.getPair(normalizedNetwork, tokenA, tokenB);
    if (cached) {
      console.warn(`Pool list cache hit for ${tokenA}/${tokenB} on ${normalizedNetwork}`);
      return cached;
    }

    console.warn(`Getting all pools for ${checksumToken0}/${checksumToken1} on ${normalizedNetwork}`);

    const config = getNetworkConfig(normalizedNetwork);
    const pools = [];

    // Check all standard fee tiers
    const feeTiers = Object.values(FEE_TIERS);
    
    // Query pools for each fee tier in parallel
    const poolPromises = feeTiers.map(async (fee) => {
      try {
        const poolInfo = await getPoolByTokens(checksumToken0, checksumToken1, fee, normalizedNetwork);
        if (poolInfo.exists) {
          return {
            ...poolInfo,
            fee: fee,
            feeTier: getFeeLabel(fee)
          };
        }
        return null;
      } catch (error) {
        console.warn(`Failed to get pool for fee tier ${fee}: ${error.message}`);
        return null;
      }
    });

    const poolResults = await Promise.all(poolPromises);
    
    // Filter out null results and add to pools array
    for (const pool of poolResults) {
      if (pool) {
        pools.push(pool);
      }
    }

    // Sort pools by liquidity (highest first)
    pools.sort((a, b) => {
      const liquidityA = BigInt(a.liquidity || '0');
      const liquidityB = BigInt(b.liquidity || '0');
      if (liquidityA > liquidityB) return -1;
      if (liquidityA < liquidityB) return 1;
      return 0;
    });

    const result = {
      token0: checksumToken0,
      token1: checksumToken1,
      network: normalizedNetwork,
      pools: pools,
      totalPools: pools.length,
      lastUpdated: Date.now()
    };

    // Cache the result
    poolCache.setPair(normalizedNetwork, tokenA, tokenB, result);
    
    console.warn(`Found ${pools.length} pools for ${checksumToken0}/${checksumToken1} on ${normalizedNetwork}`);
    return result;

  } catch (error) {
    console.error(`Failed to get pools for pair: ${error.message}`);
    throw new Error(`Pool pair query failed: ${error.message}`);
  }
}

/**
 * Get human-readable fee tier label
 * @param {number} fee - Fee tier in basis points
 * @returns {string} Fee label
 */
function getFeeLabel(fee) {
  switch (fee) {
    case FEE_TIERS.LOWEST:
      return '0.01%';
    case FEE_TIERS.LOW:
      return '0.05%';
    case FEE_TIERS.MEDIUM:
      return '0.3%';
    case FEE_TIERS.HIGH:
      return '1%';
    default:
      return `${fee / 10000}%`;
  }
}

/**
 * Clear pool cache
 * @param {string} key - Optional specific cache key to clear
 */
function clearPoolCache(key = null) {
  poolCache.clear();
  console.warn('Cleared pool cache');
}

/**
 * Get pool cache statistics
 * @returns {Object} Cache statistics
 */
function getPoolCacheStats() {
  const { getStats } = require('./cache');
  return getStats('poolData');
}

/**
 * Create structured error for pool operations
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {string} operation - Operation that failed
 * @returns {Error} Enhanced error object
 */
function createPoolError(code, message, details = null, operation = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.operation = operation;
  error.timestamp = Date.now();
  error.retryable = POOL_RETRY_CONFIG.RETRYABLE_ERRORS.includes(code);
  
  // Log error with appropriate level
  if (isNetworkPoolError(code)) {
    console.warn(`${operation || 'pool operation'} network error: ${message}`, { code, details });
  } else if (isValidationPoolError(code)) {
    console.warn(`${operation || 'pool operation'} validation error: ${message}`, { code, details });
  } else {
    console.error(`${operation || 'pool operation'} error: ${message}`, { code, details });
  }
  
  return error;
}

/**
 * Check if error code represents a network-related error
 * @param {string} code - Error code
 * @returns {boolean} True if network error
 */
function isNetworkPoolError(code) {
  return [POOL_ERROR_CODES.NETWORK_ERROR, POOL_ERROR_CODES.TIMEOUT_ERROR, POOL_ERROR_CODES.RPC_ERROR].includes(code);
}

/**
 * Check if error code represents a validation error
 * @param {string} code - Error code
 * @returns {boolean} True if validation error
 */
function isValidationPoolError(code) {
  return [
    POOL_ERROR_CODES.INVALID_TOKEN_ADDRESS,
    POOL_ERROR_CODES.INVALID_POOL_ADDRESS,
    POOL_ERROR_CODES.INVALID_FEE_TIER,
    POOL_ERROR_CODES.INVALID_NETWORK
  ].includes(code);
}

/**
 * Retry wrapper for pool operations with enhanced error handling
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {string} parentOperation - Parent operation context
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<any>} Operation result
 */
async function withPoolRetry(operation, operationName, parentOperation, retryConfig = POOL_RETRY_CONFIG) {
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
      const errorCode = error.code || getPoolErrorCode(error);
      const isRetryable = retryConfig.RETRYABLE_ERRORS.includes(errorCode);
      
      if (attempt === retryConfig.MAX_RETRIES || !isRetryable) {
        console.error(`${parentOperation}:${operationName} failed after ${attempt + 1} attempts: ${error.message}`);
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
 * Extract error code from error object for pool operations
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function getPoolErrorCode(error) {
  if (error.code) {
    return error.code;
  }
  
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('connection')) {
    return POOL_ERROR_CODES.NETWORK_ERROR;
  }
  
  if (message.includes('timeout')) {
    return POOL_ERROR_CODES.TIMEOUT_ERROR;
  }
  
  if (message.includes('rpc')) {
    return POOL_ERROR_CODES.RPC_ERROR;
  }
  
  if (message.includes('pool not found') || message.includes('does not exist')) {
    return POOL_ERROR_CODES.POOL_NOT_FOUND;
  }
  
  return POOL_ERROR_CODES.POOL_QUERY_FAILED;
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
  getPoolByTokens,
  getPoolLiquidity,
  validatePoolAddress,
  getPoolStatistics,
  getAllPoolsForPair,
  clearPoolCache,
  getPoolCacheStats,
  // Export error handling functions
  createPoolError,
  withPoolRetry,
  POOL_ERROR_CODES
};