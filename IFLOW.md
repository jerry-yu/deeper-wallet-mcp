# Deeper Wallet MCP - iFlow 上下文

## 项目概述

Deeper Wallet MCP 是一个基于 Model Context Protocol (MCP) 的服务器，提供多链钱包功能、Uniswap Subgraph 查询功能和 Raydium Swap 功能。该项目允许用户通过标准的 MCP 工具接口与多个区块链网络进行交互，并提供对 Uniswap 流动性池和代币信息的查询能力，以及在 Solana 网络上执行代币交换。

### 核心功能

1. **多链钱包基础功能**:
   - 查询区块链地址余额
   - 查询合约代币余额
   - 获取合约元信息（名称、符号、精度）
   - 代币转账功能
   - 合约代币转账功能
   - 账户列表管理

2. **Uniswap Subgraph 查询功能**:
   - V2/V3/V4 池子信息查询
   - 代币详细信息查询
   - 热门池子查询
   - 按符号搜索池子

3. **Uniswap 代币交换功能**:
   - 支持 V2/V3/V4 版本的代币交换
   - 自动路由选择
   - 滑点保护

4. **Raydium 代币交换功能**:
   - 在 Solana 网络上执行代币交换
   - 支持滑点保护

### 支持的区块链网络

- Ethereum (主网及测试网)
- Polygon
- Arbitrum
- Optimism
- Base
- BNB Chain
- Solana
- Tron
- Sui
- Bitcoin

### Uniswap Subgraph 支持的网络

- **V2**: Ethereum Mainnet, Polygon, Arbitrum, Optimism
- **V3**: Ethereum Mainnet, Polygon, Arbitrum, Optimism, Base, BNB Chain
- **V4**: Ethereum Mainnet

## 项目结构

```
deeper-wallet-mcp/
├── deeperWallet/
│   ├── index.js              # 主要钱包功能入口
│   ├── uniswap-subgraph.js   # Uniswap subgraph 查询模块
│   ├── uniswap/              # Uniswap 交换功能模块
│   │   ├── index.js          # Uniswap 交换主模块
│   │   ├── constants.js      # 常量定义
│   │   ├── cache.js          # 缓存管理
│   │   ├── rpc.js            # RPC 管理
│   │   ├── utils.js          # 工具函数
│   │   ├── validation.js     # 参数验证
│   │   ├── errors.js         # 错误处理
│   │   ├── encoding.js       # 编码/解码函数
│   │   ├── calculations.js   # 计算逻辑
│   │   ├── pool.js           # 池子相关功能
│   │   ├── price.js          # 价格相关功能
│   │   ├── approval.js       # 授权相关功能
│   │   ├── token.js          # 代币相关功能
│   │   └── swap.js           # 交换相关功能
│   ├── eth.js                # Ethereum 相关功能
│   ├── solana.js             # Solana 相关功能
│   ├── tron.js               # Tron 相关功能
│   ├── sui.js                # Sui 相关功能
│   ├── db.js                 # 数据库操作
│   ├── sqlite3.js            # SQLite3 数据库初始化
│   ├── log.js                # 日志模块
│   └── utils.js              # 通用工具函数
├── index.js                  # MCP 服务器入口
├── instructions.js           # 服务器描述信息
├── test-uniswap-subgraph.js  # Uniswap 功能测试
├── test-raydium-swap.js      # Raydium Swap 功能测试
├── UNISWAP_SUBGRAPH_USAGE.md # Uniswap Subgraph 使用指南
└── README.md
```

## 构建和运行

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

## 测试

运行 Uniswap subgraph 功能测试：
```bash
node test-uniswap-subgraph.js
```

运行 Raydium Swap 功能测试：
```bash
node test-raydium-swap.js
```

## MCP 工具列表

### 基础钱包工具

- `getBalance` - 获取地址余额
- `getContractBalance` - 获取合约代币余额
- `getContractMeta` - 获取合约元信息
- `swapTokens` - Uniswap 代币交换
- `raydiumSwap` - Raydium 代币交换
- `transferTokenFromMyWallet` - 从钱包转账代币
- `transferContractTokenFromMyWallet` - 从钱包转账合约代币
- `accountList` - 获取账户列表

### Uniswap Subgraph 查询工具

- `getUniswapV2PoolInfo` - 查询 V2 池子信息
- `getUniswapV3PoolInfo` - 查询 V3 池子信息
- `getUniswapV4PoolInfo` - 查询 V4 池子信息
- `getUniswapTokenInfo` - 查询代币详细信息
- `getUniswapTopPools` - 获取热门池子
- `searchUniswapPoolsBySymbol` - 按符号搜索池子

## 开发约定

1. **代码风格**: 使用标准的 JavaScript 语法，遵循 Node.js 最佳实践
2. **错误处理**: 使用 `await-to-js` 包进行统一的错误处理
3. **日志记录**: 使用自定义的 `log.js` 模块进行日志记录
4. **配置管理**: 通过环境变量和配置文件管理敏感信息
5. **测试**: 使用独立的测试文件验证功能

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

### Raydium Swap

```javascript
{
  "tool": "raydiumSwap",
  "arguments": {
    "fromAddress": "your_solana_address",
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "amountIn": "1000000000",
    "slippage": 0.5,
    "network": "SOLANA-DEVNET"
  }
}
```