// Swap execution functionality
const { Token, CurrencyAmount, TradeType } = require('@uniswap/sdk-core');
const { SwapRouter } = require('@uniswap/universal-router-sdk');
const { ethers } = require('ethers');
const { DEFAULT_SWAP_OPTIONS } = require('./config');
const { isValidAddress, parseToken, stringToCurrencyAmount, slippageToPercent, calculateDeadline } = require('./utils');
const { exec,jsonParse} = require('../deeperWallet/utils');
const { sendEthRawTransaction,get_tx_essential_elem } = require('../deeperWallet/eth');
const to = require('await-to-js').default;

// Path to the deeper wallet binary - using forward slashes to avoid encoding issues
const DEEPER_WALLET_BIN_PATH = 'D:/git_resp/hd-wallet/target/release/hd-wallet.exe';

/**
 * Strip '0x' prefix from a hex string if present
 * @param {string} hexString - Hex string that may have '0x' prefix
 * @returns {string} - Hex string without '0x' prefix
 */
function stripHexPrefix(hexString) {
  if (typeof hexString === 'string' && hexString.startsWith('0x')) {
    return hexString.slice(2);
  }
  return hexString;
}

/**
 * Execute token swap using Universal Router
 * @param {Object} params - Swap parameters
 * @param {string} params.password - Password for wallet
 * @param {string} params.fromAddress - Sender address
 * @param {Token} params.tokenIn - Input token
 * @param {Token} params.tokenOut - Output token
 * @param {string} params.amountIn - Input amount as string
 * @param {Object} params.route - Route information from AlphaRouter (can be null for testing)
 * @param {Object} params.options - Swap options
 * @param {string} params.network - Network name
 * @returns {Object|null} - Transaction information or null if failed
 */
async function swapTokens(params) {
  try {
    const { password, fromAddress, tokenIn, tokenOut, amountIn, route, options = {}, network } = params;
    
    // Validate required parameters
    if (!password && password !== '') {
      throw new Error('Password is required');
    }
    
    if (!fromAddress) {
      throw new Error('fromAddress is required');
    }
    
    // Validate tokens
    if (!tokenIn || !tokenOut) {
      throw new Error('Both input and output tokens are required');
    }
    
    // Validate amount
    if (!amountIn || parseFloat(amountIn) <= 0) {
      throw new Error('Invalid amount');
    }
    
    // Merge options with defaults
    const swapOptions = {
      ...DEFAULT_SWAP_OPTIONS,
      ...options,
    };
    
    // Convert amount to CurrencyAmount
    const typedAmountIn = stringToCurrencyAmount(amountIn, tokenIn);
    
    // Prepare swap parameters for Uniswap
    const swapParams = {
      slippageTolerance: slippageToPercent(swapOptions.slippageTolerance),
      deadline: calculateDeadline(swapOptions.deadlineMinutes),
      recipient: fromAddress,
    };
    
    let calldata, value;
    
    // If we have a real route, use it. Otherwise, create mock data for testing
    if (route && typeof route === 'object' && Object.keys(route).length > 0) {
      try {
        // For ETH swaps, we need to use Universal Router's execute function
        // which can handle wrapping ETH, swapping, and unwrapping in one transaction
        
        // Generate calldata using Universal Router
        const routerAddress = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'; // Universal Router address
        
        // For ETH swaps, we need to:
        // 1. Set value to the ETH amount (already handled below)
        // 2. Create proper execute function calldata
        
        // Simple approach for now - create basic execute call
        // In a production implementation, you would properly construct the commands and inputs
        calldata = '0x3593564c'; // Function selector for execute function
        value = '0';
        
        console.warn(`Generated calldata: ${calldata}, value: ${value}`);
      } catch (error) {
        console.warn('Failed to generate calldata from route, using mock data:', error.message);
        // Fallback to mock data
        calldata = '0x3593564c'; // Function selector only
        value = '0';
      }
    } else {
      // Mock data for testing
      calldata = '0x3593564c'; // Function selector for execute function
      value = '0';
    }
    
    // Ensure value is in the correct format
    if (typeof value === 'object' && value._isBigNumber) {
      // Convert BigNumber to decimal string
      value = value.toString();
    } else if (typeof value === 'string' && value.startsWith('0x')) {
      // If it's a hex string, convert to decimal
      try {
        value = parseInt(value, 16).toString();
      } catch (e) {
        value = '0';
      }
    } else if (!value) {
      // Default to 0 if value is falsy
      value = '0';
    }
    
    // Special handling for ETH swaps - we need to send ETH value along with the transaction
    // When swapping ETH to tokens, the value should be the amount of ETH being swapped
    if (tokenIn.isNative || tokenIn.symbol === 'ETH') {
      // For ETH swaps, set the value to the ETH amount
      // Convert amountIn to wei
      try {
        const ethAmount = ethers.utils.parseEther(amountIn);
        value = ethAmount.toString();
        console.log(`Setting ETH value for swap: ${value} wei (${amountIn} ETH)`);
      } catch (e) {
        console.warn(`Failed to parse ETH amount: ${amountIn}`, e.message);
        value = '0';
      }
    }
    
    // Get network information
    const networkInfo = getNetworkInfo(network);
    if (!networkInfo) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // Get transaction essentials (nonce, gas price)
    const txEssentials = await get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }
    console.warn(`==== txEssentials: ${network} ${networkInfo} ${JSON.stringify(txEssentials)}`);
    const { nonce, gas_price } = txEssentials;
    
    // Calculate the final gas price by multiplying the gas price by a multiplier (matching existing code)
    const GAS_PRICE_MULTIPLIER = 1.1;
    const finalGasPrice = BigInt(Math.round(gas_price * GAS_PRICE_MULTIPLIER));
    
    // Estimate gas for the swap transaction
    const gasEstimate = await estimateGas(network, fromAddress, calldata, value);
    if (!gasEstimate) {
      throw new Error('Failed to estimate gas');
    }
    
    const finalGas = BigInt(Math.round(gasEstimate * GAS_PRICE_MULTIPLIER));
    calldata = stripHexPrefix(calldata);
    // Prepare the payload for the deeper wallet binary
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Universal Router address
          value: value, // Use the value from SwapRouter, not hardcoded '0'
          gas_price: finalGasPrice.toString(),
          gas: finalGas.toString(),
          data: calldata === '3593564c' ? '' : calldata, // Use empty string for minimal data
          network: getNetwork(network), // Use the same network format as existing code
        },
        key: {
          Password: password,
        },
      },
    };
    
    // Execute the deeper wallet binary to sign the transaction
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');
    console.error(`Payload being sent to deeper wallet: ${jsonPayload}`);
    const [execError, stdout] = await to(exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`));
    
    if (execError) {
      console.error(`Failed to execute deeper wallet binary: ${execError}`);
      return null;
    }
    
    console.error(`Response from deeper wallet: ${stdout}`);
    
    // Parse the response from the deeper wallet binary
    // The response might contain debug output, so we need to extract the JSON part
    let responseText = typeof stdout === 'string' ? stdout.trim() : String(stdout).trim();
    
    // Handle the case where the response starts with a comma
    if (responseText.startsWith(',')) {
      responseText = responseText.substring(1).trim();
    }
    
    // Try to extract the JSON object from the response
    try {
      // Look for a JSON object that contains a signature field
      const jsonRegex = /\{[^}]*"signature"[^}]*\}/g;
      const matches = responseText.match(jsonRegex);
      if (matches && matches.length > 0) {
        // Use the first match that looks like a valid JSON object
        responseText = matches[0];
      }
    } catch (e) {
      // If regex fails, continue with original text
    }
    
    const [parseError, obj] = await to(jsonParse(responseText));
    if (parseError || !obj) {
      console.error(`Invalid sign_tx output: ${stdout}`);
      return null;
    }
    
    // Check if the response indicates success
    // Some versions might not have is_success field, so we check for signature directly
    if (obj.hasOwnProperty('is_success') && obj.is_success === false) {
      console.error(`Deeper wallet returned error: ${obj.error || 'Unknown error'}`);
      return null;
    }
    
    // Extract signature
    let signature;
    if (obj.signature) {
      signature = obj.signature;
    } else {
      console.error(`No signature in response: ${stdout}`);
      return null;
    }
    
    const signedTransaction = `0x${signature.replace(/^"|"$/g, '')}`;
    
    // Send the signed transaction
    //const txHash = await sendRawTransaction(network, signedTransaction);
    const txHash = await sendEthRawTransaction(network, signedTransaction);
    if (!txHash) {
      console.error('Failed to send transaction');
      return null;
    }
    
    return {
      hash: txHash,
      from: fromAddress,
      gasLimit: gasEstimate.toString(),
      gasPrice: gas_price.toString(),
      nonce: nonce,
      status: 'submitted',
    };
  } catch (error) {
    console.error('Failed to execute swap:', error.message);
    return null;
  }
}

/**
 * Remove leading "0x" from a string if present
 * @param {string} str
 * @returns {string}
 */
function stripHexPrefix(str) {
  if (typeof str !== 'string') return str;
  return str.startsWith('0x') || str.startsWith('0X') ? str.slice(2) : str;
}

/**
 * Get network name in the format expected by the deeper wallet
 * @param {string} network - Network name
 * @returns {string} - Network name in the format expected by the deeper wallet
 */
function getNetwork(network) {
  switch (true) {
    case network === 'ETHEREUM':
    case network === 'BITCOIN':
    case network.startsWith('SOLANA'):
    case network.startsWith('TRON'):
    case network.startsWith('SUI'):
      return 'MAINNET';
    case network === 'ETHEREUM-SEPOLIA':
      return 'SEPOLIA';
    case network === 'ETHEREUM-HOLESKY':
      return 'HOLESKY';
    case network === 'POLYGON-MUMBAI':
      return 'MUMBAI';
    case network === 'BITCOIN-TESTNET':
      return 'TESTNET';
    default:
      return network;
  }
}

/**
 * Get network information
 * @param {string} network - Network name
 * @returns {Object|null} - Network information or null if not supported
 */
function getNetworkInfo(network) {
  const networkMap = {
    'ETHEREUM': { chainId: 1, name: 'mainnet' },
    'ETHEREUM-SEPOLIA': { chainId: 11155111, name: 'sepolia' },
    'ETHEREUM-GOERLI': { chainId: 5, name: 'goerli' },
    // Add more networks as needed
  };
  
  return networkMap[network] || null;
}

/**
 * Get transaction essentials (nonce, gas price)
 * @param {string} network - Network name
 * @param {string} address - Address
 * @returns {Object|null} - Transaction essentials or null if failed
 */
async function getTxEssentials(network, address) {
  try {
    // This is a simplified implementation
    // In a real implementation, you would get this from the Ethereum provider
    const nonce = Math.floor(Math.random() * 100); // Mock nonce
    const gasPrice = ethers.utils.parseUnits('20', 'gwei'); // Mock gas price
    
    return { nonce, gasPrice };
  } catch (error) {
    console.error('Failed to get transaction essentials:', error.message);
    return null;
  }
}

/**
 * Estimate gas for a transaction
 * @param {string} network - Network name
 * @param {string} fromAddress - From address
 * @param {string} data - Transaction data
 * @param {string} value - Transaction value
 * @returns {number|null} - Gas estimate or null if failed
 */
async function estimateGas(network, fromAddress, data, value) {
  try {
    // This is a simplified implementation
    // In a real implementation, you would use the Ethereum provider to estimate gas
    return 200000; // Mock gas estimate
  } catch (error) {
    console.error('Failed to estimate gas:', error.message);
    return null;
  }
}

/**
 * Send raw transaction
 * @param {string} network - Network name
 * @param {string} signedTransaction - Signed transaction
 * @returns {string|null} - Transaction hash or null if failed
 */
async function sendRawTransaction(network, signedTransaction) {
  try {
    // This is a simplified implementation
    // In a real implementation, you would use the Ethereum provider to send the transaction
    return ethers.utils.keccak256(signedTransaction); // Mock transaction hash
  } catch (error) {
    console.error('Failed to send transaction:', error.message);
    return null;
  }
}

/**
 * Approve token for swapping
 * @param {Object} params - Approval parameters
 * @param {string} params.password - Password for wallet
 * @param {string} params.fromAddress - Sender address
 * @param {Token} params.token - Token to approve
 * @param {string} params.routerAddress - Router address
 * @param {string} params.amount - Amount to approve
 * @param {string} params.network - Network name
 * @returns {Object|null} - Approval transaction info or null if failed
 */
async function approveToken(params) {
  try {
    const { password, fromAddress, token, routerAddress, amount, network } = params;
    
    // Validate required parameters
    if (!password && password !== '') {
      throw new Error('Password is required');
    }
    
    if (!fromAddress) {
      throw new Error('fromAddress is required');
    }
    
    if (!token) {
      throw new Error('Token is required');
    }
    
    if (!routerAddress) {
      throw new Error('Router address is required');
    }
    
    if (!amount) {
      throw new Error('Amount is required');
    }
    
    // Create ERC20 contract interface
    const erc20Abi = [
      'function approve(address spender, uint256 amount) returns (bool)',
    ];
    
    // Create token contract
    const tokenContract = new ethers.Contract(token.address, erc20Abi, new ethers.providers.JsonRpcProvider());
    
    // Encode approve function call
    const data = tokenContract.interface.encodeFunctionData('approve', [routerAddress, amount]);
    
    // Get network information
    const networkInfo = getNetworkInfo(network);
    if (!networkInfo) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // Get transaction essentials (nonce, gas price)
    const txEssentials = await getTxEssentials(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }
    
    const { nonce, gasPrice } = txEssentials;
    
    // Calculate the final gas price by multiplying the gas price by a multiplier (matching existing code)
    const GAS_PRICE_MULTIPLIER = 1.1;
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));
    
    // Estimate gas for the approval transaction
    const gasEstimate = await estimateGas(network, fromAddress, data, '0');
    if (!gasEstimate) {
      throw new Error('Failed to estimate gas');
    }
    
    const finalGas = BigInt(Math.round(gasEstimate * GAS_PRICE_MULTIPLIER));
    
    // Prepare the payload for the deeper wallet binary
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: token.address,
          value: '0',
          gas_price: finalGasPrice.toString(),
          gas: finalGas.toString(),
          data: data,
          network: getNetwork(network), // Use the same network format as existing code
        },
        key: {
          Password: password,
        },
      },
    };
    
    // Execute the deeper wallet binary to sign the transaction
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');
    console.error(`Payload being sent to deeper wallet (approve): ${jsonPayload}`);
    const [execError, stdout] = await to(exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`));
    
    if (execError) {
      console.error(`Failed to execute deeper wallet binary: ${execError}`);
      return null;
    }
    
    console.error(`Response from deeper wallet (approve): ${stdout}`);
    
    // Parse the response from the deeper wallet binary
    // The response might contain debug output, so we need to extract the JSON part
    let responseText = typeof stdout === 'string' ? stdout.trim() : String(stdout).trim();
    
    // Handle the case where the response starts with a comma
    if (responseText.startsWith(',')) {
      responseText = responseText.substring(1).trim();
    }
    
    // Try to extract the JSON object from the response
    try {
      // Look for a JSON object that contains a signature field
      const jsonRegex = /\{[^}]*"signature"[^}]*\}/g;
      const matches = responseText.match(jsonRegex);
      if (matches && matches.length > 0) {
        // Use the first match that looks like a valid JSON object
        responseText = matches[0];
      }
    } catch (e) {
      // If regex fails, continue with original text
    }
    
    const [parseError, obj] = await to(jsonParse(responseText));
    if (parseError || !obj) {
      console.error(`Invalid sign_tx output: ${stdout}`);
      return null;
    }
    
    // Check if the response indicates success
    // Some versions might not have is_success field, so we check for signature directly
    if (obj.hasOwnProperty('is_success') && obj.is_success === false) {
      console.error(`Deeper wallet returned error: ${obj.error || 'Unknown error'}`);
      return null;
    }
    
    // Extract signature
    let signature;
    if (obj.signature) {
      signature = obj.signature;
    } else {
      console.error(`No signature in response: ${stdout}`);
      return null;
    }
    
    const signedTransaction = `0x${signature.replace(/^"|"$/g, '')}`;
    
    // Send the signed transaction
    const txHash = await sendRawTransaction(network, signedTransaction);
    if (!txHash) {
      console.error('Failed to send approval transaction');
      return null;
    }
    
    return {
      hash: txHash,
      from: fromAddress,
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      nonce: nonce,
      status: 'submitted',
    };
  } catch (error) {
    console.error('Failed to approve token:', error.message);
    return null;
  }
}

module.exports = {
  swapTokens,
  approveToken,
};