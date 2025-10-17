const Decimal = require('decimal.js');

/**
 * Calculate output amount for Uniswap V2 swap using constant product formula
 * @param {string} reserveIn - Reserve of input token (in wei)
 * @param {string} reserveOut - Reserve of output token (in wei)
 * @param {string} amountIn - Input amount (in wei)
 * @param {number} fee - Fee in basis points (default 300 for 0.3%)
 * @returns {string} Output amount in wei
 */
function calculateV2SwapOutput(reserveIn, reserveOut, amountIn, fee = 300) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);

    // Validate inputs
    if (reserveInBig <= 0n || reserveOutBig <= 0n || amountInBig <= 0n) {
      throw new Error('Invalid reserves or amount');
    }

    // Calculate fee multiplier (10000 - fee) / 10000
    const feeMultiplier = BigInt(10000 - fee);
    const feeDenominator = BigInt(10000);

    // amountInWithFee = amountIn * (10000 - fee)
    const amountInWithFee = amountInBig * feeMultiplier;

    // numerator = amountInWithFee * reserveOut
    const numerator = amountInWithFee * reserveOutBig;

    // denominator = (reserveIn * 10000) + amountInWithFee
    const denominator = (reserveInBig * feeDenominator) + amountInWithFee;

    // amountOut = numerator / denominator
    const amountOut = numerator / denominator;

    return amountOut.toString();
  } catch (error) {
    console.error('Error calculating V2 swap output:', error.message);
    throw error;
  }
}

/**
 * Calculate input amount needed for desired output in Uniswap V2
 * @param {string} reserveIn - Reserve of input token (in wei)
 * @param {string} reserveOut - Reserve of output token (in wei)
 * @param {string} amountOut - Desired output amount (in wei)
 * @param {number} fee - Fee in basis points (default 300 for 0.3%)
 * @returns {string} Required input amount in wei
 */
function calculateV2SwapInput(reserveIn, reserveOut, amountOut, fee = 300) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountOutBig = BigInt(amountOut);

    // Validate inputs
    if (reserveInBig <= 0n || reserveOutBig <= 0n || amountOutBig <= 0n) {
      throw new Error('Invalid reserves or amount');
    }

    if (amountOutBig >= reserveOutBig) {
      throw new Error('Insufficient liquidity');
    }

    // Calculate fee multiplier
    const feeMultiplier = BigInt(10000 - fee);
    const feeDenominator = BigInt(10000);

    // numerator = reserveIn * amountOut * 10000
    const numerator = reserveInBig * amountOutBig * feeDenominator;

    // denominator = (reserveOut - amountOut) * (10000 - fee)
    const denominator = (reserveOutBig - amountOutBig) * feeMultiplier;

    // amountIn = (numerator / denominator) + 1 (add 1 for rounding)
    const amountIn = (numerator / denominator) + 1n;

    return amountIn.toString();
  } catch (error) {
    console.error('Error calculating V2 swap input:', error.message);
    throw error;
  }
}

/**
 * Calculate price impact for a swap
 * @param {string} reserveIn - Reserve of input token
 * @param {string} reserveOut - Reserve of output token
 * @param {string} amountIn - Input amount
 * @param {string} amountOut - Output amount
 * @returns {number} Price impact as percentage (0-100)
 */
function calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);
    const amountOutBig = BigInt(amountOut);

    // Calculate spot price before trade: reserveOut / reserveIn
    const spotPriceBefore = (reserveOutBig * BigInt(1e18)) / reserveInBig;

    // Calculate effective price: amountOut / amountIn
    const effectivePrice = (amountOutBig * BigInt(1e18)) / amountInBig;

    // Price impact = (spotPrice - effectivePrice) / spotPrice * 100
    const priceImpactBig = ((spotPriceBefore - effectivePrice) * BigInt(10000)) / spotPriceBefore;

    // Convert to percentage (divide by 100 since we multiplied by 10000)
    return Number(priceImpactBig) / 100;
  } catch (error) {
    console.error('Error calculating price impact:', error.message);
    return 0;
  }
}

/**
 * Apply slippage to an amount
 * @param {string} amount - Original amount
 * @param {number} slippagePercent - Slippage percentage (e.g., 0.5 for 0.5%)
 * @param {boolean} isMinimum - If true, calculate minimum amount (subtract slippage)
 * @returns {string} Amount with slippage applied
 */
function applySlippage(amount, slippagePercent, isMinimum = true) {
  try {
    const amountBig = BigInt(amount);
    const slippageBasisPoints = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points

    if (isMinimum) {
      // For minimum amount, subtract slippage
      const slippageAmount = (amountBig * slippageBasisPoints) / BigInt(10000);
      return (amountBig - slippageAmount).toString();
    } else {
      // For maximum amount, add slippage
      const slippageAmount = (amountBig * slippageBasisPoints) / BigInt(10000);
      return (amountBig + slippageAmount).toString();
    }
  } catch (error) {
    console.error('Error applying slippage:', error.message);
    throw error;
  }
}

/**
 * Calculate token price from V2 pool reserves
 * @param {string} reserve0 - Reserve of token0 (in wei)
 * @param {string} reserve1 - Reserve of token1 (in wei)
 * @param {number} decimals0 - Decimals of token0 (default 18)
 * @param {number} decimals1 - Decimals of token1 (default 18)
 * @returns {Object} Price information with token0/token1 and token1/token0 rates
 */
function calculateV2Price(reserve0, reserve1, decimals0 = 18, decimals1 = 18) {
  try {
    if (!reserve0 || !reserve1) {
      throw new Error("Both reserve0 and reserve1 are required");
    }

    const r0 = new Decimal(reserve0.toString());
    const r1 = new Decimal(reserve1.toString());

    if (r0.isZero() || r1.isZero()) {
      throw new Error("Reserves must be greater than zero");
    }

    const diff = decimals0 - decimals1;

    // price = reserve1 / reserve0 * 10^(dec0 - dec1)
    let price1Per0 = r1.div(r0);
    if (diff > 0) price1Per0 = price1Per0.mul(new Decimal(10).pow(diff));
    else if (diff < 0) price1Per0 = price1Per0.div(new Decimal(10).pow(-diff));

    const price0Per1 = new Decimal(1).div(price1Per0);

    return {
      price0in1: price0Per1.toFixed(5),
      price1in0: price1Per0.toFixed(5),
      reserve0: reserve0,
      reserve1: reserve1,
      decimals0,
      decimals1
    };
  } catch (error) {
    console.error('Error calculating V2 price:', error.message);
    throw error;
  }
}

/**
 * Calculate token price from V3 pool sqrtPriceX96
 * @param {string} sqrtPriceX96 - Square root price in X96 format (as string, to support BigInt)
 * @param {number} decimals0 - Decimals of token0 (default 18)
 * @param {number} decimals1 - Decimals of token1 (default 18)
 * @returns {Object} Price information with token0/token1 and token1/token0 rates
 */
function calculateV3Price(sqrtPriceX96, decimals0 = 18, decimals1 = 18) {
  try {

    if (sqrtPriceX96 === undefined || sqrtPriceX96 === null) {
      throw new Error('sqrtPriceX96 is required');
    }
    const dec0 = Number(decimals0);
    const dec1 = Number(decimals1);
    if (!Number.isInteger(dec0) || !Number.isInteger(dec1)) {
      throw new Error('decimals0/decimals1 must be integers');
    }

    let sqrtStr;
    if (typeof sqrtPriceX96 === 'bigint') {
      sqrtStr = sqrtPriceX96.toString();
    } else if (typeof sqrtPriceX96 === 'string') {
      sqrtStr = sqrtPriceX96.startsWith('0x')
        ? BigInt(sqrtPriceX96).toString()
        : sqrtPriceX96;
    } else if (typeof sqrtPriceX96 === 'number') {
      if (!Number.isFinite(sqrtPriceX96)) throw new Error('Invalid sqrtPriceX96 number');
      sqrtStr = BigInt(Math.trunc(sqrtPriceX96)).toString();
    } else {
      throw new Error('sqrtPriceX96 must be string | bigint | number');
    }

    // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
    const sqrt = new Decimal(sqrtStr);
    const q96 = new Decimal(2).pow(96);
    const base = sqrt.div(q96);     // = sqrt(priceRaw)
    let price = base.mul(base);     // 未做小数位调整的 priceRaw

    const diff = dec0 - dec1;
    let adjustedBy = 'none';
    if (diff > 0) {
      price = price.mul(new Decimal(10).pow(diff));
      adjustedBy = `* 10^${diff}`;
    } else if (diff < 0) {
      price = price.div(new Decimal(10).pow(-diff));
      adjustedBy = `/ 10^${-diff}`;
    }

    const price1Per0 = price;                          // token1 per token0
    const price0Per1 = new Decimal(1).div(price1Per0); // token0 per token1

    return {
      token1PerToken0: price1Per0.toFixed(),
      token0PerToken1: price0Per1.toFixed(),
      sqrtPriceX96: sqrtPriceX96,
      decimals0,
      decimals1
    };
  } catch (error) {
    console.error('Error calculating V3 price:', error.message);
    throw error;
  }
}

/**
 * Check if an amount would cause high price impact
 * @param {number} priceImpact - Price impact percentage
 * @returns {Object} Price impact analysis
 */
function analyzePriceImpact(priceImpact) {
  const impact = {
    percentage: priceImpact,
    level: 'LOW',
    warning: null,
    shouldWarn: false,
    shouldBlock: false
  };

  if (priceImpact > 20) {
    impact.level = 'CRITICAL';
    impact.warning = 'CRITICAL: Extremely high price impact (>20%). This trade will significantly affect the token price.';
    impact.shouldBlock = true;
  } else if (priceImpact > 15) {
    impact.level = 'VERY_HIGH';
    impact.warning = 'WARNING: Very high price impact (>15%). Consider reducing trade size significantly.';
    impact.shouldWarn = true;
  } else if (priceImpact > 5) {
    impact.level = 'HIGH';
    impact.warning = 'CAUTION: High price impact (>5%). Trade will noticeably affect price.';
    impact.shouldWarn = true;
  } else if (priceImpact > 1) {
    impact.level = 'MODERATE';
    impact.warning = 'INFO: Moderate price impact (>1%). Price will be slightly affected.';
    impact.shouldWarn = false;
  }

  return impact;
}

/**
 * Validate liquidity sufficiency for a trade
 * @param {string} reserveIn - Input token reserve
 * @param {string} reserveOut - Output token reserve
 * @param {string} amountIn - Input amount
 * @returns {Object} Liquidity analysis
 */
function validateLiquidity(reserveIn, reserveOut, amountIn) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);

    const analysis = {
      sufficient: true,
      utilizationPercentage: 0,
      warning: null,
      maxTradeSize: null
    };

    // Calculate utilization percentage
    analysis.utilizationPercentage = Number((amountInBig * BigInt(100)) / reserveInBig);

    // Check if trade size is too large relative to pool
    if (analysis.utilizationPercentage > 50) {
      analysis.sufficient = false;
      analysis.warning = 'Trade size exceeds 50% of pool reserves. This will cause extreme price impact.';
    } else if (analysis.utilizationPercentage > 25) {
      analysis.warning = 'Large trade relative to pool size (>25% of reserves). Expect high price impact.';
    } else if (analysis.utilizationPercentage > 10) {
      analysis.warning = 'Moderate trade size relative to pool (>10% of reserves). Some price impact expected.';
    }

    // Calculate maximum recommended trade size (10% of reserves)
    analysis.maxTradeSize = (reserveInBig / BigInt(10)).toString();

    return analysis;
  } catch (error) {
    return {
      sufficient: false,
      utilizationPercentage: 0,
      warning: 'Unable to analyze liquidity',
      maxTradeSize: null,
      error: error.message
    };
  }
}

module.exports = {
  calculateV2SwapOutput,
  calculateV2SwapInput,
  calculatePriceImpact,
  applySlippage,
  calculateV2Price,
  calculateV3Price,
  analyzePriceImpact,
  validateLiquidity
};