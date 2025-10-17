/**
 * Uniswap Subgraph 功能演示
 */

const {
  getV2PoolInfo,
  getV3PoolInfo,
  getV4PoolInfo,
  getTokenInfo,
  getTopPools,
  searchPoolsBySymbol
} = require('./deeperWallet/uniswap-subgraph.js');

// 常用代币地址
const TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
};

async function demo() {
  // console.log('🚀 Uniswap Subgraph 功能演示\n');

  // // 1. 获取热门V3池子
  // console.log('📊 获取热门 V3 池子 (前5个)');
  // console.log('=' .repeat(50));
  // try {
  //   const version = 'v2';
  //   let pools;
  //   const topPools = await getTopPools(version, 'mainnet', 5);
  //   if (version === 'v2') {
  //     pools = topPools.pairs;
  //   } else {
  //     pools = topPools.pools;
  //   }

  //   pools.forEach((pool, index) => {
  //     const tvl = parseFloat(pool.totalValueLockedUSD);
  //     console.log(`${index + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
  //     console.log(`   TVL: $${tvl.toLocaleString()}`);
  //     console.log(`   Fee: ${pool.feeTier / 10000}%`);
  //     console.log('');
  //   });
  // } catch (error) {
  //   console.error('❌ 获取热门池子失败:', error.message);
  // }

  // // 2. 查询特定交易对的池子信息
  // console.log('🔍 查询 WETH/USDC 交易对');
  // console.log('=' .repeat(50));
  // try {
  //   const v3Pools = await getV3PoolInfo( TOKENS.USDC.toLowerCase(), TOKENS.WETH.toLowerCase(),'mainnet');
  //   console.log(`找到 ${v3Pools.pools.length} 个 V3 池子:`);
  //   v3Pools.pools.slice(0, 3).forEach((pool, index) => {
  //     const tvl = parseFloat(pool.totalValueLockedUSD);
  //     console.log(`${index + 1}. Fee: ${pool.feeTier / 10000}% | TVL: $${tvl.toLocaleString()}`);
  //   });
  //   console.log('');
  // } catch (error) {
  //   console.error('❌ 查询交易对失败:', error.message);
  // }

  // // 3. 搜索包含特定代币的池子
  // console.log('🔎 搜索包含 "UNI" 的池子');
  // console.log('='.repeat(50));
  // try {
  //   const version = 'v2';
  //   let pools;
  //   const uniPools = await searchPoolsBySymbol('UNI', version, 'mainnet', 3);
  //   if (version === 'v2') {
  //     pools = uniPools.pairs;
  //   } else {
  //     pools = uniPools.pools;
  //   }

  //   pools.forEach((pool, index) => {
  //     const tvl = parseFloat(pool.totalValueLockedUSD);
  //     console.log(`${index + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
  //     console.log(`   TVL: $${tvl.toLocaleString()}`);
  //     console.log('');
  //   });
  // } catch (error) {
  //   console.error('❌ 搜索池子失败:', error.message);
  // }

  // 4. 获取代币详细信息
  console.log('📈 获取 USDC 代币信息');
  console.log('=' .repeat(50));
  try {
    const tokenInfo = await getTokenInfo('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'v3', 'bsc');
    if (tokenInfo.token) {
      const token = tokenInfo.token;
      console.log(`名称: ${token.name}`);
      console.log(`符号: ${token.symbol}`);
      console.log(`精度: ${token.decimals}`);
      console.log(`总供应量: ${parseFloat(token.totalSupply).toLocaleString()}`);
      console.log(`24h交易量: $${parseFloat(token.volumeUSD).toLocaleString()}`);
      console.log(`TVL: $${parseFloat(token.totalValueLockedUSD).toLocaleString()}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ 获取代币信息失败:', error.message);
  }

  // // 5. 比较不同版本的池子
  // console.log('⚖️  比较 V2 vs V3 池子 (WETH/USDC)');
  // console.log('=' .repeat(50));
  // try {
  //   const [v2Result, v3Result,v4Result] = await Promise.all([
  //     getV2PoolInfo(TOKENS.WETH, TOKENS.USDC, 'mainnet'),
  //     getV3PoolInfo(TOKENS.WETH, TOKENS.USDC, 'mainnet'),
  //     getV4PoolInfo(TOKENS.WETH, TOKENS.USDC, 'mainnet')
  //   ]);

  //   //console.log(v4Result.pools);
  //   console.log(`V4 池子数量: ${v4Result.pools?.length || 0}`);
  //   if (v4Result.pools && v4Result.pools.length > 0) {
  //     const totalV4TVL = v4Result.pools.reduce((sum, pool) => 
  //       sum + parseFloat(pool.totalValueLockedUSD), 0);
  //     console.log(`V4 总TVL: $${totalV4TVL.toLocaleString()}`);
  //   }

  //   console.log(`V2 池子数量: ${v2Result.pairs?.length || 0}`);
  //   if (v2Result.pairs && v2Result.pairs.length > 0) {
  //     const v2Pool = v2Result.pairs[0];
  //     console.log(`V2 储备量: $${parseFloat(v2Pool.reserveUSD).toLocaleString()}`);
  //   }

  //   console.log(`V3 池子数量: ${v3Result.pools?.length || 0}`);
  //   if (v3Result.pools && v3Result.pools.length > 0) {
  //     const totalV3TVL = v3Result.pools.reduce((sum, pool) => 
  //       sum + parseFloat(pool.totalValueLockedUSD), 0);
  //     console.log(`V3 总TVL: $${totalV3TVL.toLocaleString()}`);
  //   }
  //   console.log('');
  // } catch (error) {
  //   console.error('❌ 比较池子失败:', error.message);
  // }

  console.log('✅ 演示完成！');
}

demo().catch(console.error);