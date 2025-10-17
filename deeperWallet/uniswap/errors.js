const { ERROR_CODES, NETWORK_CONFIG } = require('./constants');

/**
 * Create a standardized error object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Additional error details
 * @returns {Object} Standardized error object
 */
function createError(code, message, details = {}) {
  return {
    error: true,
    code,
    message,
    details,
    timestamp: Math.floor(Date.now() / 1000)
  };
}

/**
 * Create user-friendly error messages for common scenarios
 * @param {string} code - Error code
 * @param {Object} [context] - Additional context for the error
 * @returns {string} User-friendly error message
 */
function getUserFriendlyErrorMessage(code, context = {}) {
  switch (code) {
    case ERROR_CODES.INVALID_TOKEN_ADDRESS:
      return 'The token address provided is not valid. Please check the address format.';

    case ERROR_CODES.INVALID_AMOUNT:
      return 'The amount provided is not valid. Please enter a positive number.';

    case ERROR_CODES.INVALID_NETWORK:
      return `The network "${context.network}" is not supported. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}.`;

    case ERROR_CODES.POOL_NOT_FOUND:
      return 'No liquidity pool found for this token pair. Trading is not available.';

    case ERROR_CODES.INSUFFICIENT_LIQUIDITY:
      return 'Insufficient liquidity in the pool for this trade size. Try reducing the amount.';

    case ERROR_CODES.HIGH_PRICE_IMPACT:
      return `This trade will have a high price impact (${context.priceImpact?.toFixed(2)}%). Consider reducing the trade size.`;

    case ERROR_CODES.SLIPPAGE_EXCEEDED:
      return 'The price moved too much during the transaction. Try increasing slippage tolerance or reducing trade size.';

    case ERROR_CODES.APPROVAL_FAILED:
      return 'Token approval failed. Please try again or check your wallet connection.';

    case ERROR_CODES.INSUFFICIENT_ALLOWANCE:
      return 'Insufficient token allowance. Please approve the token for trading first.';

    case ERROR_CODES.NETWORK_ERROR:
      return 'Network connection error. Please check your internet connection and try again.';

    case ERROR_CODES.TRANSACTION_FAILED:
      return 'Transaction failed. Please check your wallet balance and network connection.';

    case ERROR_CODES.GAS_ESTIMATION_FAILED:
      return 'Unable to estimate gas costs. The transaction may fail or network may be congested.';

    case ERROR_CODES.INSUFFICIENT_BALANCE:
      return 'Insufficient balance to complete this transaction including gas fees.';

    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Wrap async functions with comprehensive error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} operation - Operation name for logging
 * @returns {Function} Wrapped function with error handling
 */
function withErrorHandling(fn, operation) {
  return async function (...args) {
    try {
      const result = await fn.apply(this, args);
      return result;
    } catch (error) {
      console.error(`Error in ${operation}:`, error.message);

      // Categorize error types
      if (error.message.includes('network') || error.message.includes('timeout')) {
        return createError(ERROR_CODES.NETWORK_ERROR, getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR), {
          operation,
          originalError: error.message
        });
      }

      if (error.message.includes('insufficient')) {
        return createError(ERROR_CODES.INSUFFICIENT_LIQUIDITY, getUserFriendlyErrorMessage(ERROR_CODES.INSUFFICIENT_LIQUIDITY), {
          operation,
          originalError: error.message
        });
      }

      if (error.message.includes('invalid') || error.message.includes('Invalid')) {
        return createError(ERROR_CODES.INVALID_PARAMETERS, getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS), {
          operation,
          originalError: error.message
        });
      }

      // Generic error
      return createError(ERROR_CODES.NETWORK_ERROR, 'An unexpected error occurred. Please try again.', {
        operation,
        originalError: error.message
      });
    }
  };
}

module.exports = {
  createError,
  getUserFriendlyErrorMessage,
  withErrorHandling
};