// Pool information retrieval
const { Token } = require('@uniswap/sdk-core');
const { FeeAmount } = require('@uniswap/v3-sdk');
const { V3PoolProvider, UniswapMulticallProvider } = require('@uniswap/smart-order-router');
const { isValidAddress, parseToken } = require('./utils');

/**
 * Get pool information for a token pair
 * @param {AlphaRouter} router - Initialized AlphaRouter
 * @param {Object} tokenAInfo - First token information
 * @param {Object} tokenBInfo - Second token information
 * @param {number} fee - Fee tier (100, 500, 3000, 10000)
 * @returns {Object|null} - Pool information or null if failed
 */
async function getPoolInfo(router, tokenAInfo, tokenBInfo, fee) {
  try {
    // Validate fee
    if (![FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH].includes(fee)) {
      throw new Error(`Invalid fee tier: ${fee}`);
    }
    
    // Parse tokens
    const tokenA = parseToken(
      tokenAInfo.address,
      tokenAInfo.chainId,
      tokenAInfo.symbol,
      tokenAInfo.decimals,
      tokenAInfo.name
    );
    
    const tokenB = parseToken(
      tokenBInfo.address,
      tokenBInfo.chainId,
      tokenBInfo.symbol,
      tokenBInfo.decimals,
      tokenBInfo.name
    );
    
    // Create multicall provider and pool provider
    const multicallProvider = new UniswapMulticallProvider(tokenA.chainId, router.provider);
    const poolProvider = new V3PoolProvider(tokenA.chainId, multicallProvider);
    
    // Get pool data
    const poolAccessor = await poolProvider.getPools([[tokenA, tokenB, fee]]);
    const pool = poolAccessor.getPool(tokenA, tokenB, fee);
    
    if (!pool) {
      return null;
    }
    
    // Format response
    return {
      token0: {
        address: pool.token0.address,
        symbol: pool.token0.symbol,
        decimals: pool.token0.decimals,
      },
      token1: {
        address: pool.token1.address,
        symbol: pool.token1.symbol,
        decimals: pool.token1.decimals,
      },
      fee: pool.fee,
      sqrtRatioX96: pool.sqrtRatioX96.toString(),
      liquidity: pool.liquidity.toString(),
      tickCurrent: pool.tickCurrent,
      token0Price: pool.token0Price.toSignificant(6),
      token1Price: pool.token1Price.toSignificant(6),
    };
  } catch (error) {
    console.error('Failed to get pool info:', error.message);
    return null;
  }
}

/**
 * Get list of available pools for a token pair
 * @param {AlphaRouter} router - Initialized AlphaRouter
 * @param {Object} tokenAInfo - First token information
 * @param {Object} tokenBInfo - Second token information
 * @returns {Array|null} - List of pools or null if failed
 */
async function getPoolList(router, tokenAInfo, tokenBInfo) {
  try {
    // Parse tokens
    const tokenA = parseToken(
      tokenAInfo.address,
      tokenAInfo.chainId,
      tokenAInfo.symbol,
      tokenAInfo.decimals,
      tokenAInfo.name
    );
    
    const tokenB = parseToken(
      tokenBInfo.address,
      tokenBInfo.chainId,
      tokenBInfo.symbol,
      tokenBInfo.decimals,
      tokenBInfo.name
    );
    
    // Create multicall provider and pool provider
    const multicallProvider = new UniswapMulticallProvider(tokenA.chainId, router.provider);
    const poolProvider = new V3PoolProvider(tokenA.chainId, multicallProvider);
    
    // Try all fee tiers
    const fees = [FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    const poolPairs = fees.map(fee => [tokenA, tokenB, fee]);
    
    // Get pool data
    const poolAccessor = await poolProvider.getPools(poolPairs);
    
    const pools = [];
    for (const fee of fees) {
      const pool = poolAccessor.getPool(tokenA, tokenB, fee);
      if (pool) {
        pools.push({
          token0: {
            address: pool.token0.address,
            symbol: pool.token0.symbol,
            decimals: pool.token0.decimals,
          },
          token1: {
            address: pool.token1.address,
            symbol: pool.token1.symbol,
            decimals: pool.token1.decimals,
          },
          fee: pool.fee,
          sqrtRatioX96: pool.sqrtRatioX96.toString(),
          liquidity: pool.liquidity.toString(),
          tickCurrent: pool.tickCurrent,
          token0Price: pool.token0Price.toSignificant(6),
          token1Price: pool.token1Price.toSignificant(6),
          feeTier: fee,
        });
      }
    }
    
    return pools;
  } catch (error) {
    console.error('Failed to get pool list:', error.message);
    return null;
  }
}

module.exports = {
  getPoolInfo,
  getPoolList,
};