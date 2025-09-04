// Main Uniswap integration module
const { initializeRouter, getRpcUrl, getChainId } = require('./router');
const { getSwapQuote, getQuoteForTokenPair } = require('./quotes');
const { getPoolInfo, getPoolList } = require('./pools');
const { swapTokens, approveToken } = require('./swaps');
const { parseToken } = require('./utils');
const { CHAIN_CONFIGS } = require('./config');

/**
 * Initialize Uniswap router for a specific network
 * @param {string} network - Network name (e.g., 'ETHEREUM', 'ETHEREUM-SEPOLIA')
 * @returns {Object|null} - Router instance and chain info or null if failed
 */
function initializeUniswap(network) {
  try {
    const chainId = getChainId(network);
    if (!chainId) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      throw new Error(`No RPC URL found for network: ${network}`);
    }
    
    const router = initializeRouter(rpcUrl, chainId);
    if (!router) {
      throw new Error('Failed to initialize router');
    }
    
    return {
      router,
      chainId,
      network,
    };
  } catch (error) {
    console.error('Failed to initialize Uniswap:', error.message);
    return null;
  }
}

/**
 * Get swap quote for token pair
 * @param {Object} uniswapInstance - Initialized Uniswap instance
 * @param {Object} tokenInInfo - Input token information
 * @param {Object} tokenOutInfo - Output token information
 * @param {string} amountIn - Input amount as string
 * @param {Object} options - Swap options
 * @returns {Object|null} - Quote information or null if failed
 */
async function getQuote(uniswapInstance, tokenInInfo, tokenOutInfo, amountIn, options = {}) {
  try {
    if (!uniswapInstance || !uniswapInstance.router) {
      throw new Error('Uniswap instance not initialized');
    }
    
    return await getQuoteForTokenPair(
      uniswapInstance.router,
      tokenInInfo,
      tokenOutInfo,
      amountIn,
      options
    );
  } catch (error) {
    console.error('Failed to get quote:', error.message);
    return null;
  }
}

/**
 * Get pool information for token pair
 * @param {Object} uniswapInstance - Initialized Uniswap instance
 * @param {Object} tokenAInfo - First token information
 * @param {Object} tokenBInfo - Second token information
 * @param {number} fee - Fee tier
 * @returns {Object|null} - Pool information or null if failed
 */
async function getPool(uniswapInstance, tokenAInfo, tokenBInfo, fee) {
  try {
    if (!uniswapInstance || !uniswapInstance.router) {
      throw new Error('Uniswap instance not initialized');
    }
    
    return await getPoolInfo(
      uniswapInstance.router,
      tokenAInfo,
      tokenBInfo,
      fee
    );
  } catch (error) {
    console.error('Failed to get pool info:', error.message);
    return null;
  }
}

/**
 * Get list of available pools for token pair
 * @param {Object} uniswapInstance - Initialized Uniswap instance
 * @param {Object} tokenAInfo - First token information
 * @param {Object} tokenBInfo - Second token information
 * @returns {Array|null} - List of pools or null if failed
 */
async function getPools(uniswapInstance, tokenAInfo, tokenBInfo) {
  try {
    if (!uniswapInstance || !uniswapInstance.router) {
      throw new Error('Uniswap instance not initialized');
    }
    
    return await getPoolList(
      uniswapInstance.router,
      tokenAInfo,
      tokenBInfo
    );
  } catch (error) {
    console.error('Failed to get pool list:', error.message);
    return null;
  }
}

/**
 * Execute token swap
 * @param {Object} params - Swap parameters
 * @param {string} params.password - Password for wallet
 * @param {string} params.fromAddress - Sender address
 * @param {Object} params.tokenInInfo - Input token information
 * @param {Object} params.tokenOutInfo - Output token information
 * @param {string} params.amountIn - Input amount as string
 * @param {Object} params.route - Route information from AlphaRouter
 * @param {Object} params.options - Swap options
 * @param {string} params.network - Network name
 * @returns {Object|null} - Transaction information or null if failed
 */
async function executeSwap(params) {
  try {
    const { password, fromAddress, tokenInInfo, tokenOutInfo, amountIn, route, options = {}, network } = params;
    
    // Parse tokens
    const tokenIn = parseToken(
      tokenInInfo.address,
      tokenInInfo.chainId,
      tokenInInfo.symbol,
      tokenInInfo.decimals,
      tokenInInfo.name
    );
    
    const tokenOut = parseToken(
      tokenOutInfo.address,
      tokenOutInfo.chainId,
      tokenOutInfo.symbol,
      tokenOutInfo.decimals,
      tokenOutInfo.name
    );
    
    // Execute swap
    return await swapTokens({
      password,
      fromAddress,
      tokenIn,
      tokenOut,
      amountIn,
      route,
      options,
      network,
    });
  } catch (error) {
    console.error('Failed to execute swap:', error.message);
    return null;
  }
}

/**
 * Approve token for swapping
 * @param {Object} params - Approval parameters
 * @param {string} params.password - Password for wallet
 * @param {string} params.fromAddress - Sender address
 * @param {Object} params.tokenInfo - Token information
 * @param {string} params.routerAddress - Router address
 * @param {string} params.amount - Amount to approve
 * @param {string} params.network - Network name
 * @returns {Object|null} - Approval transaction info or null if failed
 */
async function approveTokenForSwap(params) {
  try {
    const { password, fromAddress, tokenInfo, routerAddress, amount, network } = params;
    
    // Parse token
    const token = parseToken(
      tokenInfo.address,
      tokenInfo.chainId,
      tokenInfo.symbol,
      tokenInfo.decimals,
      tokenInfo.name
    );
    
    // Approve token
    return await approveToken({
      password,
      fromAddress,
      token,
      routerAddress,
      amount,
      network,
    });
  } catch (error) {
    console.error('Failed to approve token:', error.message);
    return null;
  }
}

module.exports = {
  initializeUniswap,
  getQuote,
  getPool,
  getPools,
  executeSwap,
  approveTokenForSwap,
};