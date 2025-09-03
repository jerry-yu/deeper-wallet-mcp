/**
 * Network Configurations and Constants
 * Defines network-specific configurations and contract addresses for Uniswap
 */

/**
 * Uniswap contract addresses and configurations by network
 */
const UNISWAP_CONFIGS = {
  'ETHEREUM': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V4_FACTORY: null, // V4 not yet deployed on mainnet
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    CHAIN_ID: 1
  },
  'ARBITRUM': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V4_FACTORY: null,
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    CHAIN_ID: 42161
  },
  'OPTIMISM': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V4_FACTORY: null,
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    WETH: '0x4200000000000000000000000000000000000006',
    CHAIN_ID: 10
  },
  'BASE': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    V4_FACTORY: null,
    QUOTER_V2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    WETH: '0x4200000000000000000000000000000000000006',
    CHAIN_ID: 8453
  },
  'POLYGON': {
    UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V4_FACTORY: null,
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    WETH: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    CHAIN_ID: 137
  }
};

/**
 * Uniswap V3 fee tiers
 */
const FEE_TIERS = {
  LOWEST: 100,    // 0.01%
  LOW: 500,       // 0.05%
  MEDIUM: 3000,   // 0.3%
  HIGH: 10000     // 1%
};

/**
 * Default configuration values
 */
const DEFAULTS = {
  SLIPPAGE_TOLERANCE: 0.5,  // 0.5%
  DEADLINE_MINUTES: 20,     // 20 minutes
  GAS_LIMIT_BUFFER: 1.2,    // 20% buffer on gas estimates
  MAX_HOPS: 3               // Maximum number of hops in route
};

/**
 * Cache TTL values in seconds
 */
const CACHE_TTL = {
  TOKEN_METADATA: 24 * 60 * 60,  // 24 hours
  POOL_INFO: 5 * 60,              // 5 minutes
  GAS_PRICE: 30,                  // 30 seconds
  ROUTES: 60                      // 1 minute
};

/**
 * Get network configuration
 * @param {string} network - Network identifier
 * @returns {Object} Network configuration
 */
function getNetworkConfig(network) {
  const config = UNISWAP_CONFIGS[network.toUpperCase()];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return config;
}

/**
 * Get supported networks
 * @returns {Array<string>} List of supported network names
 */
function getSupportedNetworks() {
  return Object.keys(UNISWAP_CONFIGS);
}

/**
 * Check if network supports V4
 * @param {string} network - Network identifier
 * @returns {boolean} V4 support status
 */
function supportsV4(network) {
  const config = getNetworkConfig(network);
  return config.V4_FACTORY !== null;
}

module.exports = {
  UNISWAP_CONFIGS,
  FEE_TIERS,
  DEFAULTS,
  CACHE_TTL,
  getNetworkConfig,
  getSupportedNetworks,
  supportsV4
};