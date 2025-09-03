# Design Document

## Overview

The Uniswap integration module will provide comprehensive support for interacting with Uniswap V3 and V4 protocols within the deeperWallet ecosystem. The module will be implemented as a standalone JavaScript module following the existing deeperWallet architecture patterns, utilizing official Uniswap SDK libraries for protocol interactions while maintaining compatibility with the existing signing infrastructure.

## Architecture

### Module Structure
```
uniswap/
├── index.js          # Main module exports and orchestration
├── swap.js           # Token swap functionality
├── pool.js           # Pool query and information retrieval
├── quote.js          # Price quotation and route calculation
├── utils.js          # Utility functions and helpers
└── constants.js      # Network configurations and constants
```

### Integration Points
- **Signing Infrastructure**: Utilizes existing `${DEEPER_WALLET_BIN_PATH}` for transaction signing
- **Logging**: Integrates with `deeperWallet/log.js` for consistent error and debug logging
- **Database**: Uses `deeperWallet/db.js` for transaction history and caching
- **Network Layer**: Leverages existing Ethereum RPC infrastructure from `deeperWallet/eth.js`
- **Utilities**: Extends `deeperWallet/utils.js` for common operations

### Dependencies
The module will utilize the following Uniswap SDK packages:
- `@uniswap/sdk-core`: Core SDK functionality and entities
- `@uniswap/universal-router-sdk`: Universal router for optimal routing
- `@uniswap/v3-sdk`: Uniswap V3 protocol specific functionality
- `@uniswap/v4-sdk`: Uniswap V4 protocol specific functionality

## Components and Interfaces

### 1. Main Module Interface (index.js)
```javascript
exports.swapTokens = async (params) => { /* ... */ }
exports.getSwapQuote = async (params) => { /* ... */ }
exports.getPoolInfo = async (params) => { /* ... */ }
exports.getPoolList = async (params) => { /* ... */ }
exports.getSupportedTokens = async (network) => { /* ... */ }
```

### 2. Swap Component (swap.js)
**Purpose**: Handle token swap operations including route calculation, transaction preparation, and execution.

**Key Functions**:
- `calculateSwapRoute(tokenIn, tokenOut, amountIn, network)`: Calculate optimal swap route
- `prepareSwapTransaction(route, slippage, deadline)`: Prepare transaction data
- `executeSwap(password, fromAddress, swapData, network)`: Execute swap with signing

**Integration with Signing**:
```javascript
const payload = {
  method: 'sign_tx',
  param: {
    chain_type: 'ETHEREUM',
    address: fromAddress,
    input: {
      nonce: nonce.toString(),
      to: routerAddress,
      value: ethValue.toString(),
      gas_price: gasPrice.toString(),
      gas: gasLimit.toString(),
      data: swapCalldata,
      network: getNetwork(network),
    },
    key: { Password: password },
  },
};
```

### 3. Pool Component (pool.js)
**Purpose**: Query pool information, liquidity data, and trading statistics.

**Key Functions**:
- `getPoolByTokens(token0, token1, fee, network)`: Get specific pool information
- `getPoolLiquidity(poolAddress, network)`: Get current liquidity data
- `getPoolStatistics(poolAddress, network)`: Get 24h volume and price data
- `getAllPoolsForPair(token0, token1, network)`: Get all fee tier pools for a pair

### 4. Quote Component (quote.js)
**Purpose**: Provide accurate price quotes and impact calculations.

**Key Functions**:
- `getSwapQuote(tokenIn, tokenOut, amountIn, network)`: Get swap quote with price impact
- `calculatePriceImpact(route, amountIn)`: Calculate price impact percentage
- `estimateGasCost(swapData, network)`: Estimate gas costs for swap
- `getBestRoute(tokenIn, tokenOut, amountIn, network)`: Find most efficient route

### 5. Utils Component (utils.js)
**Purpose**: Provide utility functions for token handling, validation, and conversions.

**Key Functions**:
- `validateTokenAddress(address, network)`: Validate token contract address
- `getTokenInfo(address, network)`: Get token metadata (name, symbol, decimals)
- `formatTokenAmount(amount, decimals)`: Format token amounts with proper decimals
- `checkTokenApproval(tokenAddress, ownerAddress, spenderAddress, network)`: Check ERC20 approval
- `prepareApprovalTransaction(tokenAddress, spenderAddress, amount, network)`: Prepare approval tx

### 6. Constants Component (constants.js)
**Purpose**: Define network-specific configurations and contract addresses.

**Configuration Structure**:
```javascript
const UNISWAP_CONFIGS = {
  'ETHEREUM': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V4_FACTORY: '0x...',  // V4 factory when available
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  'ARBITRUM': { /* ... */ },
  'OPTIMISM': { /* ... */ },
  'BASE': { /* ... */ },
  'POLYGON': { /* ... */ },
};
```

## Data Models

### SwapParams
```javascript
{
  tokenIn: string,           // Input token address
  tokenOut: string,          // Output token address
  amountIn: string,          // Input amount in token units
  slippageTolerance: number, // Slippage tolerance (0.5 = 0.5%)
  deadline: number,          // Transaction deadline timestamp
  recipient: string,         // Recipient address
  network: string           // Network identifier
}
```

### SwapQuote
```javascript
{
  amountOut: string,        // Expected output amount
  amountOutMin: string,     // Minimum output with slippage
  priceImpact: number,      // Price impact percentage
  gasEstimate: string,      // Estimated gas cost
  route: Route,             // Swap route information
  executionPrice: Price     // Execution price
}
```

### PoolInfo
```javascript
{
  address: string,          // Pool contract address
  token0: Token,            // First token in pair
  token1: Token,            // Second token in pair
  fee: number,              // Pool fee tier
  liquidity: string,        // Current liquidity
  sqrtPriceX96: string,     // Current price in sqrt format
  tick: number,             // Current tick
  volume24h: string,        // 24h trading volume
  tvl: string              // Total value locked
}
```

## Error Handling

### Error Categories
1. **Network Errors**: RPC failures, timeout issues
2. **Validation Errors**: Invalid addresses, insufficient balance
3. **Protocol Errors**: Pool not found, insufficient liquidity
4. **Signing Errors**: Hardware wallet communication failures
5. **Transaction Errors**: Gas estimation failures, transaction reverts

### Error Handling Strategy
```javascript
// Consistent error logging using existing infrastructure
const logger = require('../log');

try {
  const result = await performSwap(params);
  return result;
} catch (error) {
  logger.error(`Uniswap swap failed: ${error.message}`);
  
  // Return structured error response
  return {
    success: false,
    error: {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      details: error.details || null
    }
  };
}
```

### Retry Logic
- Network requests: 3 retries with exponential backoff
- Gas estimation: Retry with increased gas limit on failure
- Transaction submission: Single attempt with clear error reporting

## Testing Strategy

### Unit Tests
- Token validation functions
- Amount formatting and conversion utilities
- Route calculation logic
- Price impact calculations

### Integration Tests
- End-to-end swap execution on testnets
- Pool data retrieval accuracy
- Quote calculation precision
- Error handling scenarios

### Mock Testing
- Hardware wallet signing simulation
- Network failure scenarios
- Invalid input handling
- Edge case validation

### Test Networks
- Ethereum Sepolia
- Arbitrum Sepolia  
- Base Sepolia
- Optimism Sepolia

## Security Considerations

### Input Validation
- Strict validation of all token addresses using checksums
- Amount validation to prevent overflow/underflow
- Network parameter validation against supported networks
- Slippage bounds checking (0.1% - 50%)

### Transaction Security
- Deadline enforcement to prevent stale transactions
- Slippage protection with user-defined tolerance
- Gas limit validation to prevent excessive costs
- Recipient address validation

### Private Key Protection
- No private key handling within the module
- All signing operations delegated to `${DEEPER_WALLET_BIN_PATH}`
- Secure parameter passing to signing infrastructure
- No sensitive data logging

### Smart Contract Interactions
- Use of official Uniswap SDK libraries only
- Verification of contract addresses against known deployments
- Proper handling of token approvals and allowances
- Protection against reentrancy and other common vulnerabilities

## Performance Optimizations

### Caching Strategy
- Token metadata caching (24h TTL)
- Pool information caching (5min TTL)
- Gas price caching (30s TTL)
- Route caching for common pairs (1min TTL)

### Network Efficiency
- Batch RPC calls where possible
- Efficient route calculation algorithms
- Minimal on-chain queries through SDK optimization
- Connection pooling for RPC endpoints

### Memory Management
- Proper cleanup of large objects after operations
- Streaming for large data sets
- Efficient data structures for route calculations
- Garbage collection optimization for long-running processes