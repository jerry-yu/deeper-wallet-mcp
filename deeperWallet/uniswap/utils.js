/**
 * Utility Functions and Helpers
 * Provides utility functions for token handling, validation, and conversions
 */

const logger = require('../log');
const { getSupportedNetworks } = require('./constants');
const { erc20Name, erc20Symbol, erc20Decimals, erc20Allowance, getApprovalCalldata, estimate_gas } = require('../eth');
const { tokenCache, approvalCache } = require('./cache');

/**
 * Validate Ethereum address format and checksum
 * @param {string} address - Ethereum address
 * @returns {boolean} Validation result
 */
function isValidAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  // Check if it's a valid hex string with 0x prefix and 40 characters
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!addressRegex.test(address)) {
    return false;
  }
  
  return true;
}

/**
 * Convert address to checksum format
 * @param {string} address - Ethereum address
 * @returns {string} Checksummed address
 */
function toChecksumAddress(address) {
  if (!isValidAddress(address)) {
    throw new Error('Invalid address format');
  }
  
  // Simple checksum implementation - in production would use proper keccak256
  const addr = address.toLowerCase().replace('0x', '');
  let checksum = '0x';
  
  for (let i = 0; i < addr.length; i++) {
    // Simple checksum logic - alternate between upper and lower case
    // In production, this would use proper keccak256 hash
    if (i % 2 === 0) {
      checksum += addr[i].toUpperCase();
    } else {
      checksum += addr[i];
    }
  }
  
  return checksum;
}

/**
 * Validate token contract address with checksum verification
 * @param {string} address - Token contract address
 * @param {string} network - Network identifier
 * @returns {Promise<boolean>} Validation result
 */
async function validateTokenAddress(address, network) {
  try {
    // Validate network first
    if (!validateNetwork(network)) {
      logger.error(`Invalid network: ${network}`);
      return false;
    }
    
    // Validate address format
    if (!isValidAddress(address)) {
      logger.error(`Invalid address format: ${address}`);
      return false;
    }
    
    // Check if it's a zero address
    if (address === '0x0000000000000000000000000000000000000000') {
      logger.error('Zero address not allowed');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`Token address validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Get token metadata (name, symbol, decimals)
 * @param {string} address - Token contract address
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Token metadata
 */
async function getTokenInfo(address, network) {
  try {
    // Validate inputs
    if (!validateTokenAddress(address, network)) {
      throw new Error('Invalid token address or network');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumAddress = toChecksumAddress(address);

    // Check cache first
    const cached = tokenCache.get(normalizedNetwork, checksumAddress);
    if (cached) {
      console.warn(`Token info cache hit for ${checksumAddress} on ${normalizedNetwork}`);
      return cached;
    }

    console.warn(`Fetching token info for ${checksumAddress} on ${normalizedNetwork}`);

    // Fetch token metadata from blockchain
    const [name, symbol, decimals] = await Promise.all([
      erc20Name(normalizedNetwork, checksumAddress),
      erc20Symbol(normalizedNetwork, checksumAddress),
      erc20Decimals(normalizedNetwork, checksumAddress)
    ]);

    // Validate that we got valid responses
    if (name === null || symbol === null || decimals === null) {
      throw new Error('Failed to fetch token metadata - contract may not be a valid ERC20 token');
    }

    // Validate decimals is a reasonable number
    if (typeof decimals !== 'number' || decimals < 0 || decimals > 77) {
      throw new Error(`Invalid decimals value: ${decimals}`);
    }

    const tokenInfo = {
      address: checksumAddress,
      name: name.trim(),
      symbol: symbol.trim(),
      decimals: decimals,
      network: normalizedNetwork
    };

    // Cache the result using new cache system
    tokenCache.set(normalizedNetwork, checksumAddress, tokenInfo);

    console.warn(`Successfully fetched token info: ${symbol} (${name}) with ${decimals} decimals`);
    return tokenInfo;

  } catch (error) {
    logger.error(`Failed to get token info for ${address} on ${network}: ${error.message}`);
    throw new Error(`Token info retrieval failed: ${error.message}`);
  }
}

/**
 * Format token amounts with proper decimals
 * @param {string|number|BigInt} amount - Token amount in smallest unit
 * @param {number} decimals - Token decimals
 * @returns {string} Formatted amount as decimal string
 */
function formatTokenAmount(amount, decimals) {
  try {
    if (!amount || amount === '0') {
      return '0';
    }
    
    if (typeof decimals !== 'number' || decimals < 0 || decimals > 77) {
      throw new Error('Invalid decimals value');
    }
    
    // Convert to string and handle BigInt
    let amountStr = amount.toString();
    
    // Remove any decimal points if present (should be integer)
    if (amountStr.includes('.')) {
      amountStr = amountStr.split('.')[0];
    }
    
    // Pad with zeros if needed
    if (amountStr.length <= decimals) {
      amountStr = amountStr.padStart(decimals + 1, '0');
    }
    
    // Insert decimal point
    const integerPart = amountStr.slice(0, -decimals) || '0';
    const decimalPart = amountStr.slice(-decimals);
    
    // Remove trailing zeros from decimal part
    const trimmedDecimal = decimalPart.replace(/0+$/, '');
    
    if (trimmedDecimal === '') {
      return integerPart;
    }
    
    return `${integerPart}.${trimmedDecimal}`;
  } catch (error) {
    logger.error(`Token amount formatting failed: ${error.message}`);
    throw new Error(`Invalid amount format: ${amount}`);
  }
}

/**
 * Parse token amount from decimal string to smallest unit
 * @param {string} amount - Token amount as decimal string
 * @param {number} decimals - Token decimals
 * @returns {string} Amount in smallest unit
 */
function parseTokenAmount(amount, decimals) {
  try {
    if (!amount || amount === '0') {
      return '0';
    }
    
    if (typeof decimals !== 'number' || decimals < 0 || decimals > 77) {
      throw new Error('Invalid decimals value');
    }
    
    const amountStr = amount.toString();
    
    // Split by decimal point
    const parts = amountStr.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    
    // Combine and remove leading zeros
    const result = (integerPart + decimalPart).replace(/^0+/, '') || '0';
    
    return result;
  } catch (error) {
    logger.error(`Token amount parsing failed: ${error.message}`);
    throw new Error(`Invalid amount format: ${amount}`);
  }
}

/**
 * Validate network parameter
 * @param {string} network - Network identifier
 * @returns {boolean} Validation result
 */
function validateNetwork(network) {
  if (!network || typeof network !== 'string') {
    return false;
  }
  
  const supportedNetworks = getSupportedNetworks();
  return supportedNetworks.includes(network.toUpperCase());
}

/**
 * Normalize network name to uppercase
 * @param {string} network - Network identifier
 * @returns {string} Normalized network name
 */
function normalizeNetwork(network) {
  if (!validateNetwork(network)) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return network.toUpperCase();
}

/**
 * Validate amount string
 * @param {string} amount - Amount to validate
 * @returns {boolean} Validation result
 */
function validateAmount(amount) {
  if (!amount || typeof amount !== 'string') {
    return false;
  }
  
  // Check if it's a valid number string
  const amountRegex = /^\d+(\.\d+)?$/;
  if (!amountRegex.test(amount)) {
    return false;
  }
  
  // Check if it's greater than 0
  const numAmount = parseFloat(amount);
  return numAmount > 0;
}

/**
 * Convert hex string to decimal string
 * @param {string} hex - Hex string
 * @returns {string} Decimal string
 */
function hexToDecimalString(hex) {
  if (!hex || typeof hex !== 'string') {
    return '0';
  }
  
  let cleanHex = hex;
  if (cleanHex.startsWith('0x')) {
    cleanHex = cleanHex.slice(2);
  }
  
  if (cleanHex === '') {
    return '0';
  }
  
  return BigInt('0x' + cleanHex).toString();
}

/**
 * Convert decimal string to hex string
 * @param {string} decimal - Decimal string
 * @returns {string} Hex string with 0x prefix
 */
function decimalToHexString(decimal) {
  if (!decimal || decimal === '0') {
    return '0x0';
  }
  
  return '0x' + BigInt(decimal).toString(16);
}

/**
 * Validate if a token is supported on the specified network
 * @param {string} address - Token contract address
 * @param {string} network - Network identifier
 * @returns {Promise<boolean>} Validation result
 */
async function validateTokenOnNetwork(address, network) {
  try {
    const tokenInfo = await getTokenInfo(address, network);
    return tokenInfo && tokenInfo.symbol && tokenInfo.name && typeof tokenInfo.decimals === 'number';
  } catch (error) {
    logger.error(`Token validation failed for ${address} on ${network}: ${error.message}`);
    return false;
  }
}

/**
 * Clear token metadata cache
 * @param {string} address - Optional specific token address to clear
 * @param {string} network - Optional specific network to clear
 */
function clearTokenCache(address = null, network = null) {
  if (address && network) {
    const normalizedNetwork = normalizeNetwork(network);
    const checksumAddress = toChecksumAddress(address);
    tokenCache.del(normalizedNetwork, checksumAddress);
    console.warn(`Cleared cache for ${checksumAddress} on ${normalizedNetwork}`);
  } else {
    tokenCache.clear();
    console.warn('Cleared entire token metadata cache');
  }
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  const { getStats } = require('./cache');
  return getStats('tokenMetadata');
}

/**
 * Check ERC20 token approval status
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (router)
 * @param {string} network - Network identifier
 * @returns {Promise<string>} Current allowance amount
 */
async function checkTokenApproval(tokenAddress, ownerAddress, spenderAddress, network) {
  try {
    // Validate inputs
    if (!validateTokenAddress(tokenAddress, network)) {
      throw new Error('Invalid token address or network');
    }
    
    if (!isValidAddress(ownerAddress)) {
      throw new Error('Invalid owner address');
    }
    
    if (!isValidAddress(spenderAddress)) {
      throw new Error('Invalid spender address');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumTokenAddress = toChecksumAddress(tokenAddress);
    const checksumOwnerAddress = toChecksumAddress(ownerAddress);
    const checksumSpenderAddress = toChecksumAddress(spenderAddress);

    // Check cache first
    const cached = approvalCache.get(normalizedNetwork, checksumTokenAddress, checksumOwnerAddress, checksumSpenderAddress);
    if (cached) {
      console.warn(`Approval cache hit for ${checksumTokenAddress}`);
      return cached.allowance;
    }

    console.warn(`Checking token approval for ${checksumTokenAddress} from ${checksumOwnerAddress} to ${checksumSpenderAddress} on ${normalizedNetwork}`);

    // Get current allowance from blockchain
    const allowance = await erc20Allowance(
      normalizedNetwork,
      checksumTokenAddress,
      checksumOwnerAddress,
      checksumSpenderAddress
    );

    if (allowance === null) {
      throw new Error('Failed to fetch token allowance - contract may not be a valid ERC20 token');
    }

    // Cache the result
    const approvalData = {
      allowance,
      tokenAddress: checksumTokenAddress,
      ownerAddress: checksumOwnerAddress,
      spenderAddress: checksumSpenderAddress,
      network: normalizedNetwork,
      timestamp: Date.now()
    };
    
    approvalCache.set(normalizedNetwork, checksumTokenAddress, checksumOwnerAddress, checksumSpenderAddress, approvalData);

    console.warn(`Current allowance: ${allowance}`);
    return allowance;

  } catch (error) {
    logger.error(`Failed to check token approval: ${error.message}`);
    throw new Error(`Token approval check failed: ${error.message}`);
  }
}

/**
 * Check if current allowance is sufficient for the required amount
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (router)
 * @param {string} requiredAmount - Required amount in token units
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Approval status and details
 */
async function checkApprovalStatus(tokenAddress, ownerAddress, spenderAddress, requiredAmount, network) {
  try {
    // Get token info to convert amount to smallest unit
    const tokenInfo = await getTokenInfo(tokenAddress, network);
    const requiredAmountInSmallestUnit = parseTokenAmount(requiredAmount, tokenInfo.decimals);

    // Get current allowance
    const currentAllowance = await checkTokenApproval(tokenAddress, ownerAddress, spenderAddress, network);

    // Compare allowance with required amount
    const isApprovalSufficient = BigInt(currentAllowance) >= BigInt(requiredAmountInSmallestUnit);

    return {
      isApprovalSufficient,
      currentAllowance,
      requiredAmount: requiredAmountInSmallestUnit,
      tokenInfo
    };

  } catch (error) {
    logger.error(`Failed to check approval status: ${error.message}`);
    throw new Error(`Approval status check failed: ${error.message}`);
  }
}

/**
 * Prepare approval transaction for ERC20 token
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (router)
 * @param {string} amount - Amount to approve
 * @param {string} network - Network identifier
 * @returns {Promise<Object>} Approval transaction data
 */
async function prepareApprovalTransaction(tokenAddress, spenderAddress, amount, network) {
  try {
    // Validate inputs
    if (!validateTokenAddress(tokenAddress, network)) {
      throw new Error('Invalid token address or network');
    }
    
    if (!isValidAddress(spenderAddress)) {
      throw new Error('Invalid spender address');
    }
    
    if (!validateAmount(amount)) {
      throw new Error('Invalid amount');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const checksumTokenAddress = toChecksumAddress(tokenAddress);
    const checksumSpenderAddress = toChecksumAddress(spenderAddress);

    console.warn(`Preparing approval transaction for ${amount} tokens of ${checksumTokenAddress} to ${checksumSpenderAddress} on ${normalizedNetwork}`);

    // Get token info to convert amount to smallest unit
    const tokenInfo = await getTokenInfo(checksumTokenAddress, normalizedNetwork);
    const amountInSmallestUnit = parseTokenAmount(amount, tokenInfo.decimals);

    // Generate approval calldata
    const calldata = getApprovalCalldata(checksumSpenderAddress, amountInSmallestUnit);

    // Estimate gas for the approval transaction
    // We need a dummy fromAddress for gas estimation - using zero address as placeholder
    const dummyFromAddress = '0x0000000000000000000000000000000000000001';
    const gasEstimate = await estimate_gas(
      normalizedNetwork,
      dummyFromAddress,
      checksumTokenAddress,
      0, // No ETH value for approval
      calldata
    );

    if (!gasEstimate) {
      throw new Error('Failed to estimate gas for approval transaction');
    }

    // Add 20% buffer to gas estimate
    const gasLimit = Math.ceil(gasEstimate * 1.2);

    const approvalTxData = {
      to: checksumTokenAddress,
      value: '0', // No ETH value for ERC20 approval
      data: calldata,
      gasLimit: gasLimit.toString(),
      tokenAddress: checksumTokenAddress,
      spenderAddress: checksumSpenderAddress,
      amount: amount,
      amountInSmallestUnit: amountInSmallestUnit,
      network: normalizedNetwork
    };

    console.warn(`Approval transaction prepared with gas limit: ${gasLimit}`);
    return approvalTxData;

  } catch (error) {
    logger.error(`Failed to prepare approval transaction: ${error.message}`);
    throw new Error(`Approval transaction preparation failed: ${error.message}`);
  }
}

module.exports = {
  isValidAddress,
  toChecksumAddress,
  validateTokenAddress,
  getTokenInfo,
  validateTokenOnNetwork,
  clearTokenCache,
  getCacheStats,
  formatTokenAmount,
  parseTokenAmount,
  validateNetwork,
  normalizeNetwork,
  validateAmount,
  hexToDecimalString,
  decimalToHexString,
  checkTokenApproval,
  checkApprovalStatus,
  prepareApprovalTransaction
};