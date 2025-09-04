// Router initialization for Uniswap
const { AlphaRouter } = require('@uniswap/smart-order-router');
const { providers } = require('ethers');
const { CHAIN_CONFIGS, NETWORKS } = require('./config');

/**
 * Initialize AlphaRouter with provider and chain ID
 * @param {string} rpcUrl - RPC endpoint URL
 * @param {number} chainId - Chain ID
 * @returns {AlphaRouter|null} - Initialized AlphaRouter or null if failed
 */
function initializeRouter(rpcUrl, chainId) {
  try {
    // Validate chain ID
    if (!CHAIN_CONFIGS[chainId]) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Create provider
    const provider = new providers.JsonRpcProvider(rpcUrl);
    
    // Initialize router
    const router = new AlphaRouter({
      chainId: chainId,
      provider: provider,
    });

    return router;
  } catch (error) {
    console.error('Failed to initialize router:', error.message);
    return null;
  }
}

/**
 * Get RPC URL for a specific network
 * @param {string} network - Network name
 * @returns {string|null} - RPC URL or null if not found
 */
function getRpcUrl(network) {
  // For now, we'll use public RPC endpoints
  // In production, you should use your own RPC endpoints
  const rpcUrls = {
    'ETHEREUM': 'https://eth-mainnet.public.blastapi.io',
    'ETHEREUM-SEPOLIA': 'https://ethereum-sepolia-rpc.publicnode.com',
    'ETHEREUM-GOERLI': 'https://ethereum-goerli.publicnode.com',
    'POLYGON': 'https://polygon-rpc.com',
    'ARBITRUM': 'https://arbitrum.llamarpc.com',
    'OPTIMISM': 'https://optimism.llamarpc.com',
    'BASE': 'https://base.llamarpc.com',
  };

  return rpcUrls[network] || null;
}

/**
 * Get chain ID from network name
 * @param {string} network - Network name
 * @returns {number|null} - Chain ID or null if not found
 */
function getChainId(network) {
  const networkMap = {
    'ETHEREUM': NETWORKS.MAINNET,
    'ETHEREUM-SEPOLIA': NETWORKS.SEPOLIA,
    'ETHEREUM-GOERLI': NETWORKS.GOERLI,
    // Add more networks as needed
  };

  return networkMap[network] || null;
}

module.exports = {
  initializeRouter,
  getRpcUrl,
  getChainId,
};