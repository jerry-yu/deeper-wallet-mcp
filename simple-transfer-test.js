// Test the deeper wallet with a simple ETH transfer
const { ethers } = require('ethers');
const to = require('await-to-js').default;
const { exec, jsonParse } = require('./deeperWallet/utils');
const { sendEthRawTransaction, get_tx_essential_elem } = require('./deeperWallet/eth');

// Path to the deeper wallet binary
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

async function testSimpleTransfer() {
  console.log('Testing simple ETH transfer with deeper wallet...');
  
  try {
    const params = {
      password: '', // Empty password as in the example
      fromAddress: '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // Test address
      toAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // Any address
      amountEth: '0.001', // 0.001 ETH
      network: 'ETHEREUM-SEPOLIA'
    };
    
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    // Convert ETH amount to wei
    const amountWei = ethers.utils.parseEther(params.amountEth);
    
    // Get transaction essentials (nonce, gas price)
    const txEssentials = await get_tx_essential_elem(params.network, params.fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }
    
    const { nonce, gas_price } = txEssentials;
    
    // Calculate the final gas price by multiplying the gas price by a multiplier
    const GAS_PRICE_MULTIPLIER = 1.1;
    const finalGasPrice = BigInt(Math.round(gas_price * GAS_PRICE_MULTIPLIER));
    
    // Estimate gas for a simple transfer
    const gasEstimate = 21000; // Standard gas for ETH transfer
    const finalGas = BigInt(Math.round(gasEstimate * GAS_PRICE_MULTIPLIER));
    
    // Prepare the payload for the deeper wallet binary
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: params.fromAddress,
        input: {
          nonce: nonce.toString(),
          to: params.toAddress,
          value: amountWei.toString(), // Send ETH with the transaction
          gas_price: finalGasPrice.toString(),
          gas: finalGas.toString(),
          data: '0x', // No data for simple ETH transfer
          network: getNetwork(params.network), // Use the same network format as existing code
        },
        key: {
          Password: params.password,
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
    
    const signedTransaction = `0x${signature.replace(/^"|"$]/g, '')}`;
    
    // Send the signed transaction
    const txHash = await sendEthRawTransaction(params.network, signedTransaction);
    if (!txHash) {
      console.error('Failed to send transaction');
      return null;
    }
    
    console.log('Simple ETH transfer executed successfully!');
    console.log('Transaction hash:', txHash);
    
    return {
      hash: txHash,
      from: params.fromAddress,
      to: params.toAddress,
      value: params.amountEth,
      gasLimit: gasEstimate.toString(),
      gasPrice: gas_price.toString(),
      nonce: nonce,
      status: 'submitted',
    };
  } catch (error) {
    console.error('Error during simple ETH transfer test:', error.message);
    return null;
  }
}

// Run the test
testSimpleTransfer().catch(console.error);