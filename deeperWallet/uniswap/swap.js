const { isValidAddress, isValidAmount, isValidDeadline, getNetworkConfig, isNetworkSupported, getFeeTierName } = require('./utils');
const { FEE_TIERS, SELECTORS } = require('./constants');
const { validateSwapParams, isValidSlippage } = require('./validation');
const { createError, getUserFriendlyErrorMessage } = require('./errors');
const { encodeAddress, encodeUint256, encodeFunctionCall } = require('./encoding');
const { applySlippage, calculateV2SwapOutput, calculatePriceImpact } = require('./calculations');
const { performanceCache } = require('./cache');
const { sendRpcRequest } = require('./rpc');
const { getV2PoolReserves, getAllPools } = require('./pool');
const { analyzePriceImpact, validateLiquidity } = require('./calculations');
const { checkTokenApproval, getTokenAllowance } = require('./token');
const { getUniswapSpenderAddress, getApprovalCalldata } = require('./approval');
const { getSwapQuote } = require('./price');

/**
 * Generate Uniswap V2 swap transaction data
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} recipient - Recipient address
 * @param {number} deadline - Transaction deadline (Unix timestamp)
 * @returns {string} Encoded transaction data
 */
function encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline) {
  try {
    // Validate inputs
    if (!isValidAddress(tokenIn) || !isValidAddress(tokenOut) || !isValidAddress(recipient)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amountIn) || !isValidAmount(amountOutMin)) {
      throw new Error('Invalid amount');
    }

    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }

    // Create path array [tokenIn, tokenOut]
    const path = [tokenIn, tokenOut];

    // Encode swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    let data = SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS.startsWith('0x') ? SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS : '0x' + SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS;

    // Add amountIn (uint256)
    data += encodeUint256(amountIn);

    // Add amountOutMin (uint256)
    data += encodeUint256(amountOutMin);

    // Add path offset (uint256) - points to where path data starts
    data += encodeUint256(160); // 5 * 32 bytes = 160 bytes offset

    // Add recipient (address)
    data += encodeAddress(recipient);

    // Add deadline (uint256)
    data += encodeUint256(deadline);

    // Add path array length
    data += encodeUint256(path.length);

    // Add path addresses
    for (const address of path) {
      data += encodeAddress(address);
    }

    return data;
  } catch (error) {
    console.error('Error encoding V2 swap data:', error.message);
    throw error;
  }
}

/**
 * Generate Uniswap V3 swap transaction data
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {number} fee - Fee tier (500, 3000, 10000)
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} recipient - Recipient address
 * @param {number} deadline - Transaction deadline (Unix timestamp)
 * @param {string} sqrtPriceLimitX96 - Price limit (optional, use 0 for no limit)
 * @returns {string} Encoded transaction data
 */
function encodeV3SwapData(tokenIn, tokenOut, fee, amountIn, amountOutMin, recipient, deadline, sqrtPriceLimitX96 = '0') {
  try {
    // Validate inputs
    if (!isValidAddress(tokenIn) || !isValidAddress(tokenOut) || !isValidAddress(recipient)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amountIn) || !isValidAmount(amountOutMin)) {
      throw new Error('Invalid amount');
    }

    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }

    if (![FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH].includes(fee)) {
      throw new Error('Invalid fee tier');
    }

    // Encode exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    let data = SELECTORS.EXACT_INPUT_SINGLE.startsWith('0x') ? SELECTORS.EXACT_INPUT_SINGLE : '0x' + SELECTORS.EXACT_INPUT_SINGLE;

    // Add tokenIn (address)
    data += encodeAddress(tokenIn);

    // Add tokenOut (address)
    data += encodeAddress(tokenOut);

    // Add fee (uint24)
    data += encodeUint256(fee);

    // Add recipient (address)
    data += encodeAddress(recipient);

    // Add deadline (uint256)
    data += encodeUint256(deadline);

    // Add amountIn (uint256)
    data += encodeUint256(amountIn);

    // Add amountOutMinimum (uint256)
    data += encodeUint256(amountOutMin);

    // Add sqrtPriceLimitX96 (uint160)
    data += encodeUint256(sqrtPriceLimitX96);

    return data;
  } catch (error) {
    console.error('Error encoding V3 swap data:', error.message);
    throw error;
  }
}

/**
 * Get optimal swap route and version between V2 and V3
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {number} slippage - Slippage percentage (e.g., 0.5 for 0.5%)
 * @returns {Promise<Object|null>} Optimal route information or null if no route found
 */
async function selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage = 0.5) {
  try {
    // Get swap quote which already finds the optimal route
    const quote = await getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage);
    if (!quote) {
      return null;
    }

    // Get network configuration
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Determine router address based on optimal version
    const routerAddress = quote.version === 'V3' ? config.v3Router : config.v2Router;

    return {
      version: quote.version,
      routerAddress,
      poolAddress: quote.poolAddress,
      fee: quote.fee,
      amountOut: quote.amountOut,
      amountOutMin: quote.amountOutMin,
      priceImpact: quote.priceImpact,
      gasEstimate: null // Will be calculated during transaction preparation
    };
  } catch (error) {
    console.error('Error selecting optimal route:', error.message);
    return null;
  }
}

module.exports = {
  encodeV2SwapData,
  encodeV3SwapData,
  selectOptimalRoute
};