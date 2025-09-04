// Test direct transaction sending with ethers.js
const { ethers } = require('ethers');

async function testDirectTransaction() {
  console.log('Testing direct transaction sending with ethers.js...');
  
  try {
    // Using a public RPC for Sepolia
    const provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    
    // This is just for testing - we won't actually send a real transaction
    // because we don't have the private key
    console.log('Provider initialized successfully');
    
    // Get the current gas price
    const gasPrice = await provider.getGasPrice();
    console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
    
    // Get the transaction count (nonce) for the address
    const address = '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708';
    const nonce = await provider.getTransactionCount(address);
    console.log(`Current nonce for ${address}: ${nonce}`);
    
    console.log('Direct transaction test completed successfully');
  } catch (error) {
    console.error('Error during direct transaction test:', error.message);
  }
}

// Run the test
testDirectTransaction().catch(console.error);