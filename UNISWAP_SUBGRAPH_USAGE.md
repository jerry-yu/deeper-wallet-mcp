# Uniswap Subgraph 查询功能使用指南

本项目已集成了 Uniswap V2、V3、V4 的 subgraph 查询功能，可以查询池子信息、代币信息等。

## 功能概述

### 1. 查询两个代币的池子信息

#### V2 池子查询
```javascript
// 查询 USDC/WETH 在主网上的 V2 池子
getUniswapV2PoolInfo({
  token0Address: "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C",
  token1Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  network: "mainnet"
})
```

#### V3 池子查询
```javascript
// 查询 USDC/WETH 在主网上的 V3 池子
getUniswapV3PoolInfo({
  token0Address: "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C",
  token1Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  network: "mainnet"
})
```

#### V4 池子查询
```javascript
// 查询 USDC/WETH 在主网上的 V4 池子
getUniswapV4PoolInfo({
  token0Address: "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C",
  token1Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  network: "mainnet"
})
```

### 2. 查询代币详细信息

```javascript
// 查询 USDC 代币信息
getUniswapTokenInfo({
  tokenAddress: "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C",
  version: "v3",
  network: "mainnet"
})
```

### 3. 获取热门池子

```javascript
// 获取 V3 主网上 TVL 最高的 10 个池子
getUniswapTopPools({
  version: "v3",
  network: "mainnet",
  limit: 10
})
```

### 4. 按代币符号搜索池子

```javascript
// 搜索包含 "USDC" 的池子
searchUniswapPoolsBySymbol({
  symbol: "USDC",
  version: "v3",
  network: "mainnet",
  limit: 5
})
```

## 支持的网络

### V2 支持的网络
- mainnet (以太坊主网)
- polygon (Polygon)
- arbitrum (Arbitrum)
- optimism (Optimism)

### V3 支持的网络
- mainnet (以太坊主网)
- polygon (Polygon)
- arbitrum (Arbitrum)
- optimism (Optimism)
- base (Base)
- bnb (BNB Chain)

### V4 支持的网络
- mainnet (以太坊主网)

## 返回数据格式

### V2 池子信息
```json
{
  "pairs": [
    {
      "id": "0x...",
      "token0": {
        "id": "0x...",
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": "6"
      },
      "token1": {
        "id": "0x...",
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "decimals": "18"
      },
      "reserve0": "1000000",
      "reserve1": "500000000000000000",
      "reserveUSD": "2000000",
      "totalSupply": "1000000000000000000",
      "volumeUSD": "10000000",
      "txCount": "50000"
    }
  ]
}
```

### V3 池子信息
```json
{
  "pools": [
    {
      "id": "0x...",
      "token0": {
        "id": "0x...",
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": "6"
      },
      "token1": {
        "id": "0x...",
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "decimals": "18"
      },
      "feeTier": "3000",
      "liquidity": "1000000000000000000",
      "sqrtPrice": "1000000000000000000",
      "tick": "100",
      "token0Price": "2000",
      "token1Price": "0.0005",
      "volumeUSD": "10000000",
      "totalValueLockedUSD": "5000000"
    }
  ]
}
```

## 使用示例

### 查找 ETH/USDC 交易对
```javascript
// 使用已知的代币地址
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C";

// 查询 V3 池子
const v3Pools = await getUniswapV3PoolInfo({
  token0Address: WETH,
  token1Address: USDC,
  network: "mainnet"
});

// 查询 V2 池子
const v2Pools = await getUniswapV2PoolInfo({
  token0Address: WETH,
  token1Address: USDC,
  network: "mainnet"
});
```

### 查找热门代币的池子
```javascript
// 搜索包含 "UNI" 的池子
const uniPools = await searchUniswapPoolsBySymbol({
  symbol: "UNI",
  version: "v3",
  network: "mainnet",
  limit: 10
});
```

## 错误处理

所有函数都会返回标准的错误格式：
```json
{
  "error": "错误信息",
  "details": "详细错误描述"
}
```

常见错误：
- 网络不支持：指定的 Uniswap 版本不支持该网络
- 代币地址无效：提供的代币地址格式不正确
- 查询失败：subgraph 查询超时或失败
- 无结果：没有找到匹配的池子或代币

## 注意事项

1. 代币地址需要使用校验和格式（checksum format）
2. 查询结果按 TVL（V3/V4）或储备量（V2）降序排列
3. 所有金额都以最小单位返回（wei、satoshi 等）
4. 查询有速率限制，请避免频繁调用
5. V4 目前仅在主网可用，其他网络支持将陆续添加