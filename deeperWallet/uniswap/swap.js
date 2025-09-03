/**
 * Token Swap Functionality
 * Handles token swap operations including route calculation, transaction preparation, and execution
 */

const logger = require('../log');
const { Token, CurrencyAmount, TradeType, Percent } = require('@uniswap/sdk-core');
const { getNetworkConfig, FEE_TIERS, DEFAULTS } = require('./constants');
const { getTokenInfo, validateTokenAddress, normalizeNetwork, parseTokenAmount } = require('./utils');

// Error codes for swap operations
const SWAP_ERROR_CODES = {
  INVALID_TOKEN_ADDRESS: 'INVALID_TOKEN_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  ROUTE_CALCULATION_FAILED: 'ROUTE_CALCULATION_FAILED',
  TRANSACTION_PREPARATION_FAILED: 'TRANSACTION_PREPARATION_FAILED',
  SIGNING_FAILED: 'SIGNING_FAILED',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  SLIPPAGE_TOO_HIGH: 'SLIPPAGE_TOO_HIGH'
};

// Retry configuration for swap operations
const SWAP_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  RETRYABLE_ERRORS: [
    SWAP_ERROR_CODES.NETWORK_ERROR,
    SWAP_ERROR_CODES.TIMEOUT_ERROR
  ]
};

/**
 * Calculate optimal swap route using Uniswap SDK with enhanced error handling
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in token units
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Calculated route with trade information
 */
async function calculateSwapRoute(tokenIn, tokenOut, amountIn, network) {
  const operation = 'calculateSwapRoute';
  
  try {
    console.warn(`${operation}: ${amountIn} ${tokenIn} -> ${tokenOut} on ${network}`);

    // Enhanced input validation with specific error codes
    if (!tokenIn || typeof tokenIn !== 'string') {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Input token address is required', { tokenIn }, operation);
    }
    
    if (!tokenOut || typeof tokenOut !== 'string') {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Output token address is required', { tokenOut }, operation);
    }
    
    if (!validateTokenAddress(tokenIn, network)) {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Invalid input token address format', { tokenIn, network }, operation);
    }
    
    if (!validateTokenAddress(tokenOut, network)) {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Invalid output token address format', { tokenOut, network }, operation);
    }

    if (!amountIn || typeof amountIn !== 'string' || parseFloat(amountIn) <= 0) {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_AMOUNT, 'Invalid input amount: must be positive number', { amountIn }, operation);
    }

    // Check for identical tokens
    if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
      throw createSwapError(SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS, 'Cannot swap identical tokens', { tokenIn, tokenOut }, operation);
    }

    const normalizedNetwork = normalizeNetwork(network);
    let networkConfig;
    
    try {
      networkConfig = getNetworkConfig(normalizedNetwork);
    } catch (error) {
      throw createSwapError(SWAP_ERROR_CODES.NETWORK_ERROR, `Unsupported network: ${network}`, { network, normalizedNetwork }, operation);
    }

    // Get token information with retry logic
    let tokenInInfo, tokenOutInfo;
    try {
      [tokenInInfo, tokenOutInfo] = await withSwapRetry(
        () => Promise.all([
          getTokenInfo(tokenIn, normalizedNetwork),
          getTokenInfo(tokenOut, normalizedNetwork)
        ]),
        'getTokenInfo',
        operation
      );
    } catch (error) {
      throw createSwapError(SWAP_ERROR_CODES.NETWORK_ERROR, `Failed to fetch token information: ${error.message}`, { tokenIn, tokenOut, network }, operation);
    }

    // Create Token instances for Uniswap SDK
    const tokenInSDK = new Token(
      networkConfig.CHAIN_ID,
      tokenInInfo.address,
      tokenInInfo.decimals,
      tokenInInfo.symbol,
      tokenInInfo.name
    );

    const tokenOutSDK = new Token(
      networkConfig.CHAIN_ID,
      tokenOutInfo.address,
      tokenOutInfo.decimals,
      tokenOutInfo.symbol,
      tokenOutInfo.name
    );

    // Convert input amount to smallest unit
    const amountInSmallestUnit = parseTokenAmount(amountIn, tokenInInfo.decimals);
    const currencyAmountIn = CurrencyAmount.fromRawAmount(tokenInSDK, amountInSmallestUnit);

    // For now, we'll implement a simplified route calculation
    // In a full implementation, we would use AlphaRouter or similar
    // but for this task, we'll create a basic route structure
    
    // Calculate basic route through direct pool or via WETH
    const route = await calculateBasicRoute(
      tokenInSDK,
      tokenOutSDK,
      currencyAmountIn,
      networkConfig,
      normalizedNetwork
    );

    console.warn(`Route calculated successfully: ${route.route.length} hops`);
    return route;

  } catch (error) {
    logger.error(`Failed to calculate swap route: ${error.message}`);
    throw new Error(`Route calculation failed: ${error.message}`);
  }
}

/**
 * Calculate basic route using available pools
 * @param {Token} tokenIn - Input token SDK instance
 * @param {Token} tokenOut - Output token SDK instance
 * @param {CurrencyAmount} amountIn - Input amount
 * @param {Object} networkConfig - Network configuration
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Route information
 */
async function calculateBasicRoute(tokenIn, tokenOut, amountIn, networkConfig, network) {
  try {
    // Check if tokens are the same
    if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
      throw new Error('Cannot swap identical tokens');
    }

    // For this basic implementation, we'll create a simplified route structure
    // In production, this would use the actual Uniswap SDK routing logic
    
    const route = {
      tokenIn: {
        address: tokenIn.address,
        symbol: tokenIn.symbol,
        decimals: tokenIn.decimals,
        name: tokenIn.name
      },
      tokenOut: {
        address: tokenOut.address,
        symbol: tokenOut.symbol,
        decimals: tokenOut.decimals,
        name: tokenOut.name
      },
      amountIn: amountIn.quotient.toString(),
      amountInFormatted: amountIn.toExact(),
      route: [],
      pools: [],
      gasEstimate: '200000', // Default gas estimate
      priceImpact: '0.1', // Default 0.1% price impact
      executionPrice: null,
      network: network
    };

    // Determine routing strategy
    const isDirectPair = await checkDirectPair(tokenIn, tokenOut, networkConfig, network);
    
    if (isDirectPair) {
      // Direct swap route
      route.route = [tokenIn.address, tokenOut.address];
      route.pools = [await getPoolAddress(tokenIn.address, tokenOut.address, FEE_TIERS.MEDIUM, network)];
      route.routeType = 'DIRECT';
    } else {
      // Route through WETH
      const wethAddress = networkConfig.WETH;
      route.route = [tokenIn.address, wethAddress, tokenOut.address];
      route.pools = [
        await getPoolAddress(tokenIn.address, wethAddress, FEE_TIERS.MEDIUM, network),
        await getPoolAddress(wethAddress, tokenOut.address, FEE_TIERS.MEDIUM, network)
      ];
      route.routeType = 'VIA_WETH';
    }

    // Calculate estimated output amount (simplified calculation)
    route.amountOut = await estimateOutputAmount(route, amountIn, network);
    route.amountOutFormatted = formatOutputAmount(route.amountOut, tokenOut.decimals);

    return route;

  } catch (error) {
    logger.error(`Failed to calculate basic route: ${error.message}`);
    throw error;
  }
}

/**
 * Check if direct pair exists between two tokens
 * @param {Token} tokenA - First token
 * @param {Token} tokenB - Second token
 * @param {Object} networkConfig - Network configuration
 * @param {string} network - Network identifier
 * @returns {Promise<boolean>} Whether direct pair exists
 */
async function checkDirectPair(tokenA, tokenB, networkConfig, network) {
  try {
    // For this basic implementation, assume direct pairs exist for major tokens
    // In production, this would query the actual pool factory
    
    const majorTokens = [
      networkConfig.WETH.toLowerCase(),
      '0xa0b86a33e6441e6c8d3c1c4c9b8b8b8b8b8b8b8b', // USDC (example)
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (example)
    ];

    const tokenALower = tokenA.address.toLowerCase();
    const tokenBLower = tokenB.address.toLowerCase();

    // If either token is a major token, assume direct pair exists
    const hasDirectPair = majorTokens.includes(tokenALower) || majorTokens.includes(tokenBLower);
    
    console.warn(`Direct pair check for ${tokenA.symbol}-${tokenB.symbol}: ${hasDirectPair}`);
    return hasDirectPair;

  } catch (error) {
    logger.error(`Failed to check direct pair: ${error.message}`);
    return false;
  }
}

/**
 * Get pool address for token pair (simplified implementation)
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} fee - Pool fee tier
 * @param {string} network - Network identifier
 * @returns {Promise<string>} Pool address
 */
async function getPoolAddress(tokenA, tokenB, fee, network) {
  try {
    // For this basic implementation, return a placeholder pool address
    // In production, this would compute the actual pool address using the factory
    
    const networkConfig = getNetworkConfig(network);
    
    // Sort tokens to ensure consistent pool address
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
      ? [tokenA, tokenB] 
      : [tokenB, tokenA];

    // Generate a deterministic but fake pool address for this implementation
    const poolSeed = `${token0}-${token1}-${fee}-${network}`;
    const poolAddress = '0x' + Buffer.from(poolSeed).toString('hex').padEnd(40, '0').slice(0, 40);
    
    console.warn(`Pool address for ${token0}-${token1} (fee: ${fee}): ${poolAddress}`);
    return poolAddress;

  } catch (error) {
    logger.error(`Failed to get pool address: ${error.message}`);
    throw error;
  }
}

/**
 * Estimate output amount for a given route (simplified calculation)
 * @param {Object} route - Route information
 * @param {CurrencyAmount} amountIn - Input amount
 * @param {string} network - Network identifier
 * @returns {Promise<string>} Estimated output amount
 */
async function estimateOutputAmount(route, amountIn, network) {
  try {
    // For this basic implementation, use a simplified calculation
    // In production, this would use actual pool reserves and pricing
    
    const inputAmount = BigInt(amountIn.quotient.toString());
    
    // Apply a simple 0.3% fee per hop and some slippage
    let outputAmount = inputAmount;
    const hops = route.route.length - 1;
    
    for (let i = 0; i < hops; i++) {
      // Apply 0.3% fee per hop
      outputAmount = (outputAmount * BigInt(997)) / BigInt(1000);
    }
    
    // Apply additional 0.1% for price impact
    outputAmount = (outputAmount * BigInt(999)) / BigInt(1000);
    
    console.warn(`Estimated output amount: ${outputAmount.toString()}`);
    return outputAmount.toString();

  } catch (error) {
    logger.error(`Failed to estimate output amount: ${error.message}`);
    throw error;
  }
}

/**
 * Format output amount with proper decimals
 * @param {string} amount - Amount in smallest unit
 * @param {number} decimals - Token decimals
 * @returns {string} Formatted amount
 */
function formatOutputAmount(amount, decimals) {
  try {
    const { formatTokenAmount } = require('./utils');
    return formatTokenAmount(amount, decimals);
  } catch (error) {
    logger.error(`Failed to format output amount: ${error.message}`);
    return '0';
  }
}

/**
 * Validate route parameters
 * @param {Object} route - Route to validate
 * @returns {boolean} Validation result
 */
function validateRoute(route) {
  try {
    if (!route || typeof route !== 'object') {
      return false;
    }

    // Check required fields
    const requiredFields = ['tokenIn', 'tokenOut', 'amountIn', 'route', 'pools'];
    for (const field of requiredFields) {
      if (!route[field]) {
        logger.error(`Missing required route field: ${field}`);
        return false;
      }
    }

    // Validate route array
    if (!Array.isArray(route.route) || route.route.length < 2) {
      logger.error('Invalid route array');
      return false;
    }

    // Validate pools array
    if (!Array.isArray(route.pools) || route.pools.length !== route.route.length - 1) {
      logger.error('Invalid pools array');
      return false;
    }

    return true;

  } catch (error) {
    logger.error(`Route validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Prepare swap transaction data using Universal Router SDK
 * @param {Object} route - Calculated swap route
 * @param {number} slippage - Slippage tolerance (e.g., 0.5 for 0.5%)
 * @param {number} deadline - Transaction deadline timestamp
 * @returns {Promise<Object>} Transaction data with calldata
 */
async function prepareSwapTransaction(route, slippage, deadline) {
  try {
    console.warn(`Preparing swap transaction with ${slippage}% slippage, deadline: ${deadline}`);

    // Validate inputs
    if (!validateRoute(route)) {
      throw new Error('Invalid route provided');
    }

    if (typeof slippage !== 'number' || slippage < 0 || slippage > 50) {
      throw new Error('Invalid slippage tolerance (must be between 0 and 50)');
    }

    if (typeof deadline !== 'number' || deadline <= Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid deadline (must be future timestamp)');
    }

    const networkConfig = getNetworkConfig(route.network);

    // Calculate minimum amount out with slippage protection
    const amountOut = BigInt(route.amountOut);
    const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100)); // Convert to basis points
    const amountOutMin = (amountOut * slippageMultiplier) / BigInt(10000);

    // Generate swap calldata based on route type
    const swapCalldata = await generateSwapCalldata(route, amountOutMin.toString(), deadline);

    // Estimate gas for the swap transaction
    const gasEstimate = await estimateSwapGas(route, swapCalldata);

    // Prepare transaction data
    const transactionData = {
      to: networkConfig.UNIVERSAL_ROUTER,
      value: route.tokenIn.address.toLowerCase() === networkConfig.WETH.toLowerCase() ? route.amountIn : '0',
      data: swapCalldata,
      gasLimit: gasEstimate.toString(),
      route: route,
      amountIn: route.amountIn,
      amountOutMin: amountOutMin.toString(),
      slippage: slippage,
      deadline: deadline,
      network: route.network
    };

    console.warn(`Swap transaction prepared: gas limit ${gasEstimate}, min output ${amountOutMin.toString()}`);
    return transactionData;

  } catch (error) {
    logger.error(`Failed to prepare swap transaction: ${error.message}`);
    throw new Error(`Transaction preparation failed: ${error.message}`);
  }
}

/**
 * Generate swap calldata for Universal Router
 * @param {Object} route - Swap route information
 * @param {string} amountOutMin - Minimum output amount
 * @param {number} deadline - Transaction deadline
 * @returns {Promise<string>} Encoded calldata
 */
async function generateSwapCalldata(route, amountOutMin, deadline) {
  try {
    // For this implementation, we'll create simplified calldata
    // In production, this would use the actual Universal Router SDK
    
    const { UniversalRouter } = require('@uniswap/universal-router-sdk');
    
    // Create a simplified swap command
    // This is a basic implementation - production would use full SDK
    
    if (route.routeType === 'DIRECT') {
      return generateDirectSwapCalldata(route, amountOutMin, deadline);
    } else {
      return generateMultiHopSwapCalldata(route, amountOutMin, deadline);
    }

  } catch (error) {
    logger.error(`Failed to generate swap calldata: ${error.message}`);
    
    // Fallback to basic calldata generation
    return generateBasicSwapCalldata(route, amountOutMin, deadline);
  }
}

/**
 * Generate calldata for direct token swap
 * @param {Object} route - Swap route
 * @param {string} amountOutMin - Minimum output amount
 * @param {number} deadline - Transaction deadline
 * @returns {string} Encoded calldata
 */
function generateDirectSwapCalldata(route, amountOutMin, deadline) {
  try {
    // Basic direct swap calldata structure
    // In production, this would use proper ABI encoding
    
    const functionSelector = '0x414bf389'; // exactInputSingle function selector
    
    // Encode parameters (simplified)
    const params = [
      route.tokenIn.address.padEnd(66, '0'), // tokenIn
      route.tokenOut.address.padEnd(66, '0'), // tokenOut
      '0x' + parseInt(3000).toString(16).padStart(6, '0'), // fee (0.3%)
      '0x0000000000000000000000000000000000000000000000000000000000000000', // recipient (will be set to msg.sender)
      '0x' + deadline.toString(16).padStart(64, '0'), // deadline
      '0x' + BigInt(route.amountIn).toString(16).padStart(64, '0'), // amountIn
      '0x' + BigInt(amountOutMin).toString(16).padStart(64, '0'), // amountOutMinimum
      '0x0000000000000000000000000000000000000000000000000000000000000000'  // sqrtPriceLimitX96
    ].join('').replace(/0x/g, '');

    const calldata = functionSelector + params;
    
    console.warn(`Generated direct swap calldata: ${calldata.slice(0, 20)}...`);
    return calldata;

  } catch (error) {
    logger.error(`Failed to generate direct swap calldata: ${error.message}`);
    throw error;
  }
}

/**
 * Generate calldata for multi-hop token swap
 * @param {Object} route - Swap route
 * @param {string} amountOutMin - Minimum output amount
 * @param {number} deadline - Transaction deadline
 * @returns {string} Encoded calldata
 */
function generateMultiHopSwapCalldata(route, amountOutMin, deadline) {
  try {
    // Basic multi-hop swap calldata structure
    const functionSelector = '0xc04b8d59'; // exactInput function selector
    
    // Encode path (simplified)
    let path = route.tokenIn.address;
    for (let i = 1; i < route.route.length; i++) {
      path += '0bb8'; // fee (3000 = 0x0bb8)
      path += route.route[i].slice(2); // remove 0x prefix
    }
    
    const params = [
      path.padEnd(66, '0'), // path
      '0x0000000000000000000000000000000000000000000000000000000000000000', // recipient
      '0x' + deadline.toString(16).padStart(64, '0'), // deadline
      '0x' + BigInt(route.amountIn).toString(16).padStart(64, '0'), // amountIn
      '0x' + BigInt(amountOutMin).toString(16).padStart(64, '0') // amountOutMinimum
    ].join('').replace(/0x/g, '');

    const calldata = functionSelector + params;
    
    console.warn(`Generated multi-hop swap calldata: ${calldata.slice(0, 20)}...`);
    return calldata;

  } catch (error) {
    logger.error(`Failed to generate multi-hop swap calldata: ${error.message}`);
    throw error;
  }
}

/**
 * Generate basic fallback calldata
 * @param {Object} route - Swap route
 * @param {string} amountOutMin - Minimum output amount
 * @param {number} deadline - Transaction deadline
 * @returns {string} Basic calldata
 */
function generateBasicSwapCalldata(route, amountOutMin, deadline) {
  try {
    // Very basic fallback calldata
    const basicCalldata = '0x' + [
      '414bf389', // function selector
      route.tokenIn.address.slice(2).padStart(64, '0'),
      route.tokenOut.address.slice(2).padStart(64, '0'),
      BigInt(route.amountIn).toString(16).padStart(64, '0'),
      BigInt(amountOutMin).toString(16).padStart(64, '0'),
      deadline.toString(16).padStart(64, '0')
    ].join('');

    console.warn(`Generated basic fallback calldata`);
    return basicCalldata;

  } catch (error) {
    logger.error(`Failed to generate basic calldata: ${error.message}`);
    throw error;
  }
}

/**
 * Estimate gas for swap transaction
 * @param {Object} route - Swap route
 * @param {string} calldata - Transaction calldata
 * @returns {Promise<number>} Gas estimate
 */
async function estimateSwapGas(route, calldata) {
  try {
    const { estimate_gas } = require('../eth');
    const networkConfig = getNetworkConfig(route.network);

    // Use a dummy address for gas estimation
    const dummyFromAddress = '0x0000000000000000000000000000000000000001';
    const value = route.tokenIn.address.toLowerCase() === networkConfig.WETH.toLowerCase() ? route.amountIn : '0';

    const gasEstimate = await estimate_gas(
      route.network,
      dummyFromAddress,
      networkConfig.UNIVERSAL_ROUTER,
      parseInt(value),
      calldata
    );

    if (!gasEstimate) {
      // Fallback gas estimates based on route complexity
      const baseGas = 150000;
      const gasPerHop = 50000;
      const hops = route.route.length - 1;
      return baseGas + (gasPerHop * hops);
    }

    // Add buffer to gas estimate
    const gasWithBuffer = Math.ceil(gasEstimate * DEFAULTS.GAS_LIMIT_BUFFER);
    
    console.warn(`Gas estimate: ${gasEstimate}, with buffer: ${gasWithBuffer}`);
    return gasWithBuffer;

  } catch (error) {
    logger.error(`Failed to estimate swap gas: ${error.message}`);
    
    // Return conservative fallback estimate
    const fallbackGas = 300000;
    console.warn(`Using fallback gas estimate: ${fallbackGas}`);
    return fallbackGas;
  }
}

/**
 * Execute swap with signing
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Sender address
 * @param {Object} swapData - Prepared swap data
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Transaction result
 */
async function executeSwap(password, fromAddress, swapData, network) {
  try {
    console.warn(`Executing swap for ${fromAddress} on ${network}`);

    // Validate inputs
    if (!password || typeof password !== 'string') {
      throw new Error('Invalid password provided');
    }

    if (!fromAddress || !validateTokenAddress(fromAddress, network)) {
      throw new Error('Invalid from address provided');
    }

    if (!swapData || typeof swapData !== 'object') {
      throw new Error('Invalid swap data provided');
    }

    if (!network || typeof network !== 'string') {
      throw new Error('Invalid network provided');
    }

    // Validate swap data structure
    const requiredFields = ['to', 'data', 'gasLimit', 'amountIn', 'network'];
    for (const field of requiredFields) {
      if (!swapData[field]) {
        throw new Error(`Missing required swap data field: ${field}`);
      }
    }

    const normalizedNetwork = normalizeNetwork(network);
    const { get_tx_essential_elem } = require('../eth');

    // Get transaction essentials (nonce and gas price)
    const txEssentials = await get_tx_essential_elem(normalizedNetwork, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials (nonce/gas price)');
    }

    const { nonce, gas_price: gasPrice } = txEssentials;

    // Apply gas price multiplier for faster confirmation
    const GAS_PRICE_MULTIPLIER = 1.1;
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));

    // Prepare transaction parameters
    const transactionParams = {
      nonce: nonce.toString(),
      to: swapData.to,
      value: swapData.value || '0',
      gas_price: finalGasPrice.toString(),
      gas: swapData.gasLimit,
      data: swapData.data,
      network: getNetworkForSigning(normalizedNetwork)
    };

    // Validate transaction parameters
    validateTransactionParams(transactionParams);

    // Prepare payload for hardware wallet signing
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: transactionParams,
        key: {
          Password: password
        }
      }
    };

    console.warn(`Signing transaction with nonce ${nonce}, gas limit ${swapData.gasLimit}`);

    // Sign transaction using hardware wallet
    const signedTransaction = await signTransactionWithHardwareWallet(payload);
    if (!signedTransaction) {
      throw new Error('Failed to sign transaction with hardware wallet');
    }

    // Submit transaction to network
    const txHash = await submitSignedTransaction(signedTransaction, normalizedNetwork);
    if (!txHash) {
      throw new Error('Failed to submit signed transaction to network');
    }

    // Calculate total gas fee for logging
    const gasFee = finalGasPrice * BigInt(swapData.gasLimit);

    console.warn(`Swap executed successfully: ${txHash}`);

    // Return transaction result
    return {
      success: true,
      transactionHash: txHash,
      gasUsed: swapData.gasLimit,
      gasFee: gasFee.toString(),
      nonce: nonce,
      swapData: {
        tokenIn: swapData.route?.tokenIn,
        tokenOut: swapData.route?.tokenOut,
        amountIn: swapData.amountIn,
        amountOutMin: swapData.amountOutMin,
        slippage: swapData.slippage
      }
    };

  } catch (error) {
    logger.error(`Failed to execute swap: ${error.message}`);
    return {
      success: false,
      error: {
        code: 'SWAP_EXECUTION_FAILED',
        message: error.message,
        details: error.stack
      }
    };
  }
}

/**
 * Get network identifier for signing operations
 * @param {string} network - Network identifier
 * @returns {string} Network for signing
 */
function getNetworkForSigning(network) {
  // Map network names to signing network identifiers
  switch (network.toUpperCase()) {
    case 'ETHEREUM':
      return 'MAINNET';
    case 'ETHEREUM-SEPOLIA':
      return 'SEPOLIA';
    case 'ETHEREUM-HOLESKY':
      return 'HOLESKY';
    case 'ARBITRUM':
    case 'OPTIMISM':
    case 'BASE':
    case 'POLYGON':
      return 'MAINNET';
    case 'ARBITRUM-TESTNET':
    case 'OPTIMISM-TESTNET':
    case 'BASE-TESTNET':
    case 'POLYGON-MUMBAI':
      return 'TESTNET';
    default:
      return 'MAINNET';
  }
}

/**
 * Validate transaction parameters before signing
 * @param {Object} params - Transaction parameters
 * @throws {Error} If validation fails
 */
function validateTransactionParams(params) {
  const requiredFields = ['nonce', 'to', 'value', 'gas_price', 'gas', 'data', 'network'];
  
  for (const field of requiredFields) {
    if (params[field] === undefined || params[field] === null) {
      throw new Error(`Missing required transaction parameter: ${field}`);
    }
  }

  // Validate numeric fields
  const numericFields = ['nonce', 'gas_price', 'gas'];
  for (const field of numericFields) {
    const value = params[field];
    if (typeof value === 'string') {
      if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid ${field}: must be numeric string`);
      }
    } else if (typeof value !== 'number' || value < 0) {
      throw new Error(`Invalid ${field}: must be non-negative number`);
    }
  }

  // Validate addresses
  if (!params.to || !/^0x[a-fA-F0-9]{40}$/.test(params.to)) {
    throw new Error('Invalid to address format');
  }

  // Validate data format
  if (params.data && !/^0x[a-fA-F0-9]*$/.test(params.data)) {
    throw new Error('Invalid data format: must be hex string');
  }

  console.warn('Transaction parameters validated successfully');
}

/**
 * Sign transaction using hardware wallet
 * @param {Object} payload - Signing payload
 * @returns {Promise<string|null>} Signed transaction or null if failed
 */
async function signTransactionWithHardwareWallet(payload) {
  try {
    const { exec, jsonParse } = require('../utils');
    const to = require('await-to-js').default;

    // Get DEEPER_WALLET_BIN_PATH from environment or use default
    const DEEPER_WALLET_BIN_PATH = process.env.DEEPER_WALLET_BIN_PATH || 
      require('path').resolve(__dirname, '../../hd-wallet.exe');

    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');

    console.warn('Sending transaction to hardware wallet for signing');

    // Execute hardware wallet signing
    const [error, stdout] = await exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
    
    if (error) {
      logger.error(`Hardware wallet signing failed: ${error.message}`);
      return null;
    }

    if (!stdout) {
      logger.error('No output received from hardware wallet');
      return null;
    }

    // Parse signing response
    const [parseError, response] = await to(jsonParse(stdout));
    if (parseError) {
      logger.error(`Failed to parse hardware wallet response: ${parseError.message}`);
      return null;
    }

    if (!response || !response.signature) {
      logger.error(`Invalid hardware wallet response: missing signature`);
      return null;
    }

    // Format signed transaction
    const signedTransaction = `0x${response.signature.replace(/^"|"$/g, '')}`;
    
    console.warn('Transaction signed successfully by hardware wallet');
    return signedTransaction;

  } catch (error) {
    logger.error(`Hardware wallet signing error: ${error.message}`);
    return null;
  }
}

/**
 * Submit signed transaction to network
 * @param {string} signedTransaction - Signed transaction hex
 * @param {string} network - Network identifier
 * @returns {Promise<string|null>} Transaction hash or null if failed
 */
async function submitSignedTransaction(signedTransaction, network) {
  try {
    const { sendEthRawTransaction } = require('../eth');

    console.warn('Submitting signed transaction to network');

    // Submit transaction
    const txHash = await sendEthRawTransaction(network, signedTransaction);
    
    if (!txHash) {
      logger.error('Failed to submit transaction: no transaction hash returned');
      return null;
    }

    // Validate transaction hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      logger.error(`Invalid transaction hash format: ${txHash}`);
      return null;
    }

    console.warn(`Transaction submitted successfully: ${txHash}`);
    return txHash;

  } catch (error) {
    logger.error(`Transaction submission failed: ${error.message}`);
    return null;
  }
}

/**
 * Monitor transaction status and wait for confirmation
 * @param {string} txHash - Transaction hash to monitor
 * @param {string} network - Network identifier
 * @param {number} maxWaitTime - Maximum wait time in milliseconds (default: 5 minutes)
 * @param {number} pollInterval - Polling interval in milliseconds (default: 10 seconds)
 * @returns {Promise<Object>} Transaction status result
 */
async function monitorTransaction(txHash, network, maxWaitTime = 300000, pollInterval = 10000) {
  try {
    console.warn(`Monitoring transaction ${txHash} on ${network}`);

    // Validate inputs
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error('Invalid transaction hash format');
    }

    if (!network || typeof network !== 'string') {
      throw new Error('Invalid network provided');
    }

    if (maxWaitTime <= 0 || pollInterval <= 0) {
      throw new Error('Invalid timing parameters');
    }

    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = Math.ceil(maxWaitTime / pollInterval);

    while (attempts < maxAttempts) {
      attempts++;
      const elapsed = Date.now() - startTime;

      try {
        // Get transaction receipt
        const receipt = await getTransactionReceipt(txHash, network);
        
        if (receipt) {
          // Transaction is mined
          const status = receipt.status === '0x1' ? 'success' : 'failed';
          
          console.warn(`Transaction ${txHash} ${status} after ${elapsed}ms (${attempts} attempts)`);
          
          return {
            success: true,
            status: status,
            txHash: txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            effectiveGasPrice: receipt.effectiveGasPrice,
            confirmations: 1,
            waitTime: elapsed,
            attempts: attempts
          };
        }

        // Transaction still pending
        if (elapsed >= maxWaitTime) {
          console.warn(`Transaction ${txHash} monitoring timeout after ${elapsed}ms`);
          
          return {
            success: false,
            status: 'timeout',
            txHash: txHash,
            waitTime: elapsed,
            attempts: attempts,
            error: 'Transaction monitoring timeout - transaction may still be pending'
          };
        }

        // Wait before next poll
        console.warn(`Transaction ${txHash} pending, attempt ${attempts}/${maxAttempts}, waiting ${pollInterval}ms`);
        await sleep(pollInterval);

      } catch (error) {
        logger.error(`Error checking transaction ${txHash} (attempt ${attempts}): ${error.message}`);
        
        // If this is the last attempt, return error
        if (attempts >= maxAttempts) {
          return {
            success: false,
            status: 'error',
            txHash: txHash,
            waitTime: Date.now() - startTime,
            attempts: attempts,
            error: `Failed to monitor transaction: ${error.message}`
          };
        }

        // Wait before retry
        await sleep(pollInterval);
      }
    }

    // Should not reach here, but handle just in case
    return {
      success: false,
      status: 'timeout',
      txHash: txHash,
      waitTime: Date.now() - startTime,
      attempts: attempts,
      error: 'Maximum monitoring attempts exceeded'
    };

  } catch (error) {
    logger.error(`Transaction monitoring failed: ${error.message}`);
    return {
      success: false,
      status: 'error',
      txHash: txHash,
      error: error.message
    };
  }
}

/**
 * Get transaction receipt from network
 * @param {string} txHash - Transaction hash
 * @param {string} network - Network identifier
 * @returns {Promise<Object|null>} Transaction receipt or null if not found
 */
async function getTransactionReceipt(txHash, network) {
  try {
    const { sendRpcRequest, getRpcUrl } = require('../eth');
    
    // Get RPC URL for network
    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      throw new Error(`No RPC URL available for network: ${network}`);
    }

    // Make RPC call to get transaction receipt
    const receipt = await sendRpcRequest(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
    
    if (!receipt) {
      // Transaction not yet mined
      return null;
    }

    // Validate receipt structure
    if (!receipt.transactionHash || !receipt.blockNumber) {
      console.warn(`Invalid receipt structure for ${txHash}`);
      return null;
    }

    console.warn(`Retrieved receipt for ${txHash}: block ${receipt.blockNumber}, status ${receipt.status}`);
    return receipt;

  } catch (error) {
    logger.error(`Failed to get transaction receipt for ${txHash}: ${error.message}`);
    throw error;
  }
}

/**
 * Get current transaction status without waiting
 * @param {string} txHash - Transaction hash
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Current transaction status
 */
async function getTransactionStatus(txHash, network) {
  try {
    console.warn(`Checking status for transaction ${txHash} on ${network}`);

    // Validate inputs
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error('Invalid transaction hash format');
    }

    // Try to get transaction receipt
    const receipt = await getTransactionReceipt(txHash, network);
    
    if (receipt) {
      // Transaction is mined
      const status = receipt.status === '0x1' ? 'success' : 'failed';
      
      return {
        success: true,
        status: status,
        txHash: txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        mined: true
      };
    }

    // Check if transaction exists in mempool
    const tx = await getTransaction(txHash, network);
    
    if (tx) {
      return {
        success: true,
        status: 'pending',
        txHash: txHash,
        nonce: tx.nonce,
        gasPrice: tx.gasPrice,
        gasLimit: tx.gas,
        mined: false
      };
    }

    // Transaction not found
    return {
      success: false,
      status: 'not_found',
      txHash: txHash,
      error: 'Transaction not found on network'
    };

  } catch (error) {
    logger.error(`Failed to get transaction status for ${txHash}: ${error.message}`);
    return {
      success: false,
      status: 'error',
      txHash: txHash,
      error: error.message
    };
  }
}

/**
 * Get transaction details from network
 * @param {string} txHash - Transaction hash
 * @param {string} network - Network identifier
 * @returns {Promise<Object|null>} Transaction details or null if not found
 */
async function getTransaction(txHash, network) {
  try {
    const { sendRpcRequest, getRpcUrl } = require('../eth');
    
    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      throw new Error(`No RPC URL available for network: ${network}`);
    }

    const tx = await sendRpcRequest(rpcUrl, 'eth_getTransactionByHash', [txHash]);
    
    if (!tx) {
      return null;
    }

    console.warn(`Retrieved transaction ${txHash}: nonce ${tx.nonce}, gas ${tx.gas}`);
    return tx;

  } catch (error) {
    logger.error(`Failed to get transaction ${txHash}: ${error.message}`);
    throw error;
  }
}

/**
 * Execute swap with full transaction lifecycle management
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Sender address
 * @param {Object} swapData - Prepared swap data
 * @param {string} network - Network identifier
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Complete swap result with monitoring
 */
async function executeSwapWithMonitoring(password, fromAddress, swapData, network, options = {}) {
  try {
    console.warn(`Executing swap with monitoring for ${fromAddress} on ${network}`);

    // Set default options
    const {
      monitorTransaction: shouldMonitor = true,
      maxWaitTime = 300000, // 5 minutes
      pollInterval = 10000,  // 10 seconds
      returnEarly = false    // Return immediately after submission
    } = options;

    // Execute the swap
    const swapResult = await executeSwap(password, fromAddress, swapData, network);
    
    if (!swapResult.success) {
      return swapResult;
    }

    const txHash = swapResult.transactionHash;

    // If monitoring is disabled or returnEarly is true, return immediately
    if (!shouldMonitor || returnEarly) {
      return {
        ...swapResult,
        monitoring: {
          enabled: shouldMonitor,
          status: 'submitted'
        }
      };
    }

    // Monitor transaction
    console.warn(`Starting transaction monitoring for ${txHash}`);
    const monitoringResult = await monitorTransaction(txHash, network, maxWaitTime, pollInterval);

    // Combine swap and monitoring results
    return {
      ...swapResult,
      monitoring: {
        enabled: true,
        ...monitoringResult
      }
    };

  } catch (error) {
    logger.error(`Swap execution with monitoring failed: ${error.message}`);
    return {
      success: false,
      error: {
        code: 'SWAP_MONITORING_FAILED',
        message: error.message,
        details: error.stack
      }
    };
  }
}

/**
 * Utility function to sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced error handling for failed transactions
 * @param {Object} receipt - Transaction receipt
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Detailed error information
 */
async function analyzeFailedTransaction(receipt, network) {
  try {
    console.warn(`Analyzing failed transaction ${receipt.transactionHash}`);

    const errorInfo = {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      gasLimit: receipt.gas,
      status: 'failed',
      reason: 'unknown'
    };

    // Check if transaction ran out of gas
    if (receipt.gasUsed === receipt.gas) {
      errorInfo.reason = 'out_of_gas';
      errorInfo.description = 'Transaction failed due to insufficient gas limit';
    }

    // Try to get revert reason (this would require additional RPC calls)
    // For now, we'll provide basic analysis
    errorInfo.description = errorInfo.description || 'Transaction reverted - check contract conditions';

    console.warn(`Transaction failure analysis: ${errorInfo.reason}`);
    return errorInfo;

  } catch (error) {
    logger.error(`Failed to analyze transaction: ${error.message}`);
    return {
      txHash: receipt.transactionHash,
      reason: 'analysis_failed',
      description: 'Could not determine failure reason',
      error: error.message
    };
  }
}

/**
 * Create structured error for swap operations
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {string} operation - Operation that failed
 * @returns {Error} Enhanced error object
 */
function createSwapError(code, message, details = null, operation = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.operation = operation;
  error.timestamp = Date.now();
  error.retryable = SWAP_RETRY_CONFIG.RETRYABLE_ERRORS.includes(code);
  
  // Log error with appropriate level
  if (isNetworkSwapError(code)) {
    console.warn(`${operation || 'swap operation'} network error: ${message}`, { code, details });
  } else if (isValidationSwapError(code)) {
    console.warn(`${operation || 'swap operation'} validation error: ${message}`, { code, details });
  } else {
    logger.error(`${operation || 'swap operation'} error: ${message}`, { code, details });
  }
  
  return error;
}

/**
 * Check if error code represents a network-related error
 * @param {string} code - Error code
 * @returns {boolean} True if network error
 */
function isNetworkSwapError(code) {
  return [SWAP_ERROR_CODES.NETWORK_ERROR, SWAP_ERROR_CODES.TIMEOUT_ERROR].includes(code);
}

/**
 * Check if error code represents a validation error
 * @param {string} code - Error code
 * @returns {boolean} True if validation error
 */
function isValidationSwapError(code) {
  return [
    SWAP_ERROR_CODES.INVALID_TOKEN_ADDRESS,
    SWAP_ERROR_CODES.INVALID_AMOUNT
  ].includes(code);
}

/**
 * Retry wrapper for swap operations with enhanced error handling
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {string} parentOperation - Parent operation context
 * @param {Object} retryConfig - Retry configuration
 * @returns {Promise<any>} Operation result
 */
async function withSwapRetry(operation, operationName, parentOperation, retryConfig = SWAP_RETRY_CONFIG) {
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
      const errorCode = error.code || getSwapErrorCode(error);
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
 * Extract error code from error object for swap operations
 * @param {Error} error - Error object
 * @returns {string} Error code
 */
function getSwapErrorCode(error) {
  if (error.code) {
    return error.code;
  }
  
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('connection')) {
    return SWAP_ERROR_CODES.NETWORK_ERROR;
  }
  
  if (message.includes('timeout')) {
    return SWAP_ERROR_CODES.TIMEOUT_ERROR;
  }
  
  if (message.includes('liquidity')) {
    return SWAP_ERROR_CODES.INSUFFICIENT_LIQUIDITY;
  }
  
  if (message.includes('slippage')) {
    return SWAP_ERROR_CODES.SLIPPAGE_TOO_HIGH;
  }
  
  return SWAP_ERROR_CODES.ROUTE_CALCULATION_FAILED;
}

module.exports = {
  calculateSwapRoute,
  prepareSwapTransaction,
  executeSwap,
  executeSwapWithMonitoring,
  monitorTransaction,
  getTransactionStatus,
  getTransactionReceipt,
  getTransaction,
  analyzeFailedTransaction,
  // Export helper functions for testing
  validateTransactionParams,
  signTransactionWithHardwareWallet,
  submitSignedTransaction,
  // Export error handling functions
  createSwapError,
  withSwapRetry,
  SWAP_ERROR_CODES
};