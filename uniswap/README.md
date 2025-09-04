# Uniswap Integration for Deeper Wallet

This module provides integration with Uniswap V3 for token swapping functionality within the Deeper Wallet.

## Features

1. **Swap Quotes**: Get quotes for token swaps with price impact and gas estimates
2. **Pool Information**: Retrieve information about liquidity pools for token pairs
3. **Token Swapping**: Execute token swaps using the Uniswap Universal Router
4. **Token Approval**: Approve tokens for swapping

## Installation

The required dependencies are already installed in the project:

- `@uniswap/sdk-core`
- `@uniswap/universal-router-sdk`
- `@uniswap/v3-sdk`
- `@uniswap/smart-order-router`
- `ethers`

## Usage

### Initialize Uniswap

```javascript
const { initializeUniswap } = require('./uniswap');

// Initialize for Ethereum mainnet
const uniswapInstance = initializeUniswap('ETHEREUM');
```

### Get Swap Quote

```javascript
const { getQuote } = require('./uniswap');

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

const quote = await getQuote(uniswapInstance, wethInfo, usdtInfo, '1000000000000000000'); // 1 WETH
```

### Get Pool Information

```javascript
const { getPools } = require('./uniswap');

const pools = await getPools(uniswapInstance, wethInfo, usdtInfo);
```

### Execute Swap

```javascript
const { executeSwap } = require('./uniswap');

// Requires an ethers signer
const swapResult = await executeSwap({
  signer: walletSigner,
  tokenInInfo: wethInfo,
  tokenOutInfo: usdtInfo,
  amountIn: '1000000000000000000', // 1 WETH
  options: {
    slippageTolerance: 0.5, // 0.5%
    deadlineMinutes: 20
  }
});
```

## Supported Networks

- Ethereum Mainnet (chainId: 1)
- Ethereum Sepolia Testnet (chainId: 11155111)
- Ethereum Goerli Testnet (chainId: 5)
- Polygon (chainId: 137)
- Arbitrum (chainId: 42161)
- Optimism (chainId: 10)
- Base (chainId: 8453)

## API Reference

### initializeUniswap(network)
Initializes the Uniswap router for a specific network.

**Parameters:**
- `network` (string): Network name (e.g., 'ETHEREUM', 'ETHEREUM-SEPOLIA')

**Returns:**
- Object containing router instance, chain ID, and network name

### getQuote(uniswapInstance, tokenInInfo, tokenOutInfo, amountIn, options)
Gets a swap quote for a token pair.

**Parameters:**
- `uniswapInstance` (object): Initialized Uniswap instance
- `tokenInInfo` (object): Input token information
- `tokenOutInfo` (object): Output token information
- `amountIn` (string): Input amount in token's smallest unit
- `options` (object): Swap options (optional)

**Returns:**
- Quote information including amounts, price impact, and gas estimates

### getPools(uniswapInstance, tokenAInfo, tokenBInfo)
Gets information about available pools for a token pair.

**Parameters:**
- `uniswapInstance` (object): Initialized Uniswap instance
- `tokenAInfo` (object): First token information
- `tokenBInfo` (object): Second token information

**Returns:**
- Array of pool information for different fee tiers

### executeSwap(params)
Executes a token swap.

**Parameters:**
- `params` (object): Swap parameters including signer, token info, amount, and options

**Returns:**
- Transaction information

### approveTokenForSwap(signer, tokenInfo, routerAddress, amount)
Approves a token for swapping.

**Parameters:**
- `signer` (ethers.Signer): Ethers signer
- `tokenInfo` (object): Token information
- `routerAddress` (string): Router contract address
- `amount` (string): Amount to approve

**Returns:**
- Approval transaction information

## Configuration

The module uses default RPC endpoints for each network. For production use, you should configure your own RPC endpoints in the `router.js` file.

## Testing

Run the unit tests:
```bash
node uniswap/utils.test.js
node uniswap/router.test.js
node uniswap/index.test.js
```

Run the integration test:
```bash
node uniswap/test.js
```