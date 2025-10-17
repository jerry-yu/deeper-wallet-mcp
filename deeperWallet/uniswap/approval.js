const { isValidAddress, isValidAmount, getNetworkConfig, isNetworkSupported } = require('./utils');
const { SELECTORS } = require('./constants');
const { sendRpcRequest } = require('./rpc');
const { encodeFunctionCall, decodeHexToDecimal } = require('./encoding');
const { checkTokenApproval, getTokenAllowance } = require('./token');

/**
 * Get Uniswap spender address for a network and version
 * @param {string} network - Network name
 * @param {string} [version='V2'] - Uniswap version ('V2' or 'V3')
 * @returns {string|null} Spender address or null if network not supported
 */
function getUniswapSpenderAddress(network, version = 'V2') {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      return null;
    }

    return version === 'V3' ? config.v3Router : config.v2Router;
  } catch (error) {
    console.error('Error getting Uniswap spender address:', error.message);
    return null;
  }
}

/**
 * Generate approval transaction data for ERC20 token
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Amount to approve in wei
 * @returns {string} Encoded approval transaction data
 */
function getApprovalCalldata(spenderAddress, amount) {
  try {
    if (!isValidAddress(spenderAddress)) {
      throw new Error('Invalid spender address');
    }

    if (!isValidAmount(amount)) {
      throw new Error('Invalid amount');
    }

    // Clean and format spender address
    let cleanSpender = spenderAddress.toLowerCase();
    cleanSpender = cleanSpender.startsWith('0x') ? cleanSpender.slice(2) : cleanSpender;
    cleanSpender = cleanSpender.padStart(64, '0');

    // Convert amount to hex and pad
    const amountHex = BigInt(amount).toString(16).padStart(64, '0');

    return `${SELECTORS.APPROVE}${cleanSpender}${amountHex}`;
  } catch (error) {
    console.error('Error generating approval calldata:', error.message);
    throw error;
  }
}

module.exports = {
  getUniswapSpenderAddress,
  getApprovalCalldata
};