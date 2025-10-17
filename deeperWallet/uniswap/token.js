const { isValidAddress } = require('./utils');
const { SELECTORS } = require('./constants');
const { sendRpcRequest } = require('./rpc');
const { encodeFunctionCall, decodeHexToDecimal } = require('./encoding');

/**
 * Check ERC20 token allowance for a spender
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (usually router)
 * @returns {Promise<string|null>} Current allowance amount in wei or null if error
 */
async function getTokenAllowance(network, tokenAddress, ownerAddress, spenderAddress) {
  try {
    if (!isValidAddress(tokenAddress) || !isValidAddress(ownerAddress) || !isValidAddress(spenderAddress)) {
      throw new Error('Invalid address format');
    }

    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Encode allowance(address,address) call
    const data = encodeFunctionCall(SELECTORS.ALLOWANCE, [ownerAddress, spenderAddress]);

    const result = await sendRpcRequest(rpcUrl, 'eth_call', [
      {
        to: tokenAddress,
        data: data
      },
      'pending'
    ]);
    if (!result || result === '0x') {
      return '0';
    }

    return decodeHexToDecimal(result);
  } catch (error) {
    console.error('Error getting token allowance:', error.message);
    return null;
  }
}

/**
 * Check if token approval is sufficient for the required amount
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} requiredAmount - Required amount in wei
 * @returns {Promise<Object>} Approval status with isApproved boolean and current allowance
 */
async function checkTokenApproval(network, tokenAddress, ownerAddress, spenderAddress, requiredAmount) {
  try {
    console.warn("checkTokenApproval ----", network, tokenAddress, ownerAddress, spenderAddress, requiredAmount);
    const currentAllowance = await getTokenAllowance(network, tokenAddress, ownerAddress, spenderAddress);

    console.warn("checkTokenApproval ----", currentAllowance);
    if (currentAllowance === null) {
      return {
        isApproved: false,
        currentAllowance: '0',
        requiredAmount,
        error: 'Failed to check allowance'
      };
    }

    const isApproved = BigInt(currentAllowance) >= BigInt(requiredAmount);

    return {
      isApproved,
      currentAllowance,
      requiredAmount,
      needsApproval: !isApproved
    };
  } catch (error) {
    console.error('Error checking token approval:', error.message);
    return {
      isApproved: false,
      currentAllowance: '0',
      requiredAmount,
      error: error.message
    };
  }
}

module.exports = {
  getTokenAllowance,
  checkTokenApproval
};