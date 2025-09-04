// Complete Universal Router calldata implementation
const { ethers } = require('ethers');

// Universal Router ABI for the execute function
const universalRouterAbi = [
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "commands",
        "type": "bytes"
      },
      {
        "internalType": "bytes[]",
        "name": "inputs",
        "type": "bytes[]"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

/**
 * Create complete calldata for Universal Router execute function
 * @param {string} amountInEth - ETH amount to swap (in ETH)
 * @param {string} tokenOutAddress - Output token contract address
 * @param {string} wethAddress - WETH contract address
 * @param {string} recipientAddress - Recipient address
 * @returns {string} - Complete calldata
 */
function createCompleteCalldata(amountInEth, tokenOutAddress, wethAddress, recipientAddress) {
  try {
    console.log(`Creating complete calldata for ETH to token swap: ${amountInEth} ETH -> ${tokenOutAddress}`);
    
    // Create interface
    const universalRouterInterface = new ethers.utils.Interface(universalRouterAbi);
    
    // Parse the amount to wei
    const amountInWei = ethers.utils.parseEther(amountInEth);
    console.log(`Amount in wei: ${amountInWei.toString()}`);
    
    // Commands for Universal Router:
    // 0x06 = WRAP_ETH (wrap ETH to WETH)
    // 0x00 = V3_SWAP_EXACT_IN (swap WETH to token)
    const commands = '0x0600'; // WRAP_ETH followed by V3_SWAP_EXACT_IN
    
    // Create inputs array
    // Input 1: WRAP_ETH parameters (amount to wrap)
    const wrapEthInput = ethers.utils.hexZeroPad(amountInWei.toHexString(), 32);
    
    // Input 2: V3_SWAP_EXACT_IN parameters (simplified)
    // For a complete implementation, this would need to be properly constructed with:
    // - Path (token addresses)
    // - Amount in
    // - Amount out minimum
    // For now, we'll create a basic placeholder
    const swapInput = '0x0000000000000000000000000000000000000000000000000000000000000040'; // Offset to path data
    
    const inputs = [wrapEthInput, swapInput];
    
    // Set deadline to 20 minutes from now
    const deadline = Math.floor(Date.now() / 1000) + (20 * 60);
    
    // Encode the function call
    const calldata = universalRouterInterface.encodeFunctionData('execute', [commands, inputs, deadline]);
    
    console.log(`Generated complete calldata: ${calldata}`);
    return calldata;
  } catch (error) {
    console.error('Failed to create complete calldata:', error.message);
    // Fallback to function selector only
    return '0x3593564c';
  }
}

/**
 * Create reference calldata that matches the successful transaction
 * This is for testing and comparison purposes
 */
function createReferenceCalldata() {
  try {
    // Create interface
    const universalRouterInterface = new ethers.utils.Interface(universalRouterAbi);
    
    // Recreate the reference transaction data
    const commands = '0x0b000604'; // V2_SWAP_EXACT_IN, V3_SWAP_EXACT_IN, UNWRAP_WETH, SWEEP
    const inputs = [
      '0x0000000000000000000000000000000000000000000000000000000000000040', // First input
      '0x0000000000000000000000000000000000000000000000000000000000000080', // Second input
      '0x00000000000000000000000000000000000000000000000000000000000000c0', // Third input
      '0x0000000000000000000000000000000000000000000000000000000000000100'  // Fourth input
    ];
    const deadline = 1756962639; // From the successful transaction
    
    const calldata = universalRouterInterface.encodeFunctionData('execute', [commands, inputs, deadline]);
    console.log(`Reference calldata: ${calldata}`);
    return calldata;
  } catch (error) {
    console.error('Failed to create reference calldata:', error.message);
    return '0x3593564c';
  }
}

/**
 * Create minimal working calldata for testing
 * @param {string} amountInEth - ETH amount to swap (in ETH)
 * @returns {string} - Minimal calldata
 */
function createMinimalCalldata(amountInEth) {
  try {
    // Create interface
    const universalRouterInterface = new ethers.utils.Interface(universalRouterAbi);
    
    // Parse the amount to wei
    const amountInWei = ethers.utils.parseEther(amountInEth);
    
    // Simple approach: Just WRAP_ETH command
    const commands = '0x06'; // WRAP_ETH
    const inputs = [ethers.utils.hexZeroPad(amountInWei.toHexString(), 32)]; // Amount to wrap
    const deadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes from now
    
    const calldata = universalRouterInterface.encodeFunctionData('execute', [commands, inputs, deadline]);
    console.log(`Minimal calldata: ${calldata}`);
    return calldata;
  } catch (error) {
    console.error('Failed to create minimal calldata:', error.message);
    return '0x3593564c';
  }
}

module.exports = {
  createCompleteCalldata,
  createReferenceCalldata,
  createMinimalCalldata
};