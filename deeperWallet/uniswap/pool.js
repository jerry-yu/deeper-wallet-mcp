const { getNetworkConfig, isValidAddress, getFeeTierName } = require('./utils');
const { SELECTORS, FEE_TIERS } = require('./constants');
const { performanceCache } = require('./cache');
const { sendCachedRpcRequest, sendMultipleRpcRequests } = require('./rpc');
const { encodeFunctionCall, decodeAddress, decodeHexToDecimal } = require('./encoding');
const { createError, getUserFriendlyErrorMessage } = require('./errors');
const { validatePoolParams } = require('./validation');

/**
 * Get Uniswap V2 pair address for two tokens
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {Promise<string|null>} Pair address or null if not found
 */
async function getV2PairAddress(network, tokenA, tokenB, options = {}) {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Sort tokens (Uniswap V2 requires sorted addresses)
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Check cache first
    const cacheKey = [network, 'v2-pair', token0, token1];
    const cachedAddress = performanceCache.get('existence', cacheKey);
    if (cachedAddress !== null) {
      return cachedAddress;
    }

    // Encode getPair(address,address) call
    const data = encodeFunctionCall(SELECTORS.GET_PAIR, [token0, token1]);

    const result = await sendCachedRpcRequest(network, 'eth_call', [
      {
        to: config.v2Factory,
        data: data
      },
      'latest'
    ], options);

    if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      // Cache null result to avoid repeated failed lookups
      performanceCache.set('existence', cacheKey, null);
      return null; // Pair doesn't exist
    }

    const pairAddress = decodeAddress(result);

    // Cache the successful result
    performanceCache.set('existence', cacheKey, pairAddress);

    return pairAddress;
  } catch (error) {
    console.error('Error getting V2 pair address:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V3 pool address for two tokens and fee tier
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} fee - Fee tier (500, 3000, 10000)
 * @returns {Promise<string|null>} Pool address or null if not found
 */
async function getV3PoolAddress(network, tokenA, tokenB, fee) {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Sort tokens (Uniswap V3 requires sorted addresses)
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Encode getPool(address,address,uint24) call
    const data = encodeFunctionCall(SELECTORS.GET_POOL, [token0, token1, fee]);

    const result = await sendCachedRpcRequest(network, 'eth_call', [
      {
        to: config.v3Factory,
        data: data
      },
      'latest'
    ]);

    if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return null; // Pool doesn't exist
    }

    return decodeAddress(result);
  } catch (error) {
    console.error('Error getting V3 pool address:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V2 pool reserves and metadata
 * @param {string} network - Network name
 * @param {string} pairAddress - V2 pair contract address
 * @returns {Promise<Object|null>} Pool reserves data or null if error
 */
async function getV2PoolReserves(network, pairAddress, options = {}) {
  try {
    if (!isValidAddress(pairAddress)) {
      throw new Error('Invalid pair address');
    }

    // Check cache first
    const cacheKey = [network, 'v2-reserves', pairAddress];
    const cachedReserves = performanceCache.get('pools', cacheKey);
    if (cachedReserves !== null) {
      return cachedReserves;
    }

    // Call getReserves() function
    const result = await sendCachedRpcRequest(network, 'eth_call', [
      {
        to: pairAddress,
        data: SELECTORS.GET_RESERVES
      },
      'latest'
    ], options);

    if (!result || result === '0x') {
      return null;
    }

    // Decode the result (reserve0, reserve1, blockTimestampLast)
    // Each value is 32 bytes (64 hex characters)
    const reserve0Hex = result.slice(2, 66);
    const reserve1Hex = result.slice(66, 130);
    const blockTimestampLastHex = result.slice(130, 194);

    const reserve0 = decodeHexToDecimal('0x' + reserve0Hex);
    const reserve1 = decodeHexToDecimal('0x' + reserve1Hex);
    const blockTimestampLast = decodeHexToDecimal('0x' + blockTimestampLastHex);

    const reservesData = {
      reserve0,
      reserve1,
      blockTimestampLast,
      version: 'V2'
    };

    // Cache the result
    performanceCache.set('pools', cacheKey, reservesData);

    return reservesData;
  } catch (error) {
    console.error('Error getting V2 pool reserves:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V3 pool liquidity and slot0 data
 * @param {string} network - Network name
 * @param {string} poolAddress - V3 pool contract address
 * @returns {Promise<Object|null>} Pool liquidity data or null if error
 */
async function getV3PoolData(network, poolAddress) {
  try {
    if (!isValidAddress(poolAddress)) {
      throw new Error('Invalid pool address');
    }

    // Make two calls: slot0() and liquidity()
    const [slot0Result, liquidityResult] = await Promise.all([
      sendCachedRpcRequest(network, 'eth_call', [
        {
          to: poolAddress,
          data: SELECTORS.SLOT0
        },
        'latest'
      ]),
      sendCachedRpcRequest(network, 'eth_call', [
        {
          to: poolAddress,
          data: SELECTORS.LIQUIDITY
        },
        'latest'
      ])
    ]);

    if (!slot0Result || slot0Result === '0x' || !liquidityResult || liquidityResult === '0x') {
      return null;
    }

    // Decode slot0 result (sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked)
    const sqrtPriceX96Hex = slot0Result.slice(2, 66);
    const tickHex = slot0Result.slice(66, 130);
    const observationIndexHex = slot0Result.slice(130, 194);
    const observationCardinalityHex = slot0Result.slice(194, 258);
    const observationCardinalityNextHex = slot0Result.slice(258, 322);
    const feeProtocolHex = slot0Result.slice(322, 386);
    const unlockedHex = slot0Result.slice(386, 450);

    // Decode liquidity result
    const liquidity = decodeHexToDecimal(liquidityResult);

    return {
      sqrtPriceX96: decodeHexToDecimal('0x' + sqrtPriceX96Hex),
      tick: decodeHexToDecimal('0x' + tickHex),
      observationIndex: decodeHexToDecimal('0x' + observationIndexHex),
      observationCardinality: decodeHexToDecimal('0x' + observationCardinalityHex),
      observationCardinalityNext: decodeHexToDecimal('0x' + observationCardinalityNextHex),
      feeProtocol: decodeHexToDecimal('0x' + feeProtocolHex),
      unlocked: decodeHexToDecimal('0x' + unlockedHex) === '1',
      liquidity,
      version: 'V3'
    };
  } catch (error) {
    console.error('Error getting V3 pool data:', error.message);
    return null;
  }
}

/**
 * Get comprehensive pool information for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} [feeLevel] - Fee level for V3 (optional, will check all if not provided)
 * @returns {Promise<Object|null>} Pool information or error object
 */
async function getPoolInfo(network, tokenA, tokenB, feeLevel = undefined) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network, fee: feeLevel });
    console.warn('Pool parameter validation:', validation);
    if (!validation.isValid) {
      return createError(
        ERROR_CODES.INVALID_PARAMETERS,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS),
        { validationErrors: validation.errors }
      );
    }

    const pools = [];
    const errors = [];

    // Check V2 pool
    try {
      const v2PairAddress = await getV2PairAddress(network, tokenA, tokenB);
      if (v2PairAddress) {
        const v2Reserves = await getV2PoolReserves(network, v2PairAddress);
        if (v2Reserves) {
          // Validate reserve data
          if (!v2Reserves.reserve0 || !v2Reserves.reserve1 ||
            BigInt(v2Reserves.reserve0) <= 0n || BigInt(v2Reserves.reserve1) <= 0n) {
            errors.push({
              version: 'V2',
              poolAddress: v2PairAddress,
              error: 'Invalid or zero reserves'
            });
          } else {
            // Sort tokens to match reserves
            const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
              ? [tokenA, tokenB]
              : [tokenB, tokenA];

            pools.push({
              poolAddress: v2PairAddress,
              token0,
              token1,
              reserve0: v2Reserves.reserve0,
              reserve1: v2Reserves.reserve1,
              blockTimestampLast: v2Reserves.blockTimestampLast,
              version: 'V2',
              fee: 300, // V2 has fixed 0.3% fee
              feeTierName: 'FIXED',
              totalLiquidity: (BigInt(v2Reserves.reserve0) + BigInt(v2Reserves.reserve1)).toString()
            });
          }
        } else {
          errors.push({
            version: 'V2',
            poolAddress: v2PairAddress,
            error: 'Failed to fetch pool reserves'
          });
        }
      }
    } catch (v2Error) {
      console.error('Error checking V2 pool:', v2Error.message);
      errors.push({
        version: 'V2',
        error: v2Error.message
      });
    }

    // Check V3 pools
    const feeTiers = feeLevel ? [feeLevel] : [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];

    for (const fee of feeTiers) {
      try {
        const v3PoolAddress = await getV3PoolAddress(network, tokenA, tokenB, fee);
        if (v3PoolAddress) {
          const v3Data = await getV3PoolData(network, v3PoolAddress);
          if (v3Data) {
            // Validate V3 data
            if (!v3Data.sqrtPriceX96 || !v3Data.liquidity ||
              BigInt(v3Data.sqrtPriceX96) <= 0n || BigInt(v3Data.liquidity) <= 0n) {
              errors.push({
                version: 'V3',
                poolAddress: v3PoolAddress,
                fee,
                error: 'Invalid pool data (zero price or liquidity)'
              });
              continue;
            }

            // Sort tokens to match pool
            const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
              ? [tokenA, tokenB]
              : [tokenB, tokenA];

            pools.push({
              poolAddress: v3PoolAddress,
              token0,
              token1,
              sqrtPriceX96: v3Data.sqrtPriceX96,
              tick: v3Data.tick,
              liquidity: v3Data.liquidity,
              observationCardinality: v3Data.observationCardinality,
              feeProtocol: v3Data.feeProtocol,
              unlocked: v3Data.unlocked,
              version: 'V3',
              fee,
              feeTierName: getFeeTierName(fee),
              isActive: v3Data.unlocked && BigInt(v3Data.liquidity) > 0n
            });
          } else {
            errors.push({
              version: 'V3',
              poolAddress: v3PoolAddress,
              fee,
              error: 'Failed to fetch pool data'
            });
          }
        }
      } catch (v3Error) {
        console.error(`Error checking V3 pool (fee: ${fee}):`, v3Error.message);
        errors.push({
          version: 'V3',
          fee,
          error: v3Error.message
        });
      }
    }

    if (pools.length === 0) {
      return createError(
        ERROR_CODES.POOL_NOT_FOUND,
        getUserFriendlyErrorMessage(ERROR_CODES.POOL_NOT_FOUND),
        {
          tokenA,
          tokenB,
          network,
          checkedVersions: ['V2', 'V3'],
          checkedFeeTiers: feeTiers,
          errors
        }
      );
    }

    // Return the most liquid pool (V3) or the V2 pool if no V3 pools exist
    const v3Pools = pools.filter(p => p.version === 'V3' && p.isActive);
    let bestPool;

    if (v3Pools.length > 0) {
      // Return V3 pool with highest liquidity
      bestPool = v3Pools.reduce((max, pool) =>
        BigInt(pool.liquidity) > BigInt(max.liquidity) ? pool : max
      );
    } else {
      bestPool = pools[0]; // Return V2 pool or inactive V3 pool
    }

    // Add metadata about the selection
    bestPool.selectionReason = v3Pools.length > 0 ? 'Highest V3 liquidity' : 'V2 pool or only available pool';
    bestPool.alternativePools = pools.filter(p => p.poolAddress !== bestPool.poolAddress);
    bestPool.totalPoolsFound = pools.length;
    bestPool.errors = errors.length > 0 ? errors : undefined;

    return {
      success: true,
      ...bestPool,
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error getting pool info:', error.message);
    return createError(
      ERROR_CODES.NETWORK_ERROR,
      getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR),
      { originalError: error.message }
    );
  }
}

/**
 * Check if a pool exists for the given token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} [version] - Pool version ('V2' or 'V3', optional)
 * @param {number} [fee] - Fee tier for V3 pools (optional)
 * @returns {Promise<boolean>} True if pool exists
 */
async function poolExists(network, tokenA, tokenB, version = null, fee = null) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network });
    if (!validation.isValid) {
      return false;
    }

    if (!version || version === 'V2') {
      const v2PairAddress = await getV2PairAddress(network, tokenA, tokenB);
      if (v2PairAddress) {
        return true;
      }
    }

    if (!version || version === 'V3') {
      const feeTiers = fee ? [fee] : [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];

      for (const feeLevel of feeTiers) {
        const v3PoolAddress = await getV3PoolAddress(network, tokenA, tokenB, feeLevel);
        if (v3PoolAddress) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking pool existence:', error.message);
    return false;
  }
}

/**
 * Get all available pools for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {Promise<Array>} Array of pool information objects
 */
async function getAllPools(network, tokenA, tokenB) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network });
    console.warn('Get all pools parameter validation:', validation);
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Check cache first for frequently requested pairs
    const cacheKey = [network, tokenA.toLowerCase(), tokenB.toLowerCase()];
    const cachedPools = performanceCache.get('pools', cacheKey);
    if (cachedPools !== null) {
      return cachedPools;
    }

    const pools = [];
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Prepare batch RPC requests for optimal performance
    const batchRequests = [];

    // Add V2 pool address request
    const config = getNetworkConfig(network);
    if (config) {
      const v2Data = encodeFunctionCall(SELECTORS.GET_PAIR, [token0, token1]);
      batchRequests.push({
        method: 'eth_call',
        params: [{ to: config.v2Factory, data: v2Data }, 'latest'],
        type: 'v2_pair'
      });

      // Add V3 pool address requests for all fee tiers
      for (const [tierName, fee] of Object.entries(FEE_TIERS)) {
        const v3Data = encodeFunctionCall(SELECTORS.GET_POOL, [token0, token1, fee]);
        batchRequests.push({
          method: 'eth_call',
          params: [{ to: config.v3Factory, data: v3Data }, 'latest'],
          type: 'v3_pool',
          fee,
          tierName
        });
      }

      // Execute batch requests for pool addresses
      const addressResults = await sendMultipleRpcRequests(network, batchRequests, {
        useCache: true,
        useBatch: true
      });

      // Process V2 pool
      const v2Result = addressResults[0];
      if (v2Result && v2Result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const v2PairAddress = '0x' + v2Result.slice(-40);

        // Get V2 reserves
        const v2Reserves = await getV2PoolReserves(network, v2PairAddress);
        if (v2Reserves) {
          pools.push({
            poolAddress: v2PairAddress,
            token0,
            token1,
            reserve0: v2Reserves.reserve0,
            reserve1: v2Reserves.reserve1,
            blockTimestampLast: v2Reserves.blockTimestampLast,
            version: 'V2',
            fee: 300,
            feeTierName: 'FIXED'
          });
        }
      }

      // Process V3 pools
      const v3PoolRequests = [];
      const v3PoolInfo = [];

      for (let i = 1; i < addressResults.length; i++) {
        const result = addressResults[i];
        const request = batchRequests[i];

        if (result && result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          const v3PoolAddress = '0x' + result.slice(-40);

          // Prepare batch request for pool data
          v3PoolRequests.push({
            method: 'eth_call',
            params: [{ to: v3PoolAddress, data: encodeFunctionCall(SELECTORS.SLOT0) }, 'latest']
          });

          v3PoolInfo.push({
            poolAddress: v3PoolAddress,
            fee: request.fee,
            tierName: request.tierName
          });
        }
      }

      // Get V3 pool data in batch if any pools exist
      if (v3PoolRequests.length > 0) {
        const v3DataResults = await sendMultipleRpcRequests(network, v3PoolRequests, {
          useCache: true,
          useBatch: true
        });

        for (let i = 0; i < v3DataResults.length; i++) {
          const result = v3DataResults[i];
          const poolInfo = v3PoolInfo[i];

          if (result && result !== '0x') {
            try {
              // Decode slot0 data
              const sqrtPriceX96 = decodeHexToDecimal(result.slice(2, 66));
              const tick = parseInt(result.slice(66, 130), 16);

              // Get liquidity separately (could be optimized further with multicall)
              const liquidityResult = await sendCachedRpcRequest(network, 'eth_call', [
                { to: poolInfo.poolAddress, data: encodeFunctionCall(SELECTORS.LIQUIDITY) },
                'latest'
              ], { useCache: true });

              const liquidity = liquidityResult ? decodeHexToDecimal(liquidityResult) : '0';

              pools.push({
                poolAddress: poolInfo.poolAddress,
                token0,
                token1,
                sqrtPriceX96,
                tick,
                liquidity,
                version: 'V3',
                fee: poolInfo.fee,
                feeTierName: poolInfo.tierName
              });
            } catch (decodeError) {
              console.warn(`Failed to decode V3 pool data for ${poolInfo.poolAddress}:`, decodeError.message);
            }
          }
        }
      }
    }

    // Cache the results for future requests
    performanceCache.set('pools', cacheKey, pools);

    return pools;
  } catch (error) {
    console.error('Error getting all pools:', error.message);
    return [];
  }
}

module.exports = {
  getV2PairAddress,
  getV3PoolAddress,
  getV2PoolReserves,
  getV3PoolData,
  getPoolInfo,
  poolExists,
  getAllPools
};