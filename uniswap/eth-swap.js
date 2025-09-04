const { ethers } = require('ethers');
const to = require('await-to-js').default;
const { exec, jsonParse } = require('../deeperWallet/utils');
const { sendEthRawTransaction, get_tx_essential_elem } = require('../deeperWallet/eth');
const { createUniversalRouterCalldata } = require('./calldata');

// Path to the deeper wallet binary - using forward slashes to avoid encoding issues
const DEEPER_WALLET_BIN_PATH = 'D:/git_resp/hd-wallet/target/release/hd-wallet.exe';

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
 * Get WETH address for a given network
 * @param {string} network - Network name
 * @returns {string} - WETH contract address
 */
function getWethAddress(network) {
  switch (network.toUpperCase()) {
    case 'ETHEREUM':
    case 'ETHEREUM-MAINNET':
      return '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Mainnet WETH
    case 'ETHEREUM-SEPOLIA':
      return '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
    case 'ETHEREUM-GOERLI':
      return '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'; // Goerli WETH
    default:
      return '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Default to Mainnet WETH
  }
}

/**
 * Execute ETH to token swap using Universal Router
 * @param {Object} params - Swap parameters
 * @param {string} params.password - Password for wallet
 * @param {string} params.fromAddress - Sender address
 * @param {string} params.amountIn - ETH amount to swap (in ETH)
 * @param {string} params.tokenOutAddress - Output token contract address
 * @param {number} params.tokenOutDecimals - Output token decimals
 * @param {string} params.network - Network name
 * @returns {Object|null} - Transaction information or null if failed
 */
async function swapEthToToken(params) {
  try {
    const { password, fromAddress, amountIn, tokenOutAddress, tokenOutDecimals, network } = params;
    
    // Validate required parameters
    if (!password && password !== '') {
      throw new Error('Password is required');
    }
    
    if (!fromAddress) {
      throw new Error('fromAddress is required');
    }
    
    if (!amountIn || parseFloat(amountIn) <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (!tokenOutAddress) {
      throw new Error('tokenOutAddress is required');
    }
    
    if (typeof tokenOutDecimals !== 'number' || tokenOutDecimals < 0) {
      throw new Error('tokenOutDecimals is required and must be a non-negative number');
    }
    
    // Universal Router contract address on Sepolia
    const routerAddress = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
    
    // Convert ETH amount to wei
    const amountInWei = ethers.utils.parseEther(amountIn);
    
    // Create enhanced calldata for ETH to token swap
    // This creates a more sophisticated Universal Router execute call
    const wethAddress = getWethAddress(network);
    const { createEnhancedCalldata } = require('./enhanced-calldata');
    const calldata = createEnhancedCalldata(amountIn, tokenOutAddress, wethAddress, fromAddress);
    
    // For compatibility with deeper wallet, we might need to use empty data
    // Let's check if deeper wallet prefers empty data or full calldata
    const useEmptyData = false; // Set to false to use full calldata
    const finalCalldata = useEmptyData ? '' : calldata;
    
    // Get transaction essentials (nonce, gas price)
    const txEssentials = await get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }
    
    const { nonce, gas_price } = txEssentials;
    
    // Calculate the final gas price by multiplying the gas price by a multiplier
    const GAS_PRICE_MULTIPLIER = 1.1;
    const finalGasPrice = BigInt(Math.round(gas_price * GAS_PRICE_MULTIPLIER));
    
    // Estimate gas for the swap transaction
    const gasEstimate = await estimateGas(network, fromAddress, calldata, amountInWei.toString());
    if (!gasEstimate) {
      throw new Error('Failed to estimate gas');
    }
    
    const finalGas = BigInt(Math.round(gasEstimate * GAS_PRICE_MULTIPLIER));
    
    // Log the calldata for debugging
    console.log(`Final calldata length: ${finalCalldata.length}`);
    console.log(`Final calldata preview: ${finalCalldata.substring(0, 100)}...`);
    
    // Prepare the payload for the deeper wallet binary
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: routerAddress,
          value: amountInWei.toString(), // Send ETH with the transaction
          gas_price: finalGasPrice.toString(),
          gas: finalGas.toString(),
          data: finalCalldata.startsWith('0x') ? finalCalldata.substring(2) : finalCalldata, // Remove '0x' prefix
          network: getNetwork(network), // Use the same network format as existing code
        },
        key: {
          Password: password,
        },
      },
    };
    
    console.log(`Payload data length: ${payload.param.input.data.length}`);
    
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
    console.error('Failed to execute ETH to token swap:', error.message);
    return null;
  }
}

/**
 * Create calldata for Universal Router execute function
 * @param {string} amountIn - ETH amount to swap (in ETH)
 * @param {string} wethAddress - WETH contract address
 * @param {string} tokenOutAddress - Output token address
 * @returns {string} - Calldata for execute function
 */
function createUniversalRouterCalldataWrapper(amountIn, wethAddress, tokenOutAddress) {
  try {
    // Use the imported function
    const { createUniversalRouterCalldata: createCalldata } = require('./calldata');
    return createCalldata(amountIn, wethAddress, tokenOutAddress);
  } catch (error) {
    console.error('Failed to create Universal Router calldata:', error.message);
    return '0x3593564c'; // Function selector only
  }
}

/**
 * Get WETH address for a given network
 * @param {string} network - Network name
 * @returns {string} - WETH contract address
 */
function getWethAddress(network) {
  switch (network.toUpperCase()) {
    case 'ETHEREUM':
    case 'ETHEREUM-MAINNET':
      return '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Mainnet WETH
    case 'ETHEREUM-SEPOLIA':
      return '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
    case 'ETHEREUM-GOERLI':
      return '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'; // Goerli WETH
    default:
      return '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Default to Mainnet WETH
  }
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

module.exports = {
  swapEthToToken
};