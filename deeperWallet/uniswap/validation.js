const { isValidAddress, isValidAmount, isNetworkSupported, isValidSlippage, isValidDeadline } = require('./utils');
const { NETWORK_CONFIG, FEE_TIERS } = require('./constants');

/**
 * Validate swap parameters
 * @param {Object} params - Swap parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string} params.amountIn - Input amount
 * @param {string} params.network - Network name
 * @param {string} [params.fromAddress] - Sender address (optional)
 * @param {number} [params.slippage] - Slippage percentage (optional)
 * @param {number} [params.deadline] - Transaction deadline (optional)
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validateSwapParams(params) {
  const errors = [];

  // Validate required parameters exist
  if (!params || typeof params !== 'object') {
    errors.push('Parameters object is required');
    return { isValid: false, errors };
  }

  // Validate token addresses
  if (!params.tokenIn) {
    errors.push('Input token address is required');
  } else if (!isValidAddress(params.tokenIn)) {
    errors.push('Invalid input token address format');
  }

  if (!params.tokenOut) {
    errors.push('Output token address is required');
  } else if (!isValidAddress(params.tokenOut)) {
    errors.push('Invalid output token address format');
  }

  if (params.tokenIn && params.tokenOut && params.tokenIn.toLowerCase() === params.tokenOut.toLowerCase()) {
    errors.push('Input and output tokens cannot be the same');
  }

  // Validate amount
  if (!params.amountIn) {
    errors.push('Input amount is required');
  } else if (!isValidAmount(params.amountIn)) {
    errors.push('Invalid input amount format');
  } else if (BigInt(params.amountIn) <= 0n) {
    errors.push('Input amount must be greater than zero');
  } else {
    // Check for reasonable amount limits
    const maxAmount = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'); // Max uint256
    const minAmount = BigInt('1');

    if (BigInt(params.amountIn) > maxAmount) {
      errors.push('Input amount exceeds maximum allowed value');
    }
    if (BigInt(params.amountIn) < minAmount) {
      errors.push('Input amount is too small');
    }
  }

  // Validate network
  if (!params.network) {
    errors.push('Network is required');
  } else if (!isNetworkSupported(params.network)) {
    errors.push(`Unsupported network: ${params.network}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
  }

  // Validate optional parameters
  if (params.fromAddress && !isValidAddress(params.fromAddress)) {
    errors.push('Invalid sender address format');
  }

  if (params.slippage !== undefined && !isValidSlippage(params.slippage)) {
    errors.push('Invalid slippage percentage (must be between 0 and 50)');
  }

  if (params.deadline !== undefined && !isValidDeadline(params.deadline)) {
    errors.push('Invalid deadline (must be future timestamp within 1 hour)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate pool query parameters
 * @param {Object} params - Pool parameters
 * @param {string} params.tokenA - First token address
 * @param {string} params.tokenB - Second token address
 * @param {string} params.network - Network name
 * @param {number} [params.fee] - Fee tier for V3 pools (optional)
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validatePoolParams(params) {
  const errors = [];

  // Validate required parameters exist
  if (!params || typeof params !== 'object') {
    errors.push('Parameters object is required');
    return { isValid: false, errors };
  }

  // Validate token addresses
  if (!params.tokenA) {
    errors.push('Token A address is required');
  } else if (!isValidAddress(params.tokenA)) {
    errors.push('Invalid token A address format');
  }

  if (!params.tokenB) {
    errors.push('Token B address is required');
  } else if (!isValidAddress(params.tokenB)) {
    errors.push('Invalid token B address format');
  }

  if (params.tokenA && params.tokenB && params.tokenA.toLowerCase() === params.tokenB.toLowerCase()) {
    errors.push('Token A and Token B cannot be the same');
  }

  // Validate network
  if (!params.network) {
    errors.push('Network is required');
  } else if (!isNetworkSupported(params.network)) {
    errors.push(`Unsupported network: ${params.network}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
  }

  // Validate optional fee parameter
  if (params.fee !== undefined) {
    const validFees = Object.values(FEE_TIERS);
    if (!validFees.includes(params.fee)) {
      errors.push(`Invalid fee tier: ${params.fee}. Valid fee tiers: ${validFees.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate and sanitize input parameters for any function
 * @param {Object} params - Parameters to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result with sanitized params or errors
 */
function validateAndSanitizeParams(params, schema) {
  const errors = [];
  const sanitized = {};

  if (!params || typeof params !== 'object') {
    return {
      isValid: false,
      errors: ['Parameters object is required'],
      sanitized: null
    };
  }

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key];

    // Check if required parameter is missing
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${key} is required`);
      continue;
    }

    // Skip validation for optional missing parameters
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${key} must be of type ${rules.type}`);
      continue;
    }

    // Custom validation function
    if (rules.validate && !rules.validate(value)) {
      errors.push(rules.errorMessage || `${key} is invalid`);
      continue;
    }

    // Transform/sanitize the value
    sanitized[key] = rules.transform ? rules.transform(value) : value;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null
  };
}

module.exports = {
  validateSwapParams,
  validatePoolParams,
  validateAndSanitizeParams
};