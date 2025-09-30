# Deeper Wallet MCP

A Model Context Protocol server for Deeper Wallet functionality with integrated Uniswap Subgraph queries.

## 功能特性

### 钱包基础功能
- 查询区块链地址余额
- 查询合约代币余额
- 获取合约元信息（名称、符号、精度）
- 代币转账功能
- 合约代币转账功能
- 账户列表管理
- Uniswap 代币交换

### 🆕 Uniswap Subgraph 查询功能
- **V2 池子查询**: 查询两个代币在 Uniswap V2 上的流动性池信息
- **V3 池子查询**: 查询两个代币在 Uniswap V3 上的流动性池信息  
- **V4 池子查询**: 查询两个代币在 Uniswap V4 上的流动性池信息
- **代币信息查询**: 获取代币的详细信息（交易量、TVL等）
- **热门池子查询**: 获取按TVL排序的热门流动性池
- **池子搜索**: 根据代币符号搜索相关的流动性池

## 支持的区块链网络

- **Ethereum** (主网及测试网)
- **Polygon** 
- **Arbitrum**
- **Optimism**
- **Base**
- **BNB Chain**
- **Solana**
- **Tron**
- **Sui**
- **Bitcoin**

## Uniswap Subgraph 支持的网络

### V2 支持
- Ethereum Mainnet
- Polygon
- Arbitrum  
- Optimism

### V3 支持
- Ethereum Mainnet
- Polygon
- Arbitrum
- Optimism
- Base
- BNB Chain

### V4 支持
- Ethereum Mainnet

## 安装和使用

### 环境要求
- Node.js 16+
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 配置环境
创建 `.env` 文件并添加助记词：
```
MNEMONIC=your_wallet_mnemonic_here
```

### 启动服务
```bash
node index.js
```

或使用助记词参数启动：
```bash
node index.js -m "your mnemonic words here"
```

## MCP 工具列表

### 基础钱包工具
- `getBalance` - 获取地址余额
- `getContractBalance` - 获取合约代币余额
- `getContractMeta` - 获取合约元信息
- `swapTokens` - Uniswap 代币交换
- `transferTokenFromMyWallet` - 从钱包转账代币
- `transferContractTokenFromMyWallet` - 从钱包转账合约代币
- `accountList` - 获取账户列表

### 🆕 Uniswap Subgraph 查询工具
- `getUniswapV2PoolInfo` - 查询 V2 池子信息
- `getUniswapV3PoolInfo` - 查询 V3 池子信息
- `getUniswapV4PoolInfo` - 查询 V4 池子信息
- `getUniswapTokenInfo` - 查询代币详细信息
- `getUniswapTopPools` - 获取热门池子
- `searchUniswapPoolsBySymbol` - 按符号搜索池子

## 使用示例

### 查询 WETH/USDC 池子信息
```javascript
// V3 池子查询
{
  "tool": "getUniswapV3PoolInfo",
  "arguments": {
    "token0Address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "token1Address": "0xA0b86a33E6441b8e8C7C7b0b8e8C7C7b0b8e8C7C",
    "network": "mainnet"
  }
}
```

### 搜索包含特定代币的池子
```javascript
{
  "tool": "searchUniswapPoolsBySymbol", 
  "arguments": {
    "symbol": "UNI",
    "version": "v3",
    "network": "mainnet",
    "limit": 10
  }
}
```

### 获取热门池子
```javascript
{
  "tool": "getUniswapTopPools",
  "arguments": {
    "version": "v3", 
    "network": "mainnet",
    "limit": 5
  }
}
```

## 测试

运行 Uniswap subgraph 功能测试：
```bash
node test-uniswap-subgraph.js
```

## 文档

详细的 Uniswap Subgraph 使用指南请参考：[UNISWAP_SUBGRAPH_USAGE.md](./UNISWAP_SUBGRAPH_USAGE.md)

## 项目结构

```
deeper-wallet-mcp/
├── deeperWallet/
│   ├── index.js              # 主要钱包功能
│   ├── uniswap-subgraph.js   # 🆕 Uniswap subgraph 查询模块
│   ├── eth.js                # Ethereum 相关功能
│   ├── solana.js             # Solana 相关功能
│   ├── tron.js               # Tron 相关功能
│   ├── sui.js                # Sui 相关功能
│   └── ...
├── index.js                  # MCP 服务器入口
├── test-uniswap-subgraph.js  # 🆕 Uniswap 功能测试
├── UNISWAP_SUBGRAPH_USAGE.md # 🆕 使用指南
└── README.md
```

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 许可证

ISC License