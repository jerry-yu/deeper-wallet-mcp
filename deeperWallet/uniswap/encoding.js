const { isValidAddress, isValidAmount } = require('./utils');
const { SELECTORS } = require('./constants');

/**
 * Encode function call data for contract interaction
 * @param {string} selector - Function selector (4 bytes)
 * @param {Array} params - Array of parameters to encode
 * @returns {string} Encoded function call data
 */
function encodeFunctionCall(selector, params = []) {
  try {
    let data = selector.startsWith('0x') ? selector : '0x' + selector;

    for (const param of params) {
      if (typeof param === 'string' && param.startsWith('0x')) {
        // Address parameter - pad to 32 bytes
        data += param.slice(2).padStart(64, '0');
      } else if (typeof param === 'string' && /^\d+$/.test(param)) {
        // Numeric string parameter - convert to hex and pad
        const hex = BigInt(param).toString(16);
        data += hex.padStart(64, '0');
      } else if (typeof param === 'number') {
        // Number parameter - convert to hex and pad
        const hex = param.toString(16);
        data += hex.padStart(64, '0');
      } else {
        throw new Error(`Unsupported parameter type: ${typeof param}`);
      }
    }

    return data;
  } catch (error) {
    console.error('Error encoding function call:', error.message);
    throw error;
  }
}

/**
 * Encode address parameter for contract calls
 * @param {string} address - Ethereum address
 * @returns {string} Encoded address (64 characters, no 0x prefix)
 */
function encodeAddress(address) {
  if (!isValidAddress(address)) {
    throw new Error('Invalid address format');
  }
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Encode uint256 parameter for contract calls
 * @param {string|number|bigint} value - Value to encode
 * @returns {string} Encoded value (64 characters, no 0x prefix)
 */
function encodeUint256(value) {
  try {
    const bigIntValue = BigInt(value);
    if (bigIntValue < 0n) {
      throw new Error('Value cannot be negative');
    }
    return bigIntValue.toString(16).padStart(64, '0');
  } catch (error) {
    console.error('Error encoding uint256:', error.message);
    throw error;
  }
}

/**
 * Decode hex string to decimal string
 * @param {string} hex - Hex string to decode
 * @returns {string} Decimal string
 */
function decodeHexToDecimal(hex) {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return BigInt('0x' + cleanHex).toString();
  } catch (error) {
    console.error('Error decoding hex to decimal:', error.message);
    throw error;
  }
}

/**
 * Decode address from contract call result
 * @param {string} hex - Hex string (64 characters)
 * @returns {string} Ethereum address
 */
function decodeAddress(hex) {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (cleanHex.length !== 64) {
      throw new Error('Invalid hex length for address');
    }
    return '0x' + cleanHex.slice(-40);
  } catch (error) {
    console.error('Error decoding address:', error.message);
    throw error;
  }
}

module.exports = {
  encodeFunctionCall,
  encodeAddress,
  encodeUint256,
  decodeHexToDecimal,
  decodeAddress
};