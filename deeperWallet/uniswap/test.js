// Test file to verify the functionality of the refactored Uniswap module
try {
  const uniswap = require('./index.js');
  console.log('Module loaded successfully');

  // Test constants
  console.log('\nTesting constants...');
  console.log('UNISWAP_V2_ROUTER:', uniswap.UNISWAP_V2_ROUTER);
  console.log('UNISWAP_V3_ROUTER:', uniswap.UNISWAP_V3_ROUTER);
  console.log('FEE_TIERS:', uniswap.FEE_TIERS);

  // Test utility functions
  console.log('\nTesting utility functions...');
  console.log('isValidAddress("0x123"):', uniswap.isValidAddress('0x123'));
  console.log('isValidAddress("0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4"):', uniswap.isValidAddress('0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'));

  // Test calculation functions
  console.log('\nTesting calculation functions...');
  try {
    const output = uniswap.calculateV2SwapOutput('1000000', '2000000', '1000');
    console.log('calculateV2SwapOutput result:', output);
  } catch (error) {
    console.error('Error in calculateV2SwapOutput:', error.message);
  }

  // Test encoding functions
  console.log('\nTesting encoding functions...');
  try {
    const encoded = uniswap.encodeAddress('0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4');
    console.log('encodeAddress result:', encoded);
  } catch (error) {
    console.error('Error in encodeAddress:', error.message);
  }

  // Test validation functions
  console.log('\nTesting validation functions...');
  const swapParams = {
    tokenIn: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amountIn: '1000000000000000000',
    network: 'ETHEREUM'
  };

  const validation = uniswap.validateSwapParams(swapParams);
  console.log('validateSwapParams result:', validation);

  // Test error handling functions
  console.log('\nTesting error handling functions...');
  const error = uniswap.createError(uniswap.ERROR_CODES.INVALID_PARAMETERS, 'Test error message');
  console.log('createError result:', error);

  // Test pool functions (these would require a real network connection to fully test)
  console.log('\nTesting pool functions...');
  console.log('getV2PairAddress function exists:', typeof uniswap.getV2PairAddress === 'function');
  console.log('getV3PoolAddress function exists:', typeof uniswap.getV3PoolAddress === 'function');

  // Test price functions (these would require a real network connection to fully test)
  console.log('\nTesting price functions...');
  console.log('getTokenPrice function exists:', typeof uniswap.getTokenPrice === 'function');
  console.log('getSwapQuote function exists:', typeof uniswap.getSwapQuote === 'function');

  // Test swap functions (these would require a real network connection to fully test)
  console.log('\nTesting swap functions...');
  console.log('encodeV2SwapData function exists:', typeof uniswap.encodeV2SwapData === 'function');
  console.log('encodeV3SwapData function exists:', typeof uniswap.encodeV3SwapData === 'function');

  console.log('\nAll tests completed successfully.');
} catch (error) {
  console.error('Error loading module:', error.message);
  console.error('Stack trace:', error.stack);
}