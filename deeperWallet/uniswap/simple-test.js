// Simple test file to verify the functionality of the refactored Uniswap module
try {
  const uniswap = require('./index.js');
  console.log('Module loaded successfully');
  
  // Test constants
  console.log('UNISWAP_V2_ROUTER:', uniswap.UNISWAP_V2_ROUTER);
  console.log('Module test completed successfully');
} catch (error) {
  console.error('Error loading module:', error.message);
  console.error('Stack trace:', error.stack);
}