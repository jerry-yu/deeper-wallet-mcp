const { Connection, PublicKey } = require('@solana/web3.js');
const { Raydium } = require('@raydium-io/raydium-sdk-v2');
const NodeCache = require('node-cache');
const logger = require('./log');

// Network configuration for Raydium endpoints
const NETWORK_CONFIG = {
  'SOLANA': {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet',
    raydiumProgramId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  },
  'SOLANA-DEVNET': {
    rpcUrl: 'https://api.devnet.solana.com',
    cluster: 'devnet',
    raydiumProgramId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  },
  'SOLANA-TESTNET': {
    rpcUrl: 'https://api.testnet.solana.com',
    cluster: 'testnet',
    raydiumProgramId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  }
};

// Default configuration values
const DEFAULT_CONFIG = {
  slippage: 1.0,        // 1% default slippage
  maxSlippage: 50.0,    // 50% maximum slippage
  minSlippage: 0.1,     // 0.1% minimum slippage
  quoteRefreshInterval: 30000,  // 30 seconds
  transactionTimeout: 60000     // 60 seconds
};

// Cache for Raydium SDK instances
const raydiumInstances = new Map();

// Cache for pool information (TTL: 5 minutes)
const poolCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Get network configuration for the specified network
 * @param {string} network - Network identifier (e.g., 'SOLANA', 'SOLANA-DEVNET')
 * @returns {Object} Network configuration object
 */
function getNetworkConfig(network) {
  const config = NETWORK_CONFIG[network.toUpperCase()];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return config;
}

/**
 * Initialize Raydium SDK instance for the specified network and owner
 * @param {string} network - Network identifier
 * @param {string} ownerAddress - Owner wallet address
 * @returns {Promise<Raydium>} Initialized Raydium SDK instance
 */
async function initializeRaydium(network, ownerAddress) {
  const cacheKey = `${network}-${ownerAddress}`;
  
  // Return cached instance if available
  if (raydiumInstances.has(cacheKey)) {
    return raydiumInstances.get(cacheKey);
  }

  try {
    const config = getNetworkConfig(network);
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const owner = new PublicKey(ownerAddress);

    logger.info(`Initializing Raydium SDK for network: ${network}, RPC: ${config.rpcUrl}, owner: ${ownerAddress}`);

    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner,
      connection,
      cluster: config.cluster,
      programIds: {
        // Use default program IDs from SDK
      },
      signAllTransactions: async (txs) => {
        // This will be handled by the transaction signing infrastructure
        // For now, return the transactions as-is since signing happens elsewhere
        return txs;
      },
    });

    // Cache the instance
    raydiumInstances.set(cacheKey, raydium);
    
    logger.info(`Raydium SDK initialized successfully for network: ${network}, owner: ${ownerAddress}`);
    return raydium;

  } catch (error) {
    logger.error(`Failed to initialize Raydium SDK for network: ${network}, owner: ${ownerAddress}, error: ${error.message}`);
    throw new Error(`Failed to initialize Raydium SDK: ${error.message}`);
  }
}

/**
 * Get RPC connection for the specified network
 * @param {string} network - Network identifier
 * @returns {Connection} Solana RPC connection
 */
function getConnection(network) {
  const config = getNetworkConfig(network);
  return new Connection(config.rpcUrl, 'confirmed');
}

/**
 * Validate slippage tolerance value
 * @param {number} slippage - Slippage percentage (0.1 to 50.0)
 * @returns {boolean} True if valid, throws error if invalid
 */
function validateSlippage(slippage) {
  if (typeof slippage !== 'number' || isNaN(slippage)) {
    throw new Error('Slippage must be a valid number');
  }
  
  if (slippage < DEFAULT_CONFIG.minSlippage || slippage > DEFAULT_CONFIG.maxSlippage) {
    throw new Error(`Slippage must be between ${DEFAULT_CONFIG.minSlippage}% and ${DEFAULT_CONFIG.maxSlippage}%`);
  }
  
  return true;
}

/**
 * Validate token mint address
 * @param {string} mintAddress - Token mint address
 * @returns {boolean} True if valid, throws error if invalid
 */
function validateMintAddress(mintAddress) {
  if (!mintAddress || typeof mintAddress !== 'string') {
    throw new Error('Mint address must be a valid string');
  }
  
  try {
    new PublicKey(mintAddress);
    return true;
  } catch (error) {
    throw new Error(`Invalid mint address: ${mintAddress}`);
  }
}

/**
 * Clear cached Raydium instances (useful for testing or network changes)
 */
function clearCache() {
  raydiumInstances.clear();
  logger.info('Raydium SDK cache cleared');
}

module.exports = {
  initializeRaydium,
  getNetworkConfig,
  getConnection,
  validateSlippage,
  validateMintAddress,
  clearCache,
  DEFAULT_CONFIG,
  NETWORK_CONFIG
};