// Utility functions for Uniswap integration
const { CurrencyAmount, Token, Percent } = require('@uniswap/sdk-core');
const JSBI = require('jsbi');

/**
 * Validate Ethereum address format
 * @param {string} address - Ethereum address to validate
 * @returns {boolean} - Whether the address is valid
 */
function isValidAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate token amount
 * @param {string|number} amount - Token amount to validate
 * @returns {boolean} - Whether the amount is valid
 */
function isValidAmount(amount) {
  if (!amount) return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

/**
 * Convert string amount to CurrencyAmount
 * @param {string} amount - Amount as string
 * @param {Token} token - Token object
 * @returns {CurrencyAmount} - CurrencyAmount object
 */
function stringToCurrencyAmount(amount, token) {
  try {
    return CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amount));
  } catch (error) {
    throw new Error(`Invalid amount: ${amount}`);
  }
}

/**
 * Convert slippage percentage to Percent object
 * @param {number} slippage - Slippage tolerance as percentage (e.g., 0.5 for 0.5%)
 * @returns {Percent} - Percent object
 */
function slippageToPercent(slippage) {
  if (slippage <= 0 || slippage >= 100) {
    throw new Error('Slippage must be between 0 and 100');
  }
  // Convert to basis points (1/100 of a percent)
  return new Percent(Math.round(slippage * 100), 10000);
}

/**
 * Calculate deadline timestamp
 * @param {number} minutes - Minutes from now
 * @returns {number} - Unix timestamp
 */
function calculateDeadline(minutes) {
  return Math.floor(Date.now() / 1000) + 60 * minutes;
}

/**
 * Format token amount for display
 * @param {CurrencyAmount} currencyAmount - CurrencyAmount object
 * @returns {string} - Formatted amount
 */
function formatTokenAmount(currencyAmount) {
  return currencyAmount.toExact();
}

/**
 * Parse token from address and chain
 * @param {string} address - Token address
 * @param {number} chainId - Chain ID
 * @param {string} symbol - Token symbol
 * @param {number} decimals - Token decimals
 * @param {string} name - Token name
 * @returns {Token} - Token object
 */
function parseToken(address, chainId, symbol, decimals, name) {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid token address: ${address}`);
  }
  
  return new Token(chainId, address, decimals, symbol, name);
}

module.exports = {
  isValidAddress,
  isValidAmount,
  stringToCurrencyAmount,
  slippageToPercent,
  calculateDeadline,
  formatTokenAmount,
  parseToken,
};