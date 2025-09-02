# Design Document

## Overview

The Uniswap integration will add decentralized exchange functionality to the deeperWallet project by implementing a new `uniswap.js` module. This module will provide swap operations and pool queries for Uniswap V2 and V3 protocols on Ethereum and compatible networks. The design follows the existing architectural patterns used in other blockchain modules (eth.js, solana.js, etc.).

## Architecture

### Module Structure
The Uniswap functionality will be implemented as a standalone module `deeperWallet/uniswap.js` that integrates with the existing wallet infrastructure. The module will:

- Follow the same export pattern as other blockchain modules
- Use the existing RPC infrastructure from `eth.js`
- Integrate with the current transaction signing mechanism
- Leverage existing utility functions for hex/decimal conversions

### Integration Points
1. **Main Index Integration**: New MCP tools will be added to `index.js` for Uniswap operations
2. **Ethereum Module Dependency**: Will reuse RPC functions and transaction utilities from `eth.js`
3. **Transaction Flow**: Will integrate with existing transaction signing and broadcasting mechanisms
4. **Error Handling**: Will follow the same error handling patterns using `await-to-js`

## Components and Interfaces

### Core Functions

#### 1. Swap Operations
```javascript
// Get swap quote with price impact and slippage
async function getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage)

// Execute token swap transaction
async function executeSwap(password, fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network)

// Get optimal swap route (V2 vs V3)
async function getOptimalRoute(network, tokenIn, tokenOut, amountIn)
```

#### 2. Pool Queries
```javascript
// Get pool information for a token pair
async function getPoolInfo(network, tokenA, tokenB, feeLevel)

// Get current token prices from pools
async function getTokenPrice(network, tokenAddress, baseToken)

// Get pool reserves and liquidity
async function getPoolReserves(network, poolAddress)
```

#### 3. Utility Functions
```javascript
// Calculate swap amounts using Uniswap formulas
function calculateSwapOutput(reserveIn, reserveOut, amountIn, fee)

// Encode swap transaction data
function encodeSwapData(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline)

// Get token approval status and execute approval if needed
async function handleTokenApproval(password, fromAddress, tokenAddress, spenderAddress, amount, network)
```

### Contract Addresses and Constants

```javascript
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

// Fee tiers for V3 pools
const FEE_TIERS = {
  LOW: 500,      // 0.05%
  MEDIUM: 3000,  // 0.3%
  HIGH: 10000    // 1%
};
```

## Data Models

### SwapQuote
```javascript
{
  tokenIn: string,           // Input token address
  tokenOut: string,          // Output token address
  amountIn: string,          // Input amount in wei
  amountOut: string,         // Expected output amount
  amountOutMin: string,      // Minimum output with slippage
  priceImpact: number,       // Price impact percentage
  route: string[],           // Swap route (token addresses)
  version: 'V2' | 'V3',     // Uniswap version
  gasEstimate: string        // Estimated gas cost
}
```

### PoolInfo
```javascript
{
  poolAddress: string,       // Pool contract address
  token0: string,           // First token address
  token1: string,           // Second token address
  reserve0: string,         // Reserve of token0
  reserve1: string,         // Reserve of token1
  totalSupply: string,      // Total LP token supply
  fee: number,              // Fee tier (for V3)
  liquidity: string,        // Current liquidity (for V3)
  version: 'V2' | 'V3'     // Pool version
}
```

### SwapResult
```javascript
{
  transactionHash: string,   // Transaction hash
  tokenIn: string,          // Input token address
  tokenOut: string,         // Output token address
  amountIn: string,         // Actual input amount
  amountOut: string,        // Actual output amount
  gasUsed: string,          // Gas consumed
  gasPrice: string          // Gas price used
}
```

## Error Handling

The module will implement comprehensive error handling for common scenarios:

1. **Insufficient Liquidity**: When pools don't have enough liquidity for the requested swap
2. **High Price Impact**: When swaps would cause significant price movement
3. **Token Approval Failures**: When ERC20 approval transactions fail
4. **Network Errors**: RPC failures and timeout handling
5. **Invalid Parameters**: Input validation for addresses and amounts

Error responses will follow the existing pattern:
```javascript
{
  error: true,
  message: "Descriptive error message",
  code: "ERROR_CODE",
  details: { /* additional context */ }
}
```

## Testing Strategy

### Unit Tests
- Test swap calculation functions with known inputs/outputs
- Validate contract interaction encoding/decoding
- Test error handling for edge cases
- Mock RPC responses for consistent testing

### Integration Tests
- Test against Ethereum testnets (Sepolia)
- Verify actual swap transactions end-to-end
- Test pool query accuracy against known pools
- Validate gas estimation accuracy

### Test Data
- Use well-known token pairs (ETH/USDC, ETH/DAI)
- Test with different pool fee tiers
- Include edge cases (very small/large amounts)
- Test slippage protection mechanisms

## Security Considerations

1. **Slippage Protection**: Always enforce minimum output amounts to prevent MEV attacks
2. **Deadline Protection**: Include transaction deadlines to prevent delayed execution
3. **Input Validation**: Validate all token addresses and amounts before processing
4. **Approval Limits**: Use exact approval amounts rather than infinite approvals
5. **Price Impact Warnings**: Alert users to high price impact trades

## Performance Optimizations

1. **Route Caching**: Cache optimal routes for frequently traded pairs
2. **Pool Data Caching**: Cache pool reserves with appropriate TTL
3. **Batch RPC Calls**: Use multicall patterns where possible
4. **Gas Optimization**: Use gas-efficient swap methods based on trade size

## Network Support

Initial implementation will support:
- **Ethereum Mainnet**: Full V2 and V3 support
- **Ethereum Sepolia**: For testing purposes
- **Future Networks**: Architecture allows easy extension to other EVM chains with Uniswap deployments

The design allows for easy extension to other networks by adding their specific router and factory addresses to the configuration.