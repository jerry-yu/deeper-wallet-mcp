// Test USDC swap specifically
const { swapEthToToken } = require('./uniswap/eth-swap');

async function testUsdcSwap() {
  console.log('Testing ETH to USDC swap...');
  
  try {
    // Test parameters for Sepolia network - USDC specific
    const params = {
      password: '', // Empty password as in the example
      fromAddress: '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // Test address
      amountIn: '0.001', // 0.001 ETH
      tokenOutAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
      tokenOutDecimals: 6, // USDC has 6 decimals
      network: 'ETHEREUM-SEPOLIA'
    };
    
    console.log('Executing ETH to USDC swap...');
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
    console.error('Error during ETH to USDC swap test:', error.message);
  }
}

// Run the test
testUsdcSwap().catch(console.error);