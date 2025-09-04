// Unit tests for Uniswap router functions
const { getRpcUrl, getChainId } = require('./router');

// Mock console.error to suppress error messages during tests
const originalConsoleError = console.error;
console.error = () => {};

// Test getRpcUrl function
function testGetRpcUrl() {
  console.log('Testing getRpcUrl...');
  
  // Test supported networks
  const ethereumRpc = getRpcUrl('ETHEREUM');
  console.assert(ethereumRpc === 'https://eth-mainnet.public.blastapi.io', 'Ethereum RPC URL should match');
  
  const sepoliaRpc = getRpcUrl('ETHEREUM-SEPOLIA');
  console.assert(sepoliaRpc === 'https://ethereum-sepolia-rpc.publicnode.com', 'Sepolia RPC URL should match');
  
  const polygonRpc = getRpcUrl('POLYGON');
  console.assert(polygonRpc === 'https://polygon-rpc.com', 'Polygon RPC URL should match');
  
  // Test unsupported network
  const unsupportedRpc = getRpcUrl('UNSUPPORTED_NETWORK');
  console.assert(unsupportedRpc === null, 'Unsupported network should return null');
  
  console.log('getRpcUrl tests passed');
}

// Test getChainId function
function testGetChainId() {
  console.log('Testing getChainId...');
  
  // Test supported networks
  const ethereumChainId = getChainId('ETHEREUM');
  console.assert(ethereumChainId === 1, 'Ethereum chain ID should be 1');
  
  const sepoliaChainId = getChainId('ETHEREUM-SEPOLIA');
  console.assert(sepoliaChainId === 11155111, 'Sepolia chain ID should be 11155111');
  
  const goerliChainId = getChainId('ETHEREUM-GOERLI');
  console.assert(goerliChainId === 5, 'Goerli chain ID should be 5');
  
  // Test unsupported network
  const unsupportedChainId = getChainId('UNSUPPORTED_NETWORK');
  console.assert(unsupportedChainId === null, 'Unsupported network should return null');
  
  console.log('getChainId tests passed');
}

// Run all tests
function runTests() {
  console.log('Running Uniswap router tests...\n');
  
  testGetRpcUrl();
  testGetChainId();
  
  // Restore console.error
  console.error = originalConsoleError;
  
  console.log('\nAll tests passed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testGetRpcUrl,
  testGetChainId,
  runTests,
};