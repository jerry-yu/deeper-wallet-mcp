// Test ETH to token swap functionality
const { swapEthToToken } = require('./uniswap/eth-swap');

async function testEthSwap() {
  console.log('Testing ETH to token swap...');
  
  try {
    // Test parameters for Sepolia network
    const params = {
      password: '', // Empty password as in the example
      fromAddress: '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // Test address
      amountIn: '0.001', // 0.001 ETH
      tokenOutAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI token on Sepolia
      tokenOutDecimals: 18, // UNI has 18 decimals
      network: 'ETHEREUM-SEPOLIA'
    };
    
    console.log('Executing ETH to UNI swap...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const result = await swapEthToToken(params);
    
    if (result) {
      console.log('Swap executed successfully!');
      console.log('Transaction hash:', result.hash);
      console.log('From address:', result.from);
      console.log('Gas limit:', result.gasLimit);
      console.log('Gas price:', result.gasPrice);
      console.log('Nonce:', result.nonce);
      console.log('Status:', result.status);
    } else {
      console.log('Failed to execute swap');
    }
  } catch (error) {
    console.error('Error during ETH swap test:', error.message);
  }
}

// Run the test
testEthSwap().catch(console.error);