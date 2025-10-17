/**
 * Uniswap Subgraph 功能测试文件
 * 用于测试各种 subgraph 查询功能
 */

const { 
  getV2PoolInfo, 
  getV3PoolInfo, 
  getV4PoolInfo, 
  getUniswapTokenInfo, 
  getUniswapTopPools, 
  searchUniswapPoolsBySymbol 
} = require('./deeperWallet');

// 常用代币地址
const TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
};

async function testV2PoolInfo() {
  console.log('\n=== 测试 V2 池子查询 ===');
  
  try {
    const result = await getV2PoolInfo( TOKENS.USDC,TOKENS.WETH, 'mainnet');
    console.log('V2 WETH/USDC 池子信息:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('V2 池子查询失败:', error.message);
  }
}

async function testV3PoolInfo() {
  console.log('\n=== 测试 V3 池子查询 ===');
  
  try {
    const result = await getV3PoolInfo(TOKENS.WETH, TOKENS.USDC, 'mainnet');
    console.log('V3 WETH/USDC 池子信息:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('V3 池子查询失败:', error.message);
  }
}

async function testV4PoolInfo() {
  console.log('\n=== 测试 V4 池子查询 ===');
  
  try {
    const result = await getV4PoolInfo(TOKENS.WETH, TOKENS.USDC, 'mainnet');
    console.log('V4 WETH/USDC 池子信息:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('V4 池子查询失败:', error.message);
  }
}

async function testTokenInfo() {
  console.log('\n=== 测试代币信息查询 ===');
  
  try {
    const result = await getUniswapTokenInfo(TOKENS.USDC, 'v3', 'mainnet');
    console.log('USDC 代币信息:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('代币信息查询失败:', error.message);
  }
}

async function testTopPools() {
  console.log('\n=== 测试热门池子查询 ===');
  
  try {
    const result = await getUniswapTopPools('v3', 'mainnet', 5);
    console.log('V3 主网热门池子 (前5个):');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('热门池子查询失败:', error.message);
  }
}

async function testSearchPools() {
  console.log('\n=== 测试池子搜索功能 ===');
  
  try {
    const result = await searchUniswapPoolsBySymbol('UNI', 'v3', 'mainnet', 3);
    console.log('包含 "UNI" 的池子 (前3个):');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('池子搜索失败:', error.message);
  }
}

async function testMultipleNetworks() {
  console.log('\n=== 测试多网络支持 ===');
  
  const networks = ['mainnet', 'polygon', 'arbitrum'];
  
  for (const network of networks) {
    try {
      console.log(`\n--- ${network} 网络 ---`);
      const result = await getV3PoolInfo(TOKENS.WETH, TOKENS.USDC, network);
      console.log(`${network} V3 WETH/USDC 池子数量:`, result.pools?.length || 0);
    } catch (error) {
      console.error(`${network} 网络查询失败:`, error.message);
    }
  }
}

async function testErrorHandling() {
  console.log('\n=== 测试错误处理 ===');
  
  // 测试无效代币地址
  try {
    await getV3PoolInfo('invalid_address', TOKENS.USDC, 'mainnet');
  } catch (error) {
    console.log('无效地址错误处理正常:', error.message);
  }
  
  // 测试不支持的网络
  try {
    await getV4PoolInfo(TOKENS.WETH, TOKENS.USDC, 'unsupported_network');
  } catch (error) {
    console.log('不支持网络错误处理正常:', error.message);
  }
}

async function runAllTests() {
  console.log('开始 Uniswap Subgraph 功能测试...\n');
  
  await testV2PoolInfo();
  await testV3PoolInfo();
  await testV4PoolInfo();
  await testTokenInfo();
  await testTopPools();
  await testSearchPools();
  await testMultipleNetworks();
  await testErrorHandling();
  
  console.log('\n测试完成！');
}

// 如果直接运行此文件，执行所有测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testV2PoolInfo,
  testV3PoolInfo,
  testV4PoolInfo,
  testTokenInfo,
  testTopPools,
  testSearchPools,
  testMultipleNetworks,
  testErrorHandling,
  runAllTests
};