# Implementation Plan

- [x] 1. Create core Uniswap module structure and constants




  - Create `deeperWallet/uniswap.js` file with module exports structure
  - Define Uniswap V2/V3 contract addresses and ABI function selectors
  - Set up fee tier constants and network configuration
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Implement utility functions for Uniswap calculations





  - Create swap amount calculation functions using Uniswap formulas
  - Implement hex encoding/decoding utilities for contract calls
  - Add input validation functions for addresses and amounts
  - Write unit tests for calculation accuracy
  - _Requirements: 3.2, 5.4_

- [x] 3. Implement pool query functionality





  - Create functions to query V2 pool reserves and metadata
  - Implement V3 pool liquidity and fee tier queries
  - Add pool existence validation and error handling
  - Write tests for pool data retrieval
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Implement token price and quote functionality





  - Create price calculation functions from pool reserves
  - Implement swap quote generation with slippage calculation
  - Add price impact calculation and warnings
  - Write tests for quote accuracy and edge cases
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Implement token approval handling





  - Create ERC20 approval check functions
  - Implement approval transaction generation and execution
  - Add approval status validation and retry logic
  - Write tests for approval workflow
  - _Requirements: 4.3, 4.4_

- [x] 6. Implement swap transaction functionality





  - Create swap transaction data encoding for V2 router
  - Implement V3 swap transaction encoding
  - Add optimal route selection between V2 and V3
  - Integrate with existing transaction signing mechanism
  - Write tests for transaction generation
  - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.5_

- [x] 7. Add error handling and validation





  - Implement comprehensive error handling for all swap scenarios
  - Add input validation for all public functions
  - Create user-friendly error messages
  - Write tests for error conditions and edge cases
  - _Requirements: 1.4, 2.4, 3.4, 5.4_

- [x] 8. Integrate Uniswap functions with MCP server





  - Add swap quote MCP tool to main index.js
  - Implement swap execution MCP tool with wallet integration
  - Add pool query MCP tools
  - Add token price query MCP tools
  - _Requirements: 4.1, 4.2, 5.3_

- [x] 9. Add comprehensive testing and validation





  - Create integration tests using Ethereum testnet
  - Test end-to-end swap workflows
  - Validate gas estimation accuracy
  - Test slippage protection and deadline handling
  - _Requirements: 1.5, 3.5, 4.4, 4.5_

- [x] 10. Optimize performance and add caching
  - Implement route caching for frequently used pairs
  - Add pool data caching with appropriate TTL
  - Optimize RPC call patterns for better performance
  - Write performance tests and benchmarks
  - _Requirements: 2.1, 2.2, 3.1_

- [x] 11. Fix token decimals handling in getTokenPrice function





  - Modify getTokenPrice function to retrieve actual token decimals using getContractMeta
  - Update calculateV2Price and calculateV3Price calls to pass correct decimals
  - Add proper error handling for decimal retrieval failures
  - Write tests to verify price calculations with different decimal tokens (e.g., USDC with 6 decimals)
  - _Requirements: 3.1, 3.2, 3.3_