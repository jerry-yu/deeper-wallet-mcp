// Swap quote functionality
const { Token, CurrencyAmount, TradeType, Percent } = require('@uniswap/sdk-core');
const { DEFAULT_SWAP_OPTIONS } = require('./config');
const { isValidAddress, parseToken, stringToCurrencyAmount, slippageToPercent, calculateDeadline, formatTokenAmount } = require('./utils');

/**
 * Get swap quote using AlphaRouter
 * @param {AlphaRouter} router - Initialized AlphaRouter
 * @param {Object} params - Swap parameters
 * @param {Token} params.tokenIn - Input token
 * @param {Token} params.tokenOut - Output token
 * @param {string} params.amount - Input amount as string
 * @param {Object} params.options - Swap options (slippage, deadline, etc.)
 * @returns {Object|null} - Quote information or null if failed
 */
async function getSwapQuote(router, params) {
  try {
    const { tokenIn, tokenOut, amount, options = {} } = params;
    
    // Validate tokens
    if (!tokenIn || !tokenOut) {
      throw new Error('Both input and output tokens are required');
    }
    
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      throw new Error('Invalid amount');
    }
    
    // Merge options with defaults
    const swapOptions = {
      ...DEFAULT_SWAP_OPTIONS,
      ...options,
    };
    
    // Convert amount to CurrencyAmount
    const typedAmount = stringToCurrencyAmount(amount, tokenIn);
    
    // Get route from AlphaRouter without swapConfig
    const routeResult = await router.route(
      typedAmount,
      tokenOut,
      TradeType.EXACT_INPUT
    );
    
    // Check if we got a valid route
    if (!routeResult || !routeResult.route) {
      throw new Error('Failed to get route from AlphaRouter');
    }
    
    // Extract the route and quote
    const route = routeResult.route;
    const quote = routeResult.quote;
    const trade = routeResult.trade;
    
    // Get gas estimate
    const gasEstimate = routeResult.estimatedGasUsed.toString();
    const gasPriceWei = routeResult.gasPriceWei.toString();
    
    return {
      quote: quote.toFixed(),
      amountIn: amount,
      amountOut: quote.toExact(),
      gasEstimate,
      gasPriceWei,
      route,
      trade,
      priceImpact: trade?.priceImpact?.toFixed(2) || '0',
      slippageTolerance: swapOptions.slippageTolerance,
    };
  } catch (error) {
    console.error('Failed to get swap quote:', error.message);
    return null;
  }
}

/**
 * Get quote for token pair
 * @param {AlphaRouter} router - Initialized AlphaRouter
 * @param {Object} tokenInInfo - Input token information
 * @param {Object} tokenOutInfo - Output token information
 * @param {string} amountIn - Input amount as string
 * @param {Object} options - Swap options
 * @returns {Object|null} - Quote information or null if failed
 */
async function getQuoteForTokenPair(router, tokenInInfo, tokenOutInfo, amountIn, options) {
  try {
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
    
    // Get quote
    const quote = await getSwapQuote(router, {
      tokenIn,
      tokenOut,
      amount: amountIn,
      options,
    });
    
    return quote;
  } catch (error) {
    console.error('Failed to get quote for token pair:', error.message);
    return null;
  }
}

module.exports = {
  getSwapQuote,
  getQuoteForTokenPair,
};