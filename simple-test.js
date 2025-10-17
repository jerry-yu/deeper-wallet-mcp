/**
 * 简单测试 Uniswap Subgraph 功能
 */

const { 
  getV3PoolInfo,
  getUniswapTopPools,
  searchUniswapPoolsBySymbol
} = require('./deeperWallet/uniswap-subgraph.js');

async function simpleTest() {
  console.log('开始简单测试...\n');
  
  // 测试获取热门池子
  try {
    console.log('=== 测试获取热门 V3 池子 ===');
    const topPools = await getUniswapTopPools('v3', 'mainnet', 3);
    console.log('成功获取热门池子:', topPools.pools?.length || 0, '个');
    if (topPools.pools && topPools.pools.length > 0) {
      console.log('第一个池子:', topPools.pools[0].token0.symbol, '/', topPools.pools[0].token1.symbol);
    }
  } catch (error) {
    console.error('获取热门池子失败:', error.message);
  }
  
  console.log('\n');
  
  // 测试搜索池子
  try {
    console.log('=== 测试搜索包含 USDC 的池子 ===');
    const searchResult = await searchUniswapPoolsBySymbol('USDC', 'v3', 'mainnet', 2);
    console.log('成功搜索到池子:', searchResult.pools?.length || 0, '个');
    if (searchResult.pools && searchResult.pools.length > 0) {
      console.log('第一个池子:', searchResult.pools[0].token0.symbol, '/', searchResult.pools[0].token1.symbol);
    }
  } catch (error) {
    console.error('搜索池子失败:', error.message);
  }
  
  console.log('\n测试完成！');
}

simpleTest().catch(console.error);