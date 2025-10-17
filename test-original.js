try {
  const uniswap = require('./deeperWallet/uniswap.js');
  console.log('UNISWAP_V2_ROUTER:', uniswap.UNISWAP_V2_ROUTER);
  console.log('Module loaded successfully');
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}