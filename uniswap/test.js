// Test script for Uniswap integration
const { initializeUniswap, getQuote, getPools } = require('./index');

async function testUniswap() {
  console.log('Testing Uniswap integration...');
  
  // Initialize Uniswap for Ethereum mainnet
  const uniswapInstance = initializeUniswap('ETHEREUM');
  if (!uniswapInstance) {
    console.error('Failed to initialize Uniswap');
    return;
  }
  
  console.log('Uniswap initialized successfully');
  
  // Example token information (WETH and USDT on Ethereum mainnet)
  const wethInfo = {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chainId: 1,
    symbol: 'WETH',
    decimals: 18,
    name: 'Wrapped Ether'
  };
  
  const usdtInfo = {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chainId: 1,
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD'
  };
  
  // Test getting pool information
  console.log('Getting pool information...');
  const pools = await getPools(uniswapInstance, wethInfo, usdtInfo);
  if (pools) {
    console.log(`Found ${pools.length} pools:`);
    pools.forEach((pool, index) => {
      console.log(`  Pool ${index + 1}: Fee ${pool.feeTier}, Liquidity ${pool.liquidity}`);
    });
  } else {
    console.log('No pools found');
  }
  
  // Test getting a quote
  console.log('Getting swap quote...');
  const quote = await getQuote(uniswapInstance, wethInfo, usdtInfo, '1000000000000000000'); // 1 WETH
  if (quote) {
    console.log(`Quote: ${quote.amountIn} WETH -> ${quote.amountOut} USDT`);
    console.log(`Price impact: ${quote.priceImpact}%`);
    console.log(`Gas estimate: ${quote.gasEstimate}`);
  } else {
    console.log('Failed to get quote');
  }
  
  console.log('Uniswap integration test completed');
}

// Run the test
testUniswap().catch(console.error);