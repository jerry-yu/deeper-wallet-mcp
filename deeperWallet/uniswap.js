const logger = require('./log');
const axios = require('axios');
const to = require('await-to-js').default;
const Decimal = require('decimal.js');

Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// PERFORMANCE CACHING SYSTEM
// ============================================================================

/**
 * In-memory cache with TTL support for performance optimization
 */
class PerformanceCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();

    // Cache configuration
    this.config = {
      // Route caching - cache optimal routes for frequently used pairs
      routes: {
        ttl: 5 * 60 * 1000, // 5 minutes
        maxSize: 1000
      },
      // Pool data caching - cache pool reserves and metadata
      pools: {
        ttl: 2 * 60 * 1000, // 2 minutes
        maxSize: 500
      },
      // Token price caching - cache token prices from pools
      prices: {
        ttl: 1 * 60 * 1000, // 1 minute
        maxSize: 200
      },
      // RPC response caching - cache contract call results
      rpc: {
        ttl: 30 * 1000, // 30 seconds
        maxSize: 1000
      },
      // Pool existence caching - cache pool existence checks
      existence: {
        ttl: 10 * 60 * 1000, // 10 minutes
        maxSize: 500
      }
    };
  }

  /**
   * Generate cache key from parameters
   * @param {string} type - Cache type (routes, pools, prices, rpc, existence)
   * @param {Array} params - Parameters to create key from
   * @returns {string} Cache key
   */
  generateKey(type, params) {
    const keyParts = [type, ...params.map(p => String(p).toLowerCase())];
    return keyParts.join(':');
  }

  /**
   * Set cache entry with TTL
   * @param {string} type - Cache type
   * @param {Array} keyParams - Parameters for key generation
   * @param {any} value - Value to cache
   * @returns {void}
   */
  set(type, keyParams, value) {
    try {
      const key = this.generateKey(type, keyParams);
      const config = this.config[type];

      if (!config) {
        console.warn(`Unknown cache type: ${type}`);
        return;
      }

      // Check cache size limit
      if (this.cache.size >= config.maxSize) {
        this.evictOldest(type);
      }

      // Store the value with timestamp
      this.cache.set(key, {
        value,
        timestamp: Date.now(),
        type,
        ttl: config.ttl
      });

      // Set TTL timer
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      const timer = setTimeout(() => {
        this.delete(key);
      }, config.ttl);

      this.timers.set(key, timer);

      console.debug(`Cache SET: ${key} (TTL: ${config.ttl}ms)`);
    } catch (error) {
      console.error('Cache set error:', error.message);
    }
  }

  /**
   * Get cache entry if not expired
   * @param {string} type - Cache type
   * @param {Array} keyParams - Parameters for key generation
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(type, keyParams) {
    try {
      const key = this.generateKey(type, keyParams);
      const entry = this.cache.get(key);

      if (!entry) {
        return null;
      }

      // Check if expired
      const now = Date.now();
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
        return null;
      }

      console.debug(`Cache HIT: ${key}`);
      return entry.value;
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   * @returns {void}
   */
  delete(key) {
    try {
      this.cache.delete(key);

      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }

      console.debug(`Cache DELETE: ${key}`);
    } catch (error) {
      console.error('Cache delete error:', error.message);
    }
  }

  /**
   * Check if cache has entry
   * @param {string} type - Cache type
   * @param {Array} keyParams - Parameters for key generation
   * @returns {boolean} True if cache has valid entry
   */
  has(type, keyParams) {
    const value = this.get(type, keyParams);
    return value !== null;
  }

  /**
   * Clear all cache entries of a specific type
   * @param {string} type - Cache type to clear
   * @returns {void}
   */
  clearType(type) {
    try {
      const keysToDelete = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.type === type) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.delete(key));
      console.info(`Cleared ${keysToDelete.length} entries of type: ${type}`);
    } catch (error) {
      console.error('Cache clear type error:', error.message);
    }
  }

  /**
   * Clear all cache entries
   * @returns {void}
   */
  clear() {
    try {
      // Clear all timers
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }

      this.cache.clear();
      this.timers.clear();
      console.info('Cache cleared completely');
    } catch (error) {
      console.error('Cache clear error:', error.message);
    }
  }

  /**
   * Evict oldest entries of a specific type
   * @param {string} type - Cache type
   * @returns {void}
   */
  evictOldest(type) {
    try {
      const typeEntries = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.type === type) {
          typeEntries.push({ key, timestamp: entry.timestamp });
        }
      }

      if (typeEntries.length === 0) return;

      // Sort by timestamp (oldest first)
      typeEntries.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest 10% or at least 1 entry
      const toRemove = Math.max(1, Math.floor(typeEntries.length * 0.1));

      for (let i = 0; i < toRemove; i++) {
        this.delete(typeEntries[i].key);
      }

      console.debug(`Evicted ${toRemove} oldest entries of type: ${type}`);
    } catch (error) {
      console.error('Cache eviction error:', error.message);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    try {
      const stats = {
        totalEntries: this.cache.size,
        byType: {},
        memoryUsage: 0
      };

      for (const [key, entry] of this.cache.entries()) {
        if (!stats.byType[entry.type]) {
          stats.byType[entry.type] = 0;
        }
        stats.byType[entry.type]++;

        // Rough memory usage estimation
        stats.memoryUsage += JSON.stringify(entry).length;
      }

      return stats;
    } catch (error) {
      console.error('Cache stats error:', error.message);
      return { totalEntries: 0, byType: {}, memoryUsage: 0 };
    }
  }

  /**
   * Update cache configuration
   * @param {string} type - Cache type
   * @param {Object} newConfig - New configuration
   * @returns {void}
   */
  updateConfig(type, newConfig) {
    try {
      if (this.config[type]) {
        this.config[type] = { ...this.config[type], ...newConfig };
        console.info(`Updated cache config for ${type}:`, this.config[type]);
      }
    } catch (error) {
      console.error('Cache config update error:', error.message);
    }
  }
}

// Global cache instance
const performanceCache = new PerformanceCache();

/**
 * Batch RPC request manager for optimizing multiple calls
 */
class BatchRpcManager {
  constructor() {
    this.batches = new Map(); // network -> batch
    this.batchTimeout = 50; // ms to wait before sending batch
    this.maxBatchSize = 10;
  }

  /**
   * Add RPC request to batch
   * @param {string} network - Network name
   * @param {string} method - RPC method
   * @param {Array} params - RPC parameters
   * @returns {Promise} Promise that resolves with RPC result
   */
  async addToBatch(network, method, params) {
    return new Promise((resolve, reject) => {
      const rpcUrl = getRpcUrl(network);
      if (!rpcUrl) {
        reject(new Error(`No RPC URL for network: ${network}`));
        return;
      }

      const batchKey = `${network}:${rpcUrl}`;

      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, {
          requests: [],
          timer: null,
          rpcUrl
        });
      }

      const batch = this.batches.get(batchKey);
      const requestId = Date.now() + Math.random();

      batch.requests.push({
        id: requestId,
        method,
        params,
        resolve,
        reject
      });

      // Set timer for batch execution if not already set
      if (!batch.timer) {
        batch.timer = setTimeout(() => {
          this.executeBatch(batchKey);
        }, this.batchTimeout);
      }

      // Execute immediately if batch is full
      if (batch.requests.length >= this.maxBatchSize) {
        clearTimeout(batch.timer);
        this.executeBatch(batchKey);
      }
    });
  }

  /**
   * Execute batch RPC request
   * @param {string} batchKey - Batch identifier
   * @returns {Promise<void>}
   */
  async executeBatch(batchKey) {
    try {
      const batch = this.batches.get(batchKey);
      if (!batch || batch.requests.length === 0) {
        return;
      }

      // Clear timer and remove batch
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
      this.batches.delete(batchKey);

      // Prepare batch request
      const batchRequest = batch.requests.map((req, index) => ({
        jsonrpc: '2.0',
        method: req.method,
        params: req.params,
        id: index + 1
      }));

      console.debug(`Executing batch RPC with ${batchRequest.length} requests`);

      // Send batch request
      const [error, response] = await to(
        axios.post(batch.rpcUrl, batchRequest, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        })
      );

      if (error) {
        // Reject all requests in batch
        batch.requests.forEach(req => {
          req.reject(new Error(`Batch RPC failed: ${error.message}`));
        });
        return;
      }

      // Process responses
      const responses = Array.isArray(response.data) ? response.data : [response.data];

      batch.requests.forEach((req, index) => {
        const resp = responses.find(r => r.id === index + 1);
        if (resp) {
          if (resp.error) {
            req.reject(new Error(`RPC error: ${resp.error.message}`));
          } else {
            req.resolve(resp.result);
          }
        } else {
          req.reject(new Error('No response for request'));
        }
      });

    } catch (error) {
      console.error('Batch execution error:', error.message);

      // Reject all pending requests
      const batch = this.batches.get(batchKey);
      if (batch) {
        batch.requests.forEach(req => {
          req.reject(error);
        });
        this.batches.delete(batchKey);
      }
    }
  }

  /**
   * Get batch statistics
   * @returns {Object} Batch statistics
   */
  getStats() {
    const stats = {
      activeBatches: this.batches.size,
      totalPendingRequests: 0
    };

    for (const batch of this.batches.values()) {
      stats.totalPendingRequests += batch.requests.length;
    }

    return stats;
  }
}

// Global batch manager instance
const batchRpcManager = new BatchRpcManager();

// Uniswap V2 Contract Addresses
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';

// Uniswap V3 Contract Addresses
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

// Fee tiers for V3 pools (in basis points)
const FEE_TIERS = {
  LOW: 500,      // 0.05%
  MEDIUM: 3000,  // 0.3%
  HIGH: 10000    // 1%
};

// ABI Function Selectors
const SELECTORS = {
  // ERC20 selectors
  TRANSFER: '0xa9059cbb',
  APPROVE: '0x095ea7b3',
  ALLOWANCE: '0xdd62ed3e',
  BALANCE_OF: '0x70a08231',

  // Uniswap V2 Router selectors
  SWAP_EXACT_TOKENS_FOR_TOKENS: '0x38ed1739',
  SWAP_TOKENS_FOR_EXACT_TOKENS: '0x8803dbee',
  SWAP_EXACT_ETH_FOR_TOKENS: '0x7ff36ab5',
  SWAP_TOKENS_FOR_EXACT_ETH: '0x4a25d94a',
  SWAP_EXACT_TOKENS_FOR_ETH: '0x18cbafe5',
  SWAP_ETH_FOR_EXACT_TOKENS: '0xfb3bdb41',

  // Uniswap V2 Factory selectors
  GET_PAIR: '0xe6a43905',

  // Uniswap V2 Pair selectors
  GET_RESERVES: '0x0902f1ac',

  // Uniswap V3 Router selectors
  EXACT_INPUT_SINGLE: '0x414bf389',
  EXACT_OUTPUT_SINGLE: '0xdb3e2198',

  // Uniswap V3 Factory selectors
  GET_POOL: '0x1698ee82',

  // Uniswap V3 Pool selectors
  SLOT0: '0x3850c7bd',
  LIQUIDITY: '0x1a686502'
};

// Network configuration for Uniswap deployments
const NETWORK_CONFIG = {
  'ETHEREUM': {
    v2Router: UNISWAP_V2_ROUTER,
    v2Factory: UNISWAP_V2_FACTORY,
    v3Router: UNISWAP_V3_ROUTER,
    v3Factory: UNISWAP_V3_FACTORY,
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  'ETHEREUM-SEPOLIA': {
    v2Router: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008',
    v2Factory: '0x7E0987E5b3a30e3f2828572Bb659A548460a3003',
    v3Router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    v3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
  }
};

// Common token addresses for different networks
const COMMON_TOKENS = {
  'ETHEREUM': {
    USDC: '0xA0b86a33E6441b8435b662303c0f479c7e1d5916',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
  },
  'ETHEREUM-SEPOLIA': {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    DAI: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6'
  }
};

// RPC URLs for different networks (copied from eth.js)
const rpcUrls = {
  'ETHEREUM-SEPOLIA': [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.gateway.tenderly.co',
  ],
  'ETHEREUM': [
    'https://eth-mainnet.public.blastapi.io',
    'https://eth.llamarpc.com',
    'https://ethereum-rpc.publicnode.com',
  ],
  'ARBITRUM': [
    'https://arbitrum-rpc.publicnode.com',
    'https://arbitrum.llamarpc.com',
    'https://arbitrum-one-rpc.publicnode.com',
  ],
  'ARBITRUM-TESTNET': [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public',
    'https://arbitrum-sepolia.gateway.tenderly.co',
  ],
  'OPTIMISM': [
    'https://optimism-rpc.publicnode.com',
    'https://optimism.llamarpc.com',
    'https://rpc.ankr.com/optimism'
  ],
  'OPTIMISM-TESTNET': [
    'https://api.zan.top/opt-sepolia',
    'https://optimism-sepolia-rpc.publicnode.com',
    'https://optimism-sepolia.drpc.org',
  ],
  'BASE': [
    'https://base.llamarpc.com',
    'https://developer-access-mainnet.base.org',
    'https://base-mainnet.public.blastapi.io',
  ],
  'BASE-TESTNET': [
    'https://base-sepolia-rpc.publicnode.com',
    'https://sepolia.base.org',
    'https://base-sepolia.gateway.tenderly.co',
  ],
  'BNBSMARTCHAIN': [
    'https://bsc-dataseed2.bnbchain.org',
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed2.defibit.io',
  ],
  'BNBSMARTCHAIN-TESTNET': [
    'https://bsc-testnet.public.blastapi.io',
    'https://data-seed-prebsc-2-s2.bnbchain.org:8545',
    'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  ],
};

// ============================================================================
// RPC UTILITY FUNCTIONS
// ============================================================================

/**
 * Get random RPC URL from available URLs
 * @param {Array} urls - Array of RPC URLs
 * @returns {string} Random RPC URL
 */
function getRandomUrl(urls) {
  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex];
}

/**
 * Get RPC URL for a network
 * @param {string} network - Network name
 * @returns {string|null} RPC URL or null if network not supported
 */
function getRpcUrl(network) {
  const urls = rpcUrls[network];
  if (!urls) {
    return null;
  }
  return getRandomUrl(urls);
}

/**
 * Send RPC request to blockchain node
 * @param {string} rpcUrl - RPC endpoint URL
 * @param {string} method - RPC method name
 * @param {Array} params - RPC method parameters
 * @returns {Promise<any|null>} RPC result or null if error
 */
async function sendRpcRequest(rpcUrl, method, params = []) {
  if (!rpcUrl) {
    return null;
  }

  const [error, response] = await to(
    axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  );

  console.warn(`========= sendRpcRequest: ${rpcUrl} ${method} ${JSON.stringify(params)}`);

  if (error) {
    console.error(`Failed to sendRpcRequest: ${rpcUrl} ${method}`, error.message);
    return null;
  }

  return response.data.result ? response.data.result : null;
}

/**
 * Send cached RPC request with performance optimization
 * @param {string} network - Network name
 * @param {string} method - RPC method name
 * @param {Array} params - RPC method parameters
 * @param {Object} [options] - Caching options
 * @param {boolean} [options.useCache=true] - Whether to use cache
 * @param {boolean} [options.useBatch=false] - Whether to use batch processing
 * @returns {Promise<any|null>} RPC result or null if error
 */
async function sendCachedRpcRequest(network, method, params = [], options = {}) {
  const { useCache = true, useBatch = false } = options;

  try {
    // Generate cache key for this RPC call
    const cacheKey = [network, method, JSON.stringify(params)];

    // Check cache first if enabled
    if (useCache) {
      const cachedResult = performanceCache.get('rpc', cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    let result;

    if (useBatch) {
      // Use batch processing for better performance
      result = await batchRpcManager.addToBatch(network, method, params);
    } else {
      // Use regular RPC call
      const rpcUrl = getRpcUrl(network);
      result = await sendRpcRequest(rpcUrl, method, params);
    }

    // Cache the result if successful and caching is enabled
    if (result !== null && useCache) {
      performanceCache.set('rpc', cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error(`Failed to send cached RPC request: ${network} ${method}`, error.message);
    return null;
  }
}

/**
 * Send multiple RPC requests in parallel with caching
 * @param {string} network - Network name
 * @param {Array} requests - Array of {method, params} objects
 * @param {Object} [options] - Options for caching and batching
 * @returns {Promise<Array>} Array of results
 */
async function sendMultipleRpcRequests(network, requests, options = {}) {
  const { useCache = true, useBatch = true } = options;

  try {
    const promises = requests.map(req =>
      sendCachedRpcRequest(network, req.method, req.params, { useCache, useBatch })
    );

    return await Promise.all(promises);
  } catch (error) {
    console.error(`Failed to send multiple RPC requests: ${network}`, error.message);
    return requests.map(() => null);
  }
}

/**
 * Get network configuration for Uniswap contracts
 * @param {string} network - Network name (e.g., 'ETHEREUM', 'ETHEREUM-SEPOLIA')
 * @returns {Object|null} Network configuration object or null if not supported
 */
function getNetworkConfig(network) {
  const config = NETWORK_CONFIG[network.toUpperCase()];
  if (!config) {
    console.error(`Unsupported network for Uniswap: ${network}`);
    return null;
  }
  return config;
}

/**
 * Get common token addresses for a network
 * @param {string} network - Network name
 * @returns {Object} Token addresses object
 */
function getCommonTokens(network) {
  return COMMON_TOKENS[network.toUpperCase()] || {};
}

/**
 * Check if a network supports Uniswap
 * @param {string} network - Network name
 * @returns {boolean} True if network is supported
 */
function isNetworkSupported(network) {
  return !!NETWORK_CONFIG[network.toUpperCase()];
}

/**
 * Get fee tier name from fee amount
 * @param {number} fee - Fee amount in basis points
 * @returns {string} Fee tier name
 */
function getFeeTierName(fee) {
  switch (fee) {
    case FEE_TIERS.LOW:
      return 'LOW';
    case FEE_TIERS.MEDIUM:
      return 'MEDIUM';
    case FEE_TIERS.HIGH:
      return 'HIGH';
    default:
      return 'CUSTOM';
  }
}

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid address format
 */
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate amount string (should be numeric)
 * @param {string} amount - Amount to validate
 * @returns {boolean} True if valid amount
 */
function isValidAmount(amount) {
  try {
    const num = BigInt(amount);
    return num >= 0n;
  } catch {
    return false;
  }
}

// ============================================================================
// UNISWAP CALCULATION UTILITIES
// ============================================================================

/**
 * Calculate output amount for Uniswap V2 swap using constant product formula
 * @param {string} reserveIn - Reserve of input token (in wei)
 * @param {string} reserveOut - Reserve of output token (in wei)
 * @param {string} amountIn - Input amount (in wei)
 * @param {number} fee - Fee in basis points (default 300 for 0.3%)
 * @returns {string} Output amount in wei
 */
function calculateV2SwapOutput(reserveIn, reserveOut, amountIn, fee = 300) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);

    // Validate inputs
    if (reserveInBig <= 0n || reserveOutBig <= 0n || amountInBig <= 0n) {
      throw new Error('Invalid reserves or amount');
    }

    // Calculate fee multiplier (10000 - fee) / 10000
    const feeMultiplier = BigInt(10000 - fee);
    const feeDenominator = BigInt(10000);

    // amountInWithFee = amountIn * (10000 - fee)
    const amountInWithFee = amountInBig * feeMultiplier;

    // numerator = amountInWithFee * reserveOut
    const numerator = amountInWithFee * reserveOutBig;

    // denominator = (reserveIn * 10000) + amountInWithFee
    const denominator = (reserveInBig * feeDenominator) + amountInWithFee;

    // amountOut = numerator / denominator
    const amountOut = numerator / denominator;

    return amountOut.toString();
  } catch (error) {
    console.error('Error calculating V2 swap output:', error.message);
    throw error;
  }
}

/**
 * Calculate input amount needed for desired output in Uniswap V2
 * @param {string} reserveIn - Reserve of input token (in wei)
 * @param {string} reserveOut - Reserve of output token (in wei)
 * @param {string} amountOut - Desired output amount (in wei)
 * @param {number} fee - Fee in basis points (default 300 for 0.3%)
 * @returns {string} Required input amount in wei
 */
function calculateV2SwapInput(reserveIn, reserveOut, amountOut, fee = 300) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountOutBig = BigInt(amountOut);

    // Validate inputs
    if (reserveInBig <= 0n || reserveOutBig <= 0n || amountOutBig <= 0n) {
      throw new Error('Invalid reserves or amount');
    }

    if (amountOutBig >= reserveOutBig) {
      throw new Error('Insufficient liquidity');
    }

    // Calculate fee multiplier
    const feeMultiplier = BigInt(10000 - fee);
    const feeDenominator = BigInt(10000);

    // numerator = reserveIn * amountOut * 10000
    const numerator = reserveInBig * amountOutBig * feeDenominator;

    // denominator = (reserveOut - amountOut) * (10000 - fee)
    const denominator = (reserveOutBig - amountOutBig) * feeMultiplier;

    // amountIn = (numerator / denominator) + 1 (add 1 for rounding)
    const amountIn = (numerator / denominator) + 1n;

    return amountIn.toString();
  } catch (error) {
    console.error('Error calculating V2 swap input:', error.message);
    throw error;
  }
}

/**
 * Calculate price impact for a swap
 * @param {string} reserveIn - Reserve of input token
 * @param {string} reserveOut - Reserve of output token
 * @param {string} amountIn - Input amount
 * @param {string} amountOut - Output amount
 * @returns {number} Price impact as percentage (0-100)
 */
function calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);
    const amountOutBig = BigInt(amountOut);

    // Calculate spot price before trade: reserveOut / reserveIn
    const spotPriceBefore = (reserveOutBig * BigInt(1e18)) / reserveInBig;

    // Calculate effective price: amountOut / amountIn
    const effectivePrice = (amountOutBig * BigInt(1e18)) / amountInBig;

    // Price impact = (spotPrice - effectivePrice) / spotPrice * 100
    const priceImpactBig = ((spotPriceBefore - effectivePrice) * BigInt(10000)) / spotPriceBefore;

    // Convert to percentage (divide by 100 since we multiplied by 10000)
    return Number(priceImpactBig) / 100;
  } catch (error) {
    console.error('Error calculating price impact:', error.message);
    return 0;
  }
}

/**
 * Apply slippage to an amount
 * @param {string} amount - Original amount
 * @param {number} slippagePercent - Slippage percentage (e.g., 0.5 for 0.5%)
 * @param {boolean} isMinimum - If true, calculate minimum amount (subtract slippage)
 * @returns {string} Amount with slippage applied
 */
function applySlippage(amount, slippagePercent, isMinimum = true) {
  try {
    const amountBig = BigInt(amount);
    const slippageBasisPoints = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points

    if (isMinimum) {
      // For minimum amount, subtract slippage
      const slippageAmount = (amountBig * slippageBasisPoints) / BigInt(10000);
      return (amountBig - slippageAmount).toString();
    } else {
      // For maximum amount, add slippage
      const slippageAmount = (amountBig * slippageBasisPoints) / BigInt(10000);
      return (amountBig + slippageAmount).toString();
    }
  } catch (error) {
    console.error('Error applying slippage:', error.message);
    throw error;
  }
}

// ============================================================================
// HEX ENCODING/DECODING UTILITIES
// ============================================================================

/**
 * Encode function call data for contract interaction
 * @param {string} selector - Function selector (4 bytes)
 * @param {Array} params - Array of parameters to encode
 * @returns {string} Encoded function call data
 */
function encodeFunctionCall(selector, params = []) {
  try {
    let data = selector.startsWith('0x') ? selector : '0x' + selector;

    for (const param of params) {
      if (typeof param === 'string' && param.startsWith('0x')) {
        // Address parameter - pad to 32 bytes
        data += param.slice(2).padStart(64, '0');
      } else if (typeof param === 'string' && /^\d+$/.test(param)) {
        // Numeric string parameter - convert to hex and pad
        const hex = BigInt(param).toString(16);
        data += hex.padStart(64, '0');
      } else if (typeof param === 'number') {
        // Number parameter - convert to hex and pad
        const hex = param.toString(16);
        data += hex.padStart(64, '0');
      } else {
        throw new Error(`Unsupported parameter type: ${typeof param}`);
      }
    }

    return data;
  } catch (error) {
    console.error('Error encoding function call:', error.message);
    throw error;
  }
}

/**
 * Encode address parameter for contract calls
 * @param {string} address - Ethereum address
 * @returns {string} Encoded address (64 characters, no 0x prefix)
 */
function encodeAddress(address) {
  if (!isValidAddress(address)) {
    throw new Error('Invalid address format');
  }
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Encode uint256 parameter for contract calls
 * @param {string|number|bigint} value - Value to encode
 * @returns {string} Encoded value (64 characters, no 0x prefix)
 */
function encodeUint256(value) {
  try {
    const bigIntValue = BigInt(value);
    if (bigIntValue < 0n) {
      throw new Error('Value cannot be negative');
    }
    return bigIntValue.toString(16).padStart(64, '0');
  } catch (error) {
    console.error('Error encoding uint256:', error.message);
    throw error;
  }
}

/**
 * Decode hex string to decimal string
 * @param {string} hex - Hex string to decode
 * @returns {string} Decimal string
 */
function decodeHexToDecimal(hex) {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return BigInt('0x' + cleanHex).toString();
  } catch (error) {
    console.error('Error decoding hex to decimal:', error.message);
    throw error;
  }
}

/**
 * Decode address from contract call result
 * @param {string} hex - Hex string (64 characters)
 * @returns {string} Ethereum address
 */
function decodeAddress(hex) {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (cleanHex.length !== 64) {
      throw new Error('Invalid hex length for address');
    }
    return '0x' + cleanHex.slice(-40);
  } catch (error) {
    console.error('Error decoding address:', error.message);
    throw error;
  }
}

// ============================================================================
// TOKEN APPROVAL HANDLING
// ============================================================================

/**
 * Check ERC20 token allowance for a spender
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (usually router)
 * @returns {Promise<string|null>} Current allowance amount in wei or null if error
 */
async function getTokenAllowance(network, tokenAddress, ownerAddress, spenderAddress) {
  try {
    if (!isValidAddress(tokenAddress) || !isValidAddress(ownerAddress) || !isValidAddress(spenderAddress)) {
      throw new Error('Invalid address format');
    }

    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Encode allowance(address,address) call
    const data = encodeFunctionCall(SELECTORS.ALLOWANCE, [ownerAddress, spenderAddress]);

    const result = await sendRpcRequest(rpcUrl, 'eth_call', [
      {
        to: tokenAddress,
        data: data
      },
      'latest'
    ]);

    if (!result || result === '0x') {
      return '0';
    }

    return decodeHexToDecimal(result);
  } catch (error) {
    console.error('Error getting token allowance:', error.message);
    return null;
  }
}

/**
 * Check if token approval is sufficient for the required amount
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token contract address
 * @param {string} ownerAddress - Token owner address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} requiredAmount - Required amount in wei
 * @returns {Promise<Object>} Approval status with isApproved boolean and current allowance
 */
async function checkTokenApproval(network, tokenAddress, ownerAddress, spenderAddress, requiredAmount) {
  try {
    console.warn("----",network, tokenAddress, ownerAddress, spenderAddress, requiredAmount);
    const currentAllowance = await getTokenAllowance(network, tokenAddress, ownerAddress, spenderAddress);

    console.warn("----",currentAllowance);
    if (currentAllowance === null) {
      return {
        isApproved: false,
        currentAllowance: '0',
        requiredAmount,
        error: 'Failed to check allowance'
      };
    }

    const isApproved = BigInt(currentAllowance) >= BigInt(requiredAmount);

    return {
      isApproved,
      currentAllowance,
      requiredAmount,
      needsApproval: !isApproved
    };
  } catch (error) {
    console.error('Error checking token approval:', error.message);
    return {
      isApproved: false,
      currentAllowance: '0',
      requiredAmount,
      error: error.message
    };
  }
}

/**
 * Generate approval transaction data for ERC20 token
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Amount to approve in wei
 * @returns {string} Encoded approval transaction data
 */
function getApprovalCalldata(spenderAddress, amount) {
  try {
    if (!isValidAddress(spenderAddress)) {
      throw new Error('Invalid spender address');
    }

    if (!isValidAmount(amount)) {
      throw new Error('Invalid amount');
    }

    // Clean and format spender address
    let cleanSpender = spenderAddress.toLowerCase();
    cleanSpender = cleanSpender.startsWith('0x') ? cleanSpender.slice(2) : cleanSpender;
    cleanSpender = cleanSpender.padStart(64, '0');

    // Convert amount to hex and pad
    const amountHex = BigInt(amount).toString(16).padStart(64, '0');

    return `${SELECTORS.APPROVE}${cleanSpender}${amountHex}`;
  } catch (error) {
    console.error('Error generating approval calldata:', error.message);
    throw error;
  }
}

/**
 * Execute token approval transaction
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Token owner address
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Amount to approve in wei
 * @param {string} network - Network name
 * @returns {Promise<Object|null>} Transaction result or null if error
 */
async function executeTokenApproval(password, fromAddress, tokenAddress, spenderAddress, amount, network) {
  try {
    // Import required modules
    const eth = require('./eth');
    const commonUtil = require('./utils');
    const to = require('await-to-js').default;

    // Validate inputs
    if (!isValidAddress(fromAddress) || !isValidAddress(tokenAddress) || !isValidAddress(spenderAddress)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amount)) {
      throw new Error('Invalid amount');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Get transaction essentials (nonce, gas price)
    const txEssentials = await eth.get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }

    const { nonce, gas_price: gasPrice } = txEssentials;

    // Generate approval calldata
    const callData = getApprovalCalldata(spenderAddress, amount);

    // Estimate gas for approval transaction
    const gas = await eth.estimate_gas(network, fromAddress, tokenAddress, 0, '0x' + callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    // Calculate gas fee with multiplier (using same pattern as transferEthErc20)
    const GAS_PRICE_MULTIPLIER = 1.2; // 20% buffer
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));
    const gasFee = finalGasPrice * BigInt(gas);

    // Get network configuration for chain ID
    // function getNetwork(networkName) {
    //   const networkMap = {
    //     'ETHEREUM': 1,
    //     'ETHEREUM-SEPOLIA': 11155111,
    //     'ARBITRUM': 42161,
    //     'ARBITRUM-TESTNET': 421614,
    //     'OPTIMISM': 10,
    //     'OPTIMISM-TESTNET': 11155420,
    //     'BASE': 8453,
    //     'BASE-TESTNET': 84532,
    //     'BNBSMARTCHAIN': 56,
    //     'BNBSMARTCHAIN-TESTNET': 97
    //   };
    //   return networkMap[networkName.toUpperCase()] || 1;
    // }

    // Prepare payload for hardware wallet signing
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: tokenAddress,
          value: '0',
          gas_price: finalGasPrice.toString(),
          gas: gas.toString(),
          data: callData,
          network: getNetwork(network),
        },
        key: {
          Password: password,
        },
      },
    };

    // Sign transaction using hardware wallet
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');

    // Get binary path (using same pattern as transferEthErc20)
    const DEEPER_WALLET_BIN_PATH = process.env.DEEPER_WALLET_BIN_PATH || 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';

    const [err, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
    if (err) {
      throw new Error('Failed to sign approval transaction');
    }

    const [parseErr, signResult] = await to(commonUtil.jsonParse(stdout));
    if (parseErr || !signResult?.signature) {
      throw new Error(`Invalid sign_tx output: ${stdout}`);
    }

    // Send signed transaction
    const signedTransaction = `0x${signResult.signature.replace(/^"|"$/g, '')}`;
    const txHash = await eth.sendEthRawTransaction(network, signedTransaction);

    if (!txHash) {
      throw new Error('Failed to send approval transaction');
    }

    return {
      transactionHash: txHash,
      tokenAddress,
      spenderAddress,
      approvedAmount: amount,
      gasUsed: gas,
      gasPrice: finalGasPrice.toString(),
      nonce
    };
  } catch (error) {
    console.error('Error executing token approval:', error.message);
    return null;
  }
}

/**
 * Handle token approval with retry logic and validation
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Token owner address
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Required amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.retryDelay=2000] - Delay between retries in ms
 * @returns {Promise<Object>} Approval result with status and transaction details
 */
async function handleTokenApproval(password, fromAddress, tokenAddress, spenderAddress, amount, network, options = {}) {
  try {
    const { maxRetries = 3, retryDelay = 2000 } = options;

    // First check if approval is already sufficient
    const approvalStatus = await checkTokenApproval(network, tokenAddress, fromAddress, spenderAddress, amount);

    if (approvalStatus.error) {
      return {
        success: false,
        error: approvalStatus.error,
        needsApproval: true
      };
    }

    if (approvalStatus.isApproved) {
      return {
        success: true,
        alreadyApproved: true,
        currentAllowance: approvalStatus.currentAllowance,
        requiredAmount: amount,
        needsApproval: false
      };
    }

    // Need to execute approval transaction
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.info(`Attempting token approval (attempt ${attempt}/${maxRetries})`);

        const approvalResult = await executeTokenApproval(
          password,
          fromAddress,
          tokenAddress,
          spenderAddress,
          amount,
          network
        );

        if (approvalResult) {
          // Wait a moment for transaction to be mined
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify approval was successful
          const verificationStatus = await checkTokenApproval(network, tokenAddress, fromAddress, spenderAddress, amount);

          if (verificationStatus.isApproved) {
            return {
              success: true,
              transactionHash: approvalResult.transactionHash,
              approvedAmount: amount,
              gasUsed: approvalResult.gasUsed,
              gasPrice: approvalResult.gasPrice,
              attempt,
              needsApproval: false
            };
          } else {
            lastError = new Error('Approval transaction succeeded but verification failed');
          }
        } else {
          lastError = new Error('Approval transaction failed');
        }
      } catch (error) {
        lastError = error;
        console.error(`Approval attempt ${attempt} failed:`, error.message);
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All approval attempts failed',
      attempts: maxRetries,
      needsApproval: true
    };
  } catch (error) {
    console.error('Error in handleTokenApproval:', error.message);
    return {
      success: false,
      error: error.message,
      needsApproval: true
    };
  }
}

/**
 * Get the appropriate spender address for Uniswap operations
 * @param {string} network - Network name
 * @param {string} [version='V2'] - Uniswap version ('V2' or 'V3')
 * @returns {string|null} Spender address or null if network not supported
 */
function getUniswapSpenderAddress(network, version = 'V2') {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      return null;
    }

    return version === 'V3' ? config.v3Router : config.v2Router;
  } catch (error) {
    console.error('Error getting Uniswap spender address:', error.message);
    return null;
  }
}

// ============================================================================
// INPUT VALIDATION UTILITIES
// ============================================================================

/**
 * Validate swap parameters
 * @param {Object} params - Swap parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string} params.amountIn - Input amount
 * @param {string} params.network - Network name
 * @param {string} [params.fromAddress] - Sender address (optional)
 * @param {number} [params.slippage] - Slippage percentage (optional)
 * @param {number} [params.deadline] - Transaction deadline (optional)
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validateSwapParams(params) {
  const errors = [];

  // Validate required parameters exist
  if (!params || typeof params !== 'object') {
    errors.push('Parameters object is required');
    return { isValid: false, errors };
  }

  // Validate token addresses
  if (!params.tokenIn) {
    errors.push('Input token address is required');
  } else if (!isValidAddress(params.tokenIn)) {
    errors.push('Invalid input token address format');
  }

  if (!params.tokenOut) {
    errors.push('Output token address is required');
  } else if (!isValidAddress(params.tokenOut)) {
    errors.push('Invalid output token address format');
  }

  if (params.tokenIn && params.tokenOut && params.tokenIn.toLowerCase() === params.tokenOut.toLowerCase()) {
    errors.push('Input and output tokens cannot be the same');
  }

  // Validate amount
  if (!params.amountIn) {
    errors.push('Input amount is required');
  } else if (!isValidAmount(params.amountIn)) {
    errors.push('Invalid input amount format');
  } else if (BigInt(params.amountIn) <= 0n) {
    errors.push('Input amount must be greater than zero');
  } else {
    // Check for reasonable amount limits
    const maxAmount = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'); // Max uint256
    const minAmount = BigInt('1');

    if (BigInt(params.amountIn) > maxAmount) {
      errors.push('Input amount exceeds maximum allowed value');
    }
    if (BigInt(params.amountIn) < minAmount) {
      errors.push('Input amount is too small');
    }
  }

  // Validate network
  if (!params.network) {
    errors.push('Network is required');
  } else if (!isNetworkSupported(params.network)) {
    errors.push(`Unsupported network: ${params.network}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
  }

  // Validate optional parameters
  if (params.fromAddress && !isValidAddress(params.fromAddress)) {
    errors.push('Invalid sender address format');
  }

  if (params.slippage !== undefined && !isValidSlippage(params.slippage)) {
    errors.push('Invalid slippage percentage (must be between 0 and 50)');
  }

  if (params.deadline !== undefined && !isValidDeadline(params.deadline)) {
    errors.push('Invalid deadline (must be future timestamp within 1 hour)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate pool query parameters
 * @param {Object} params - Pool parameters
 * @param {string} params.tokenA - First token address
 * @param {string} params.tokenB - Second token address
 * @param {string} params.network - Network name
 * @param {number} [params.fee] - Fee tier for V3 pools (optional)
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validatePoolParams(params) {
  const errors = [];

  // Validate required parameters exist
  if (!params || typeof params !== 'object') {
    errors.push('Parameters object is required');
    return { isValid: false, errors };
  }

  // Validate token addresses
  if (!params.tokenA) {
    errors.push('Token A address is required');
  } else if (!isValidAddress(params.tokenA)) {
    errors.push('Invalid token A address format');
  }

  if (!params.tokenB) {
    errors.push('Token B address is required');
  } else if (!isValidAddress(params.tokenB)) {
    errors.push('Invalid token B address format');
  }

  if (params.tokenA && params.tokenB && params.tokenA.toLowerCase() === params.tokenB.toLowerCase()) {
    errors.push('Token A and Token B cannot be the same');
  }

  // Validate network
  if (!params.network) {
    errors.push('Network is required');
  } else if (!isNetworkSupported(params.network)) {
    errors.push(`Unsupported network: ${params.network}. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
  }

  // Validate optional fee parameter
  if (params.fee !== undefined) {
    const validFees = Object.values(FEE_TIERS);
    if (!validFees.includes(params.fee)) {
      errors.push(`Invalid fee tier: ${params.fee}. Valid fee tiers: ${validFees.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate slippage percentage
 * @param {number} slippage - Slippage percentage
 * @returns {boolean} True if valid slippage
 */
function isValidSlippage(slippage) {
  return typeof slippage === 'number' && slippage >= 0 && slippage <= 50; // Max 50% slippage
}

/**
 * Validate deadline timestamp
 * @param {number} deadline - Unix timestamp
 * @returns {boolean} True if valid deadline
 */
function isValidDeadline(deadline) {
  if (typeof deadline !== 'number' || !Number.isInteger(deadline)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const maxDeadline = now + 3600; // Max 1 hour from now
  const minDeadline = now + 60; // Min 1 minute from now

  return deadline >= minDeadline && deadline <= maxDeadline;
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Error codes for different types of Uniswap errors
 */
const ERROR_CODES = {
  // Validation errors
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',
  INVALID_TOKEN_ADDRESS: 'INVALID_TOKEN_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_NETWORK: 'INVALID_NETWORK',
  INVALID_SLIPPAGE: 'INVALID_SLIPPAGE',
  INVALID_DEADLINE: 'INVALID_DEADLINE',

  // Pool errors
  POOL_NOT_FOUND: 'POOL_NOT_FOUND',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  POOL_DATA_UNAVAILABLE: 'POOL_DATA_UNAVAILABLE',

  // Swap errors
  SWAP_FAILED: 'SWAP_FAILED',
  HIGH_PRICE_IMPACT: 'HIGH_PRICE_IMPACT',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',

  // Approval errors
  APPROVAL_FAILED: 'APPROVAL_FAILED',
  INSUFFICIENT_ALLOWANCE: 'INSUFFICIENT_ALLOWANCE',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // Transaction errors
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  GAS_ESTIMATION_FAILED: 'GAS_ESTIMATION_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE'
};

/**
 * Create a standardized error object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Additional error details
 * @returns {Object} Standardized error object
 */
function createError(code, message, details = {}) {
  return {
    error: true,
    code,
    message,
    details,
    timestamp: Math.floor(Date.now() / 1000)
  };
}

/**
 * Create user-friendly error messages for common scenarios
 * @param {string} code - Error code
 * @param {Object} [context] - Additional context for the error
 * @returns {string} User-friendly error message
 */
function getUserFriendlyErrorMessage(code, context = {}) {
  switch (code) {
    case ERROR_CODES.INVALID_TOKEN_ADDRESS:
      return 'The token address provided is not valid. Please check the address format.';

    case ERROR_CODES.INVALID_AMOUNT:
      return 'The amount provided is not valid. Please enter a positive number.';

    case ERROR_CODES.INVALID_NETWORK:
      return `The network "${context.network}" is not supported. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}.`;

    case ERROR_CODES.POOL_NOT_FOUND:
      return 'No liquidity pool found for this token pair. Trading is not available.';

    case ERROR_CODES.INSUFFICIENT_LIQUIDITY:
      return 'Insufficient liquidity in the pool for this trade size. Try reducing the amount.';

    case ERROR_CODES.HIGH_PRICE_IMPACT:
      return `This trade will have a high price impact (${context.priceImpact?.toFixed(2)}%). Consider reducing the trade size.`;

    case ERROR_CODES.SLIPPAGE_EXCEEDED:
      return 'The price moved too much during the transaction. Try increasing slippage tolerance or reducing trade size.';

    case ERROR_CODES.APPROVAL_FAILED:
      return 'Token approval failed. Please try again or check your wallet connection.';

    case ERROR_CODES.INSUFFICIENT_ALLOWANCE:
      return 'Insufficient token allowance. Please approve the token for trading first.';

    case ERROR_CODES.NETWORK_ERROR:
      return 'Network connection error. Please check your internet connection and try again.';

    case ERROR_CODES.TRANSACTION_FAILED:
      return 'Transaction failed. Please check your wallet balance and network connection.';

    case ERROR_CODES.GAS_ESTIMATION_FAILED:
      return 'Unable to estimate gas costs. The transaction may fail or network may be congested.';

    case ERROR_CODES.INSUFFICIENT_BALANCE:
      return 'Insufficient balance to complete this transaction including gas fees.';

    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Validate and sanitize input parameters for any function
 * @param {Object} params - Parameters to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result with sanitized params or errors
 */
function validateAndSanitizeParams(params, schema) {
  const errors = [];
  const sanitized = {};

  if (!params || typeof params !== 'object') {
    return {
      isValid: false,
      errors: ['Parameters object is required'],
      sanitized: null
    };
  }

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key];

    // Check if required parameter is missing
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${key} is required`);
      continue;
    }

    // Skip validation for optional missing parameters
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${key} must be of type ${rules.type}`);
      continue;
    }

    // Custom validation function
    if (rules.validate && !rules.validate(value)) {
      errors.push(rules.errorMessage || `${key} is invalid`);
      continue;
    }

    // Transform/sanitize the value
    sanitized[key] = rules.transform ? rules.transform(value) : value;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null
  };
}

/**
 * Check if an amount would cause high price impact
 * @param {number} priceImpact - Price impact percentage
 * @returns {Object} Price impact analysis
 */
function analyzePriceImpact(priceImpact) {
  const impact = {
    percentage: priceImpact,
    level: 'LOW',
    warning: null,
    shouldWarn: false,
    shouldBlock: false
  };

  if (priceImpact > 20) {
    impact.level = 'CRITICAL';
    impact.warning = 'CRITICAL: Extremely high price impact (>20%). This trade will significantly affect the token price.';
    impact.shouldBlock = true;
  } else if (priceImpact > 15) {
    impact.level = 'VERY_HIGH';
    impact.warning = 'WARNING: Very high price impact (>15%). Consider reducing trade size significantly.';
    impact.shouldWarn = true;
  } else if (priceImpact > 5) {
    impact.level = 'HIGH';
    impact.warning = 'CAUTION: High price impact (>5%). Trade will noticeably affect price.';
    impact.shouldWarn = true;
  } else if (priceImpact > 1) {
    impact.level = 'MODERATE';
    impact.warning = 'INFO: Moderate price impact (>1%). Price will be slightly affected.';
    impact.shouldWarn = false;
  }

  return impact;
}

/**
 * Validate liquidity sufficiency for a trade
 * @param {string} reserveIn - Input token reserve
 * @param {string} reserveOut - Output token reserve
 * @param {string} amountIn - Input amount
 * @returns {Object} Liquidity analysis
 */
function validateLiquidity(reserveIn, reserveOut, amountIn) {
  try {
    const reserveInBig = BigInt(reserveIn);
    const reserveOutBig = BigInt(reserveOut);
    const amountInBig = BigInt(amountIn);

    const analysis = {
      sufficient: true,
      utilizationPercentage: 0,
      warning: null,
      maxTradeSize: null
    };

    // Calculate utilization percentage
    analysis.utilizationPercentage = Number((amountInBig * BigInt(100)) / reserveInBig);

    // Check if trade size is too large relative to pool
    if (analysis.utilizationPercentage > 50) {
      analysis.sufficient = false;
      analysis.warning = 'Trade size exceeds 50% of pool reserves. This will cause extreme price impact.';
    } else if (analysis.utilizationPercentage > 25) {
      analysis.warning = 'Large trade relative to pool size (>25% of reserves). Expect high price impact.';
    } else if (analysis.utilizationPercentage > 10) {
      analysis.warning = 'Moderate trade size relative to pool (>10% of reserves). Some price impact expected.';
    }

    // Calculate maximum recommended trade size (10% of reserves)
    analysis.maxTradeSize = (reserveInBig / BigInt(10)).toString();

    return analysis;
  } catch (error) {
    return {
      sufficient: false,
      utilizationPercentage: 0,
      warning: 'Unable to analyze liquidity',
      maxTradeSize: null,
      error: error.message
    };
  }
}

/**
 * Wrap async functions with comprehensive error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} operation - Operation name for logging
 * @returns {Function} Wrapped function with error handling
 */
function withErrorHandling(fn, operation) {
  return async function (...args) {
    try {
      const result = await fn.apply(this, args);
      return result;
    } catch (error) {
      console.error(`Error in ${operation}:`, error.message);

      // Categorize error types
      if (error.message.includes('network') || error.message.includes('timeout')) {
        return createError(ERROR_CODES.NETWORK_ERROR, getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR), {
          operation,
          originalError: error.message
        });
      }

      if (error.message.includes('insufficient')) {
        return createError(ERROR_CODES.INSUFFICIENT_LIQUIDITY, getUserFriendlyErrorMessage(ERROR_CODES.INSUFFICIENT_LIQUIDITY), {
          operation,
          originalError: error.message
        });
      }

      if (error.message.includes('invalid') || error.message.includes('Invalid')) {
        return createError(ERROR_CODES.INVALID_PARAMETERS, getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS), {
          operation,
          originalError: error.message
        });
      }

      // Generic error
      return createError(ERROR_CODES.NETWORK_ERROR, 'An unexpected error occurred. Please try again.', {
        operation,
        originalError: error.message
      });
    }
  };
}

// ============================================================================
// POOL QUERY FUNCTIONALITY
// ============================================================================

/**
 * Get Uniswap V2 pair address for two tokens
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {Promise<string|null>} Pair address or null if not found
 */
async function getV2PairAddress(network, tokenA, tokenB, options = {}) {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Sort tokens (Uniswap V2 requires sorted addresses)
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Check cache first
    const cacheKey = [network, 'v2-pair', token0, token1];
    const cachedAddress = performanceCache.get('existence', cacheKey);
    if (cachedAddress !== null) {
      return cachedAddress;
    }

    // Encode getPair(address,address) call
    const data = encodeFunctionCall(SELECTORS.GET_PAIR, [token0, token1]);

    const result = await sendCachedRpcRequest(network, 'eth_call', [
      {
        to: config.v2Factory,
        data: data
      },
      'latest'
    ], options);

    if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      // Cache null result to avoid repeated failed lookups
      performanceCache.set('existence', cacheKey, null);
      return null; // Pair doesn't exist
    }

    const pairAddress = decodeAddress(result);

    // Cache the successful result
    performanceCache.set('existence', cacheKey, pairAddress);

    return pairAddress;
  } catch (error) {
    console.error('Error getting V2 pair address:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V3 pool address for two tokens and fee tier
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} fee - Fee tier (500, 3000, 10000)
 * @returns {Promise<string|null>} Pool address or null if not found
 */
async function getV3PoolAddress(network, tokenA, tokenB, fee) {
  try {
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Sort tokens (Uniswap V3 requires sorted addresses)
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Encode getPool(address,address,uint24) call
    const data = encodeFunctionCall(SELECTORS.GET_POOL, [token0, token1, fee]);

    const rpcUrl = getRpcUrl(network);
    const result = await sendRpcRequest(rpcUrl, 'eth_call', [
      {
        to: config.v3Factory,
        data: data
      },
      'latest'
    ]);

    if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return null; // Pool doesn't exist
    }

    return decodeAddress(result);
  } catch (error) {
    console.error('Error getting V3 pool address:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V2 pool reserves and metadata
 * @param {string} network - Network name
 * @param {string} pairAddress - V2 pair contract address
 * @returns {Promise<Object|null>} Pool reserves data or null if error
 */
async function getV2PoolReserves(network, pairAddress, options = {}) {
  try {
    if (!isValidAddress(pairAddress)) {
      throw new Error('Invalid pair address');
    }

    // Check cache first
    const cacheKey = [network, 'v2-reserves', pairAddress];
    const cachedReserves = performanceCache.get('pools', cacheKey);
    if (cachedReserves !== null) {
      return cachedReserves;
    }

    // Call getReserves() function
    const result = await sendCachedRpcRequest(network, 'eth_call', [
      {
        to: pairAddress,
        data: SELECTORS.GET_RESERVES
      },
      'latest'
    ], options);

    if (!result || result === '0x') {
      return null;
    }

    // Decode the result (reserve0, reserve1, blockTimestampLast)
    // Each value is 32 bytes (64 hex characters)
    const reserve0Hex = result.slice(2, 66);
    const reserve1Hex = result.slice(66, 130);
    const blockTimestampLastHex = result.slice(130, 194);

    const reserve0 = decodeHexToDecimal('0x' + reserve0Hex);
    const reserve1 = decodeHexToDecimal('0x' + reserve1Hex);
    const blockTimestampLast = decodeHexToDecimal('0x' + blockTimestampLastHex);

    const reservesData = {
      reserve0,
      reserve1,
      blockTimestampLast,
      version: 'V2'
    };

    // Cache the result
    performanceCache.set('pools', cacheKey, reservesData);

    return reservesData;
  } catch (error) {
    console.error('Error getting V2 pool reserves:', error.message);
    return null;
  }
}

/**
 * Get Uniswap V3 pool liquidity and slot0 data
 * @param {string} network - Network name
 * @param {string} poolAddress - V3 pool contract address
 * @returns {Promise<Object|null>} Pool liquidity data or null if error
 */
async function getV3PoolData(network, poolAddress) {
  try {
    if (!isValidAddress(poolAddress)) {
      throw new Error('Invalid pool address');
    }

    const rpcUrl = getRpcUrl(network);

    // Make two calls: slot0() and liquidity()
    const [slot0Result, liquidityResult] = await Promise.all([
      sendRpcRequest(rpcUrl, 'eth_call', [
        {
          to: poolAddress,
          data: SELECTORS.SLOT0
        },
        'latest'
      ]),
      sendRpcRequest(rpcUrl, 'eth_call', [
        {
          to: poolAddress,
          data: SELECTORS.LIQUIDITY
        },
        'latest'
      ])
    ]);

    if (!slot0Result || slot0Result === '0x' || !liquidityResult || liquidityResult === '0x') {
      return null;
    }

    // Decode slot0 result (sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked)
    const sqrtPriceX96Hex = slot0Result.slice(2, 66);
    const tickHex = slot0Result.slice(66, 130);
    const observationIndexHex = slot0Result.slice(130, 194);
    const observationCardinalityHex = slot0Result.slice(194, 258);
    const observationCardinalityNextHex = slot0Result.slice(258, 322);
    const feeProtocolHex = slot0Result.slice(322, 386);
    const unlockedHex = slot0Result.slice(386, 450);

    // Decode liquidity result
    const liquidity = decodeHexToDecimal(liquidityResult);

    return {
      sqrtPriceX96: decodeHexToDecimal('0x' + sqrtPriceX96Hex),
      tick: decodeHexToDecimal('0x' + tickHex),
      observationIndex: decodeHexToDecimal('0x' + observationIndexHex),
      observationCardinality: decodeHexToDecimal('0x' + observationCardinalityHex),
      observationCardinalityNext: decodeHexToDecimal('0x' + observationCardinalityNextHex),
      feeProtocol: decodeHexToDecimal('0x' + feeProtocolHex),
      unlocked: decodeHexToDecimal('0x' + unlockedHex) === '1',
      liquidity,
      version: 'V3'
    };
  } catch (error) {
    console.error('Error getting V3 pool data:', error.message);
    return null;
  }
}

/**
 * Get comprehensive pool information for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} [feeLevel] - Fee level for V3 (optional, will check all if not provided)
 * @returns {Promise<Object|null>} Pool information or error object
 */
async function getPoolInfo(network, tokenA, tokenB, feeLevel = undefined) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network, fee: feeLevel });
    console.warn('Pool parameter validation:', validation);
    if (!validation.isValid) {
      return createError(
        ERROR_CODES.INVALID_PARAMETERS,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS),
        { validationErrors: validation.errors }
      );
    }

    const pools = [];
    const errors = [];

    // Check V2 pool
    try {
      const v2PairAddress = await getV2PairAddress(network, tokenA, tokenB);
      if (v2PairAddress) {
        const v2Reserves = await getV2PoolReserves(network, v2PairAddress);
        if (v2Reserves) {
          // Validate reserve data
          if (!v2Reserves.reserve0 || !v2Reserves.reserve1 ||
            BigInt(v2Reserves.reserve0) <= 0n || BigInt(v2Reserves.reserve1) <= 0n) {
            errors.push({
              version: 'V2',
              poolAddress: v2PairAddress,
              error: 'Invalid or zero reserves'
            });
          } else {
            // Sort tokens to match reserves
            const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
              ? [tokenA, tokenB]
              : [tokenB, tokenA];

            pools.push({
              poolAddress: v2PairAddress,
              token0,
              token1,
              reserve0: v2Reserves.reserve0,
              reserve1: v2Reserves.reserve1,
              blockTimestampLast: v2Reserves.blockTimestampLast,
              version: 'V2',
              fee: 300, // V2 has fixed 0.3% fee
              feeTierName: 'FIXED',
              totalLiquidity: (BigInt(v2Reserves.reserve0) + BigInt(v2Reserves.reserve1)).toString()
            });
          }
        } else {
          errors.push({
            version: 'V2',
            poolAddress: v2PairAddress,
            error: 'Failed to fetch pool reserves'
          });
        }
      }
    } catch (v2Error) {
      console.error('Error checking V2 pool:', v2Error.message);
      errors.push({
        version: 'V2',
        error: v2Error.message
      });
    }

    // Check V3 pools
    const feeTiers = feeLevel ? [feeLevel] : [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];

    for (const fee of feeTiers) {
      try {
        const v3PoolAddress = await getV3PoolAddress(network, tokenA, tokenB, fee);
        if (v3PoolAddress) {
          const v3Data = await getV3PoolData(network, v3PoolAddress);
          if (v3Data) {
            // Validate V3 data
            if (!v3Data.sqrtPriceX96 || !v3Data.liquidity ||
              BigInt(v3Data.sqrtPriceX96) <= 0n || BigInt(v3Data.liquidity) <= 0n) {
              errors.push({
                version: 'V3',
                poolAddress: v3PoolAddress,
                fee,
                error: 'Invalid pool data (zero price or liquidity)'
              });
              continue;
            }

            // Sort tokens to match pool
            const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
              ? [tokenA, tokenB]
              : [tokenB, tokenA];

            pools.push({
              poolAddress: v3PoolAddress,
              token0,
              token1,
              sqrtPriceX96: v3Data.sqrtPriceX96,
              tick: v3Data.tick,
              liquidity: v3Data.liquidity,
              observationCardinality: v3Data.observationCardinality,
              feeProtocol: v3Data.feeProtocol,
              unlocked: v3Data.unlocked,
              version: 'V3',
              fee,
              feeTierName: getFeeTierName(fee),
              isActive: v3Data.unlocked && BigInt(v3Data.liquidity) > 0n
            });
          } else {
            errors.push({
              version: 'V3',
              poolAddress: v3PoolAddress,
              fee,
              error: 'Failed to fetch pool data'
            });
          }
        }
      } catch (v3Error) {
        console.error(`Error checking V3 pool (fee: ${fee}):`, v3Error.message);
        errors.push({
          version: 'V3',
          fee,
          error: v3Error.message
        });
      }
    }

    if (pools.length === 0) {
      return createError(
        ERROR_CODES.POOL_NOT_FOUND,
        getUserFriendlyErrorMessage(ERROR_CODES.POOL_NOT_FOUND),
        {
          tokenA,
          tokenB,
          network,
          checkedVersions: ['V2', 'V3'],
          checkedFeeTiers: feeTiers,
          errors
        }
      );
    }

    // Return the most liquid pool (V3) or the V2 pool if no V3 pools exist
    const v3Pools = pools.filter(p => p.version === 'V3' && p.isActive);
    let bestPool;

    if (v3Pools.length > 0) {
      // Return V3 pool with highest liquidity
      bestPool = v3Pools.reduce((max, pool) =>
        BigInt(pool.liquidity) > BigInt(max.liquidity) ? pool : max
      );
    } else {
      bestPool = pools[0]; // Return V2 pool or inactive V3 pool
    }

    // Add metadata about the selection
    bestPool.selectionReason = v3Pools.length > 0 ? 'Highest V3 liquidity' : 'V2 pool or only available pool';
    bestPool.alternativePools = pools.filter(p => p.poolAddress !== bestPool.poolAddress);
    bestPool.totalPoolsFound = pools.length;
    bestPool.errors = errors.length > 0 ? errors : undefined;

    return {
      success: true,
      ...bestPool,
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error getting pool info:', error.message);
    return createError(
      ERROR_CODES.NETWORK_ERROR,
      getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR),
      { originalError: error.message }
    );
  }
}

/**
 * Check if a pool exists for the given token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} [version] - Pool version ('V2' or 'V3', optional)
 * @param {number} [fee] - Fee tier for V3 pools (optional)
 * @returns {Promise<boolean>} True if pool exists
 */
async function poolExists(network, tokenA, tokenB, version = null, fee = null) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network });
    if (!validation.isValid) {
      return false;
    }

    if (!version || version === 'V2') {
      const v2PairAddress = await getV2PairAddress(network, tokenA, tokenB);
      if (v2PairAddress) {
        return true;
      }
    }

    if (!version || version === 'V3') {
      const feeTiers = fee ? [fee] : [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];

      for (const feeLevel of feeTiers) {
        const v3PoolAddress = await getV3PoolAddress(network, tokenA, tokenB, feeLevel);
        if (v3PoolAddress) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking pool existence:', error.message);
    return false;
  }
}

/**
 * Get all available pools for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {Promise<Array>} Array of pool information objects
 */
async function getAllPools(network, tokenA, tokenB) {
  try {
    // Validate parameters
    const validation = validatePoolParams({ tokenA, tokenB, network });
    console.warn('Get all pools parameter validation:', validation);
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Check cache first for frequently requested pairs
    const cacheKey = [network, tokenA.toLowerCase(), tokenB.toLowerCase()];
    const cachedPools = performanceCache.get('pools', cacheKey);
    if (cachedPools !== null) {
      return cachedPools;
    }

    const pools = [];
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    // Prepare batch RPC requests for optimal performance
    const batchRequests = [];

    // Add V2 pool address request
    const config = getNetworkConfig(network);
    if (config) {
      const v2Data = encodeFunctionCall(SELECTORS.GET_PAIR, [token0, token1]);
      batchRequests.push({
        method: 'eth_call',
        params: [{ to: config.v2Factory, data: v2Data }, 'latest'],
        type: 'v2_pair'
      });

      // Add V3 pool address requests for all fee tiers
      for (const [tierName, fee] of Object.entries(FEE_TIERS)) {
        const v3Data = encodeFunctionCall(SELECTORS.GET_POOL, [token0, token1, fee]);
        batchRequests.push({
          method: 'eth_call',
          params: [{ to: config.v3Factory, data: v3Data }, 'latest'],
          type: 'v3_pool',
          fee,
          tierName
        });
      }

      // Execute batch requests for pool addresses
      const addressResults = await sendMultipleRpcRequests(network, batchRequests, {
        useCache: true,
        useBatch: true
      });

      // Process V2 pool
      const v2Result = addressResults[0];
      if (v2Result && v2Result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const v2PairAddress = '0x' + v2Result.slice(-40);

        // Get V2 reserves
        const v2Reserves = await getV2PoolReserves(network, v2PairAddress);
        if (v2Reserves) {
          pools.push({
            poolAddress: v2PairAddress,
            token0,
            token1,
            reserve0: v2Reserves.reserve0,
            reserve1: v2Reserves.reserve1,
            blockTimestampLast: v2Reserves.blockTimestampLast,
            version: 'V2',
            fee: 300,
            feeTierName: 'FIXED'
          });
        }
      }

      // Process V3 pools
      const v3PoolRequests = [];
      const v3PoolInfo = [];

      for (let i = 1; i < addressResults.length; i++) {
        const result = addressResults[i];
        const request = batchRequests[i];

        if (result && result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          const v3PoolAddress = '0x' + result.slice(-40);

          // Prepare batch request for pool data
          v3PoolRequests.push({
            method: 'eth_call',
            params: [{ to: v3PoolAddress, data: encodeFunctionCall(SELECTORS.SLOT0) }, 'latest']
          });

          v3PoolInfo.push({
            poolAddress: v3PoolAddress,
            fee: request.fee,
            tierName: request.tierName
          });
        }
      }

      // Get V3 pool data in batch if any pools exist
      if (v3PoolRequests.length > 0) {
        const v3DataResults = await sendMultipleRpcRequests(network, v3PoolRequests, {
          useCache: true,
          useBatch: true
        });

        for (let i = 0; i < v3DataResults.length; i++) {
          const result = v3DataResults[i];
          const poolInfo = v3PoolInfo[i];

          if (result && result !== '0x') {
            try {
              // Decode slot0 data
              const sqrtPriceX96 = decodeHexToDecimal(result.slice(2, 66));
              const tick = parseInt(result.slice(66, 130), 16);

              // Get liquidity separately (could be optimized further with multicall)
              const liquidityResult = await sendCachedRpcRequest(network, 'eth_call', [
                { to: poolInfo.poolAddress, data: encodeFunctionCall(SELECTORS.LIQUIDITY) },
                'latest'
              ], { useCache: true });

              const liquidity = liquidityResult ? decodeHexToDecimal(liquidityResult) : '0';

              pools.push({
                poolAddress: poolInfo.poolAddress,
                token0,
                token1,
                sqrtPriceX96,
                tick,
                liquidity,
                version: 'V3',
                fee: poolInfo.fee,
                feeTierName: poolInfo.tierName
              });
            } catch (decodeError) {
              console.warn(`Failed to decode V3 pool data for ${poolInfo.poolAddress}:`, decodeError.message);
            }
          }
        }
      }
    }

    // Cache the results for future requests
    performanceCache.set('pools', cacheKey, pools);

    return pools;
  } catch (error) {
    console.error('Error getting all pools:', error.message);
    return [];
  }
}

// ============================================================================
// TOKEN PRICE AND QUOTE FUNCTIONALITY
// ============================================================================

/**
 * Calculate token price from V2 pool reserves
 * @param {string} reserve0 - Reserve of token0 (in wei)
 * @param {string} reserve1 - Reserve of token1 (in wei)
 * @param {number} decimals0 - Decimals of token0 (default 18)
 * @param {number} decimals1 - Decimals of token1 (default 18)
 * @returns {Object} Price information with token0/token1 and token1/token0 rates
 */
function calculateV2Price(reserve0, reserve1, decimals0 = 18, decimals1 = 18) {
  try {
    if (!reserve0 || !reserve1) {
    throw new Error("Both reserve0 and reserve1 are required");
  }

  const r0 = new Decimal(reserve0.toString());
  const r1 = new Decimal(reserve1.toString());

  if (r0.isZero() || r1.isZero()) {
    throw new Error("Reserves must be greater than zero");
  }

  const diff = decimals0 - decimals1;

  // price = reserve1 / reserve0 * 10^(dec0 - dec1)
  let price1Per0 = r1.div(r0);
  if (diff > 0) price1Per0 = price1Per0.mul(new Decimal(10).pow(diff));
  else if (diff < 0) price1Per0 = price1Per0.div(new Decimal(10).pow(-diff));

  const price0Per1 = new Decimal(1).div(price1Per0);

    return {
      price0in1: price0Per1.toFixed(5),
      price1in0: price1Per0.toFixed(5),
      reserve0: reserve0,
      reserve1: reserve1,
      decimals0,
      decimals1
    };
  } catch (error) {
    console.error('Error calculating V2 price:', error.message);
    throw error;
  }
}

/**
 * Calculate token price from V3 pool sqrtPriceX96
 * @param {string} sqrtPriceX96 - Square root price in X96 format
 * @param {number} decimals0 - Decimals of token0 (default 18)
 * @param {number} decimals1 - Decimals of token1 (default 18)
 * @returns {Object} Price information with token0/token1 and token1/token0 rates
 */
/**
 * Calculate token price from V3 pool sqrtPriceX96
 * @param {string} sqrtPriceX96 - Square root price in X96 format (as string, to support BigInt)
 * @param {number} decimals0 - Decimals of token0 (default 18)
 * @param {number} decimals1 - Decimals of token1 (default 18)
 * @returns {Object} Price information with token0/token1 and token1/token0 rates
 */
function calculateV3Price(sqrtPriceX96, decimals0 = 18, decimals1 = 18) {
  try {

    if (sqrtPriceX96 === undefined || sqrtPriceX96 === null) {
      throw new Error('sqrtPriceX96 is required');
    }
    const dec0 = Number(decimals0);
    const dec1 = Number(decimals1);
    if (!Number.isInteger(dec0) || !Number.isInteger(dec1)) {
      throw new Error('decimals0/decimals1 must be integers');
    }

    // 统一把 sqrtPriceX96 转为十进制字符串，避免 JS Number 精度问题
    let sqrtStr;
    if (typeof sqrtPriceX96 === 'bigint') {
      sqrtStr = sqrtPriceX96.toString();
    } else if (typeof sqrtPriceX96 === 'string') {
      sqrtStr = sqrtPriceX96.startsWith('0x')
        ? BigInt(sqrtPriceX96).toString()
        : sqrtPriceX96;
    } else if (typeof sqrtPriceX96 === 'number') {
      // 不推荐 number；这里尽量安全地转为整数 BigInt 再转字符串
      if (!Number.isFinite(sqrtPriceX96)) throw new Error('Invalid sqrtPriceX96 number');
      sqrtStr = BigInt(Math.trunc(sqrtPriceX96)).toString();
    } else {
      throw new Error('sqrtPriceX96 must be string | bigint | number');
    }

    // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
    const sqrt = new Decimal(sqrtStr);
    const q96 = new Decimal(2).pow(96);
    const base = sqrt.div(q96);     // = sqrt(priceRaw)
    let price = base.mul(base);     // 未做小数位调整的 priceRaw

    const diff = dec0 - dec1;
    let adjustedBy = 'none';
    if (diff > 0) {
      price = price.mul(new Decimal(10).pow(diff));
      adjustedBy = `* 10^${diff}`;
    } else if (diff < 0) {
      price = price.div(new Decimal(10).pow(-diff));
      adjustedBy = `/ 10^${-diff}`;
    }

    const price1Per0 = price;                          // token1 per token0
    const price0Per1 = new Decimal(1).div(price1Per0); // token0 per token1

    return {
      token1PerToken0: price1Per0.toFixed(),
      token0PerToken1: price0Per1.toFixed(),
      sqrtPriceX96: sqrtPriceX96,
      decimals0,
      decimals1
    };
  } catch (error) {
    console.error('Error calculating V3 price:', error.message);
    throw error;
  }
}

/**
 * Get current token price from the best available pool
 * @param {string} network - Network name
 * @param {string} tokenAddress - Token address to get price for
 * @param {string} baseToken - Base token address (e.g., WETH, USDC)
 * @returns {Promise<Object|null>} Price information or null if no pool found
 */
async function getTokenPrice(network, tokenAddress, baseToken) {
  console.warn(`Fetching price for ${tokenAddress} in terms of ${baseToken} on ${network}`);
  try {
    // Validate inputs
    if (!isValidAddress(tokenAddress) || !isValidAddress(baseToken)) {
      throw new Error('Invalid token addresses');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Get pool information
    const poolInfo = await getPoolInfo(network, tokenAddress, baseToken);
    if (!poolInfo) {
      console.warn('No pool information found');
      return null; // No pool found
    }
    console.warn('Pool info:', poolInfo);

    // Retrieve actual token decimals using getContractMeta
    let token0Decimals = 18; // Default fallback
    let token1Decimals = 18; // Default fallback

    try {
      // Import getContractMeta from the main module
      const { getContractMeta } = require('./index');

      // Get decimals for both tokens in the pool
      const [token0Meta, token1Meta] = await Promise.all([
        getContractMeta(network, poolInfo.token0),
        getContractMeta(network, poolInfo.token1)
      ]);
      console.warn('Token0 meta:', token0Meta);
      console.warn('Token1 meta:', token1Meta);

      if (token0Meta && typeof token0Meta.decimals === 'number') {
        token0Decimals = token0Meta.decimals;
      } else {
        console.warn(`Failed to retrieve decimals for token0 ${poolInfo.token0}, using default 18`);
      }

      if (token1Meta && typeof token1Meta.decimals === 'number') {
        token1Decimals = token1Meta.decimals;
      } else {
        console.warn(`Failed to retrieve decimals for token1 ${poolInfo.token1}, using default 18`);
      }

      console.warn(`Token decimals - token0: ${token0Decimals}, token1: ${token1Decimals}`);
    } catch (decimalError) {
      console.error('Error retrieving token decimals:', decimalError.message);
      console.warn('Using default decimals (18) for both tokens');
      // Continue with default decimals rather than failing completely
    }

    let priceData;

    if (poolInfo.version === 'V2') {
      // Calculate price from V2 reserves with correct decimals
      priceData = calculateV2Price(poolInfo.reserve0, poolInfo.reserve1, token0Decimals, token1Decimals);
    } else if (poolInfo.version === 'V3') {
      // Calculate price from V3 sqrtPriceX96 with correct decimals
      console.warn('Calculating V3 price with sqrtPriceX96:', poolInfo.sqrtPriceX96, token0Decimals, token1Decimals);
      priceData = calculateV3Price(poolInfo.sqrtPriceX96, token0Decimals, token1Decimals);
    } else {
      throw new Error('Unknown pool version');
    }
    console.warn('Price data:', priceData);
    // Determine which token is which in the pool
    const isToken0 = poolInfo.token0.toLowerCase() === tokenAddress.toLowerCase();
    const price = isToken0 ? priceData.price0in1 : priceData.price1in0;
    const inversePrice = isToken0 ? priceData.price1in0 : priceData.price0in1;

    // Ensure both prices are valid
    if (Number(price) <= 0 || Number(inversePrice) <= 0) {
      console.error('Invalid price calculation result');
      return null;
    }

    return {
      tokenAddress,
      baseToken,
      price,
      inversePrice,
      poolAddress: poolInfo.poolAddress,
      version: poolInfo.version,
      fee: poolInfo.fee,
      feeTierName: poolInfo.feeTierName || 'FIXED',
      liquidity: poolInfo.liquidity || 'N/A',
      decimals: {
        token0: token0Decimals,
        token1: token1Decimals,
        targetToken: isToken0 ? token0Decimals : token1Decimals,
        baseToken: isToken0 ? token1Decimals : token0Decimals
      },
      lastUpdated: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error getting token price:', error.message);
    return null;
  }
}

/**
 * Generate swap quote with slippage calculation
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {number} slippage - Slippage percentage (e.g., 0.5 for 0.5%)
 * @returns {Promise<Object|null>} Swap quote or error object
 */
async function getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage = 0.5, options = {}) {
  try {
    // Comprehensive parameter validation (excluding slippage which is handled separately)
    const validation = validateSwapParams({
      tokenIn,
      tokenOut,
      amountIn,
      network
    });

    if (!validation.isValid) {
      return createError(
        ERROR_CODES.INVALID_PARAMETERS,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_PARAMETERS),
        { validationErrors: validation.errors }
      );
    }

    // Additional slippage validation (separate from parameter validation)
    if (slippage !== undefined && !isValidSlippage(slippage)) {
      return createError(
        ERROR_CODES.INVALID_SLIPPAGE,
        getUserFriendlyErrorMessage(ERROR_CODES.INVALID_SLIPPAGE),
        { slippage, validRange: '0-50%' }
      );
    }

    // Check route cache for frequently used pairs
    const { useCache = true } = options;
    if (useCache) {
      const routeCacheKey = [network, tokenIn.toLowerCase(), tokenOut.toLowerCase(), amountIn, slippage.toString()];
      const cachedQuote = performanceCache.get('routes', routeCacheKey);
      if (cachedQuote !== null) {
        console.debug(`Route cache hit for ${tokenIn} -> ${tokenOut}`);
        return cachedQuote;
      }
    }

    // Get all available pools for the token pair
    const pools = await getAllPools(network, tokenIn, tokenOut);
    if (pools.length === 0) {
      return createError(
        ERROR_CODES.POOL_NOT_FOUND,
        getUserFriendlyErrorMessage(ERROR_CODES.POOL_NOT_FOUND),
        { tokenIn, tokenOut, network }
      );
    }

    const quotes = [];
    const poolErrors = [];

    // Calculate quotes for each available pool
    for (const pool of pools) {
      try {
        let amountOut;
        let priceImpact = 0;
        let liquidityAnalysis = null;

        // Determine token order in pool
        const isTokenInToken0 = pool.token0.toLowerCase() === tokenIn.toLowerCase();

        if (pool.version === 'V2') {
          // Calculate V2 swap output
          const reserveIn = isTokenInToken0 ? pool.reserve0 : pool.reserve1;
          const reserveOut = isTokenInToken0 ? pool.reserve1 : pool.reserve0;

          // Validate liquidity before calculation
          liquidityAnalysis = validateLiquidity(reserveIn, reserveOut, amountIn);
          if (!liquidityAnalysis.sufficient) {
            poolErrors.push({
              pool: pool.poolAddress,
              version: pool.version,
              error: liquidityAnalysis.warning || 'Insufficient liquidity'
            });
            continue;
          }

          amountOut = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, pool.fee);
          priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);
        } else if (pool.version === 'V3') {
          console.warn("pool info ",pool)
          // For V3, we'll use a simplified calculation based on current price
          // In a full implementation, this would use the tick math and liquidity calculations
          if (!pool.sqrtPriceX96 || BigInt(pool.sqrtPriceX96) <= 0n) {
            poolErrors.push({
              pool: pool.poolAddress,
              version: pool.version,
              error: 'Invalid pool price data'
            });
            continue;
          }

          const priceData = calculateV3Price(pool.sqrtPriceX96);
          console.warn("price data ",priceData);
          const price = isTokenInToken0 ? priceData.price0in1 : priceData.price1in0;

          // Simple price-based calculation (not accounting for concentrated liquidity)
          amountOut = number(amountIn) * number(price);
          amountOut = amountOut.toFixed(0).toString();

          // Apply V3 fee
          const feeAmount = (BigInt(amountOut) * BigInt(pool.fee)) / BigInt(1000000);
          amountOut = (BigInt(amountOut) - feeAmount).toString();

          // Simplified price impact calculation for V3
          if (pool.liquidity && BigInt(pool.liquidity) > 0n) {
            priceImpact = Number(BigInt(amountIn)) / Number(BigInt(pool.liquidity)) * 100;
            priceImpact = Math.min(priceImpact, 100); // Cap at 100%
          } else {
            priceImpact = 0; // Cannot calculate without liquidity data
          }
        }

        // Validate output amount
        if (!amountOut || BigInt(amountOut) <= 0n) {
          poolErrors.push({
            pool: pool.poolAddress,
            version: pool.version,
            error: 'Invalid output amount calculated'
          });
          continue;
        }

        // Apply slippage protection
        const amountOutMin = applySlippage(amountOut, slippage, true);

        // Analyze price impact
        const priceImpactAnalysis = analyzePriceImpact(priceImpact);

        quotes.push({
          poolAddress: pool.poolAddress,
          version: pool.version,
          fee: pool.fee,
          feeTierName: pool.feeTierName,
          amountOut,
          amountOutMin,
          priceImpact,
          priceImpactAnalysis,
          liquidity: pool.liquidity || pool.reserve0, // Use reserve0 as liquidity proxy for V2
          liquidityAnalysis,
          effectivePrice: (BigInt(amountOut) * BigInt(10 ** 18)) / BigInt(amountIn)
        });
      } catch (poolError) {
        console.error(`Error calculating quote for ${pool.version} pool:`, poolError.message);
        poolErrors.push({
          pool: pool.poolAddress,
          version: pool.version,
          error: poolError.message
        });
        continue; // Skip this pool and try others
      }
    }

    if (quotes.length === 0) {
      return createError(
        ERROR_CODES.INSUFFICIENT_LIQUIDITY,
        'No pools have sufficient liquidity for this trade',
        {
          poolErrors,
          suggestedAction: 'Try reducing the trade amount or check back later'
        }
      );
    }

    // Select the best quote (highest output amount)
    const bestQuote = quotes.reduce((best, current) =>
      BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best
    );

    // Check for critical price impact that should block the trade
    if (bestQuote.priceImpactAnalysis.shouldBlock) {
      return createError(
        ERROR_CODES.HIGH_PRICE_IMPACT,
        getUserFriendlyErrorMessage(ERROR_CODES.HIGH_PRICE_IMPACT, { priceImpact: bestQuote.priceImpact }),
        {
          priceImpact: bestQuote.priceImpact,
          recommendation: 'Reduce trade size significantly or split into multiple smaller trades'
        }
      );
    }

    // Calculate effective exchange rate
    const effectiveRate = (BigInt(bestQuote.amountOut) * BigInt(10 ** 18)) / BigInt(amountIn);

    return {
      success: true,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: bestQuote.amountOut,
      amountOutMin: bestQuote.amountOutMin,
      slippage,
      priceImpact: bestQuote.priceImpact,
      priceImpactAnalysis: bestQuote.priceImpactAnalysis,
      route: [tokenIn, tokenOut],
      version: bestQuote.version,
      poolAddress: bestQuote.poolAddress,
      fee: bestQuote.fee,
      feeTierName: bestQuote.feeTierName,
      effectiveRate: effectiveRate.toString(),
      liquidity: bestQuote.liquidity,
      alternativeQuotes: quotes.filter(q => q.poolAddress !== bestQuote.poolAddress),
      warnings: bestQuote.priceImpactAnalysis.warning ? [bestQuote.priceImpactAnalysis.warning] : [],
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error generating swap quote:', error.message);
    return createError(
      ERROR_CODES.NETWORK_ERROR,
      getUserFriendlyErrorMessage(ERROR_CODES.NETWORK_ERROR),
      { originalError: error.message }
    );
  }
}

/**
 * Get optimal swap route between V2 and V3
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @returns {Promise<Object|null>} Optimal route information or null if no route found
 */
async function getOptimalRoute(network, tokenIn, tokenOut, amountIn) {
  try {
    // Get swap quote which already finds the optimal route
    const quote = await getSwapQuote(network, tokenIn, tokenOut, amountIn);
    if (!quote) {
      return null;
    }

    return {
      tokenIn,
      tokenOut,
      amountIn,
      optimalVersion: quote.version,
      optimalPool: quote.poolAddress,
      optimalFee: quote.fee,
      expectedOutput: quote.amountOut,
      priceImpact: quote.priceImpact,
      route: quote.route,
      alternativeRoutes: quote.alternativeQuotes.map(alt => ({
        version: alt.version,
        poolAddress: alt.poolAddress,
        fee: alt.fee,
        expectedOutput: alt.amountOut,
        priceImpact: alt.priceImpact
      }))
    };
  } catch (error) {
    console.error('Error getting optimal route:', error.message);
    return null;
  }
}

/**
 * Compare prices across multiple pools for a token pair
 * @param {string} network - Network name
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} amountIn - Amount to compare (in wei)
 * @returns {Promise<Array>} Array of price comparisons
 */
async function comparePrices(network, tokenA, tokenB, amountIn) {
  try {
    // Validate parameters
    const validation = validateSwapParams({
      tokenIn: tokenA,
      tokenOut: tokenB,
      amountIn,
      network
    });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Check cache first for price comparisons
    const cacheKey = [network, tokenA.toLowerCase(), tokenB.toLowerCase(), amountIn];
    const cachedComparisons = performanceCache.get('prices', cacheKey);
    if (cachedComparisons !== null) {
      return cachedComparisons;
    }

    // Get all available pools (this is now optimized with batch RPC)
    const pools = await getAllPools(network, tokenA, tokenB);
    if (pools.length === 0) {
      return [];
    }

    const comparisons = [];

    for (const pool of pools) {
      try {
        // Get quote for this specific pool
        const isTokenAToken0 = pool.token0.toLowerCase() === tokenA.toLowerCase();
        let amountOut;
        let priceImpact = 0;

        if (pool.version === 'V2') {
          const reserveIn = isTokenAToken0 ? pool.reserve0 : pool.reserve1;
          const reserveOut = isTokenAToken0 ? pool.reserve1 : pool.reserve0;

          amountOut = calculateV2SwapOutput(reserveIn, reserveOut, amountIn, pool.fee);
          priceImpact = calculatePriceImpact(reserveIn, reserveOut, amountIn, amountOut);
        } else if (pool.version === 'V3') {
          const priceData = calculateV3Price(pool.sqrtPriceX96);
          const price = isTokenAToken0 ? priceData.price0in1 : priceData.price1in0;

          amountOut = (BigInt(amountIn) * BigInt(price)) / BigInt(10 ** 18);
          const feeAmount = (BigInt(amountOut) * BigInt(pool.fee)) / BigInt(1000000);
          amountOut = (BigInt(amountOut) - feeAmount).toString();

          priceImpact = Number(BigInt(amountIn)) / Number(BigInt(pool.liquidity)) * 100;
          priceImpact = Math.min(priceImpact, 100);
        }

        // Calculate effective price
        const effectivePrice = (BigInt(amountOut) * BigInt(10 ** 18)) / BigInt(amountIn);

        comparisons.push({
          poolAddress: pool.poolAddress,
          version: pool.version,
          fee: pool.fee,
          feeTierName: pool.feeTierName,
          amountOut,
          effectivePrice: effectivePrice.toString(),
          priceImpact,
          liquidity: pool.liquidity || pool.reserve0
        });
      } catch (poolError) {
        console.error(`Error comparing price for ${pool.version} pool:`, poolError.message);
        continue;
      }
    }

    // Sort by best output amount
    comparisons.sort((a, b) => {
      const aOut = BigInt(a.amountOut);
      const bOut = BigInt(b.amountOut);
      return bOut > aOut ? 1 : bOut < aOut ? -1 : 0;
    });

    // Cache the results for future requests
    performanceCache.set('prices', cacheKey, comparisons);

    return comparisons;
  } catch (error) {
    console.error('Error comparing prices:', error.message);
    return [];
  }
}

// ============================================================================
// SWAP TRANSACTION FUNCTIONALITY
// ============================================================================

/**
 * Generate Uniswap V2 swap transaction data
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} recipient - Recipient address
 * @param {number} deadline - Transaction deadline (Unix timestamp)
 * @returns {string} Encoded transaction data
 */
function encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline) {
  try {
    // Validate inputs
    if (!isValidAddress(tokenIn) || !isValidAddress(tokenOut) || !isValidAddress(recipient)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amountIn) || !isValidAmount(amountOutMin)) {
      throw new Error('Invalid amount');
    }

    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }

    // Create path array [tokenIn, tokenOut]
    const path = [tokenIn, tokenOut];

    // Encode swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    let data = SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS.startsWith('0x') ? SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS : '0x' + SELECTORS.SWAP_EXACT_TOKENS_FOR_TOKENS;

    // Add amountIn (uint256)
    data += encodeUint256(amountIn);

    // Add amountOutMin (uint256)
    data += encodeUint256(amountOutMin);

    // Add path offset (uint256) - points to where path data starts
    data += encodeUint256(160); // 5 * 32 bytes = 160 bytes offset

    // Add recipient (address)
    data += encodeAddress(recipient);

    // Add deadline (uint256)
    data += encodeUint256(deadline);

    // Add path array length
    data += encodeUint256(path.length);

    // Add path addresses
    for (const address of path) {
      data += encodeAddress(address);
    }

    return data;
  } catch (error) {
    console.error('Error encoding V2 swap data:', error.message);
    throw error;
  }
}

/**
 * Generate Uniswap V3 swap transaction data
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {number} fee - Fee tier (500, 3000, 10000)
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} recipient - Recipient address
 * @param {number} deadline - Transaction deadline (Unix timestamp)
 * @param {string} sqrtPriceLimitX96 - Price limit (optional, use 0 for no limit)
 * @returns {string} Encoded transaction data
 */
function encodeV3SwapData(tokenIn, tokenOut, fee, amountIn, amountOutMin, recipient, deadline, sqrtPriceLimitX96 = '0') {
  try {
    // Validate inputs
    if (!isValidAddress(tokenIn) || !isValidAddress(tokenOut) || !isValidAddress(recipient)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amountIn) || !isValidAmount(amountOutMin)) {
      throw new Error('Invalid amount');
    }

    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }

    if (![FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH].includes(fee)) {
      throw new Error('Invalid fee tier');
    }

    // Encode exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    let data = SELECTORS.EXACT_INPUT_SINGLE.startsWith('0x') ? SELECTORS.EXACT_INPUT_SINGLE : '0x' + SELECTORS.EXACT_INPUT_SINGLE;

    // Add tokenIn (address)
    data += encodeAddress(tokenIn);

    // Add tokenOut (address)
    data += encodeAddress(tokenOut);

    // Add fee (uint24)
    data += encodeUint256(fee);

    // Add recipient (address)
    data += encodeAddress(recipient);

    // Add deadline (uint256)
    data += encodeUint256(deadline);

    // Add amountIn (uint256)
    data += encodeUint256(amountIn);

    // Add amountOutMinimum (uint256)
    data += encodeUint256(amountOutMin);

    // Add sqrtPriceLimitX96 (uint160)
    data += encodeUint256(sqrtPriceLimitX96);

    return data;
  } catch (error) {
    console.error('Error encoding V3 swap data:', error.message);
    throw error;
  }
}

/**
 * Get optimal swap route and version between V2 and V3
 * @param {string} network - Network name
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {number} slippage - Slippage percentage (e.g., 0.5 for 0.5%)
 * @returns {Promise<Object|null>} Optimal route information or null if no route found
 */
async function selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage = 0.5) {
  try {
    // Get swap quote which already finds the optimal route
    const quote = await getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage);
    if (!quote) {
      return null;
    }

    // Get network configuration
    const config = getNetworkConfig(network);
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Determine router address based on optimal version
    const routerAddress = quote.version === 'V3' ? config.v3Router : config.v2Router;

    return {
      version: quote.version,
      routerAddress,
      poolAddress: quote.poolAddress,
      fee: quote.fee,
      amountOut: quote.amountOut,
      amountOutMin: quote.amountOutMin,
      priceImpact: quote.priceImpact,
      gasEstimate: null // Will be calculated during transaction preparation
    };
  } catch (error) {
    console.error('Error selecting optimal route:', error.message);
    return null;
  }
}

function getNetwork(network) {
      switch (true) {
        case network === 'ETHEREUM':
        case network === 'BITCOIN':
        case network.startsWith('SOLANA'):
        case network.startsWith('TRON'):
        case network.startsWith('SUI'):
          return 'MAINNET';
        case network === 'ETHEREUM-SEPOLIA':
          return 'SEPOLIA';
        case network === 'ETHEREUM-HOLESKY':
          return 'HOLESKY';
        case network === 'POLYGON-MUMBAI':
          return 'MUMBAI';
        case network === 'BITCOIN-TESTNET':
          return 'TESTNET';
        default:
          return network;
      }
    }

/**
 * Execute a Uniswap swap transaction
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Sender address
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @param {number} [options.slippage=0.5] - Slippage percentage
 * @param {number} [options.deadline] - Custom deadline (default: 20 minutes from now)
 * @param {string} [options.version] - Force specific version ('V2' or 'V3')
 * @param {number} [options.fee] - Force specific fee tier for V3
 * @returns {Promise<Object|null>} Transaction result or null if error
 */
async function executeSwap(password, fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network, options = {}) {
  try {
    // Import required modules
    const eth = require('./eth');
    const commonUtil = require('./utils');

    console.warn("111");
    // Validate inputs
    const validation = validateSwapParams({ tokenIn, tokenOut, amountIn, network });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    if (!isValidAddress(fromAddress)) {
      throw new Error('Invalid sender address');
    }

    if (!isValidAmount(amountOutMin)) {
      throw new Error('Invalid minimum output amount');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    console.warn("3333");
    // Set default options
    const {
      slippage = 0.5,
      deadline = Math.floor(Date.now() / 1000) + 1200, // 20 minutes from now
      version = null,
      fee = null
    } = options;

    // Validate deadline
    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }
 console.warn("444");
    // Get optimal route if version not specified
    let routeInfo;
    if (version) {
      // Use specified version
      const config = getNetworkConfig(network);
      routeInfo = {
        version,
        routerAddress: version === 'V3' ? config.v3Router : config.v2Router,
        fee: fee || FEE_TIERS.MEDIUM // Default to medium fee for V3
      };
    } else {
      // Find optimal route
      routeInfo = await selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage);
      if (!routeInfo) {
        throw new Error('No available swap route found');
      }
    }
 console.warn("555");
    // Check and handle token approval
    const approvalResult = await handleTokenApproval(
      password,
      fromAddress,
      tokenIn,
      routeInfo.routerAddress,
      amountIn,
      network
    );

    if (!approvalResult.success) {
      throw new Error(`Token approval failed: ${approvalResult.error}`);
    }
 console.warn("666");
    // Generate transaction data based on version
    let callData;
    if (routeInfo.version === 'V2') {
      callData = encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, fromAddress, deadline);
    } else if (routeInfo.version === 'V3') {
      callData = encodeV3SwapData(tokenIn, tokenOut, routeInfo.fee, amountIn, amountOutMin, fromAddress, deadline);
    } else {
      throw new Error('Unknown Uniswap version');
    }
 console.warn("222");
    // Get transaction essentials (nonce, gas price)
    const txEssentials = await eth.get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }

    const { nonce, gas_price: gasPrice } = txEssentials;

    // Estimate gas for swap transaction
    const gas = await eth.estimate_gas(network, fromAddress, routeInfo.routerAddress, 0, callData.startsWith('0x') ? callData : '0x' + callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    // Calculate gas fee with multiplier
    const GAS_PRICE_MULTIPLIER = 1.2; // 20% buffer
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));
    const gasFee = finalGasPrice * BigInt(gas);

    // Get network configuration for chain ID
    // function getNetworkChainId(networkName) {
    //   const networkMap = {
    //     'ETHEREUM': 1,
    //     'ETHEREUM-SEPOLIA': 11155111,
    //     'ARBITRUM': 42161,
    //     'ARBITRUM-TESTNET': 421614,
    //     'OPTIMISM': 10,
    //     'OPTIMISM-TESTNET': 11155420,
    //     'BASE': 8453,
    //     'BASE-TESTNET': 84532,
    //     'BNBSMARTCHAIN': 56,
    //     'BNBSMARTCHAIN-TESTNET': 97
    //   };
    //   return networkMap[networkName.toUpperCase()] || 1;
    // }

    

    // Prepare payload for hardware wallet signing
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: routeInfo.routerAddress,
          value: '0',
          gas_price: finalGasPrice.toString(),
          gas: gas.toString(),
          data: callData,
          network: getNetwork(network),
        },
        key: {
          Password: password,
        },
      },
    };

    // Sign transaction using hardware wallet
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');

    // Get binary path
    const DEEPER_WALLET_BIN_PATH = process.env.DEEPER_WALLET_BIN_PATH || 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';

    const [err, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
    if (err) {
      throw new Error('Failed to sign swap transaction');
    }

    const [parseErr, signResult] = await to(commonUtil.jsonParse(stdout));
    if (parseErr || !signResult?.signature) {
      throw new Error(`Invalid sign_tx output: ${stdout}`);
    }

    // Send signed transaction
    const signedTransaction = `0x${signResult.signature.replace(/^"|"$/g, '')}`;
    const txHash = await eth.sendEthRawTransaction(network, signedTransaction);

    if (!txHash) {
      throw new Error('Failed to send swap transaction');
    }

    return {
      transactionHash: txHash,
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      expectedAmountOut: routeInfo.amountOut || amountOutMin,
      version: routeInfo.version,
      routerAddress: routeInfo.routerAddress,
      poolAddress: routeInfo.poolAddress,
      fee: routeInfo.fee,
      priceImpact: routeInfo.priceImpact,
      gasUsed: gas,
      gasPrice: finalGasPrice.toString(),
      gasFee: gasFee.toString(),
      nonce,
      deadline,
      approvalRequired: !approvalResult.alreadyApproved,
      approvalTxHash: approvalResult.transactionHash || null
    };
  } catch (error) {
    console.error('Error executing swap:', error.message);
    return null;
  }
}

/**
 * Prepare swap transaction data without executing it
 * @param {string} fromAddress - Sender address
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object|null>} Transaction preparation result or null if error
 */
async function prepareSwapTransaction(fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network, options = {}) {
  try {
    // Import required modules
    const eth = require('./eth');

    // Validate inputs
    const validation = validateSwapParams({ tokenIn, tokenOut, amountIn, network });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    if (!isValidAddress(fromAddress)) {
      throw new Error('Invalid sender address');
    }

    // Set default options
    const {
      slippage = 0.5,
      deadline = Math.floor(Date.now() / 1000) + 1200,
      version = null,
      fee = null
    } = options;

    // Get optimal route
    let routeInfo;
    if (version) {
      const config = getNetworkConfig(network);
      routeInfo = {
        version,
        routerAddress: version === 'V3' ? config.v3Router : config.v2Router,
        fee: fee || FEE_TIERS.MEDIUM
      };
    } else {
      routeInfo = await selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage);
      if (!routeInfo) {
        throw new Error('No available swap route found');
      }
    }

    // Check token approval status
    const approvalStatus = await checkTokenApproval(
      network,
      tokenIn,
      fromAddress,
      routeInfo.routerAddress,
      amountIn
    );

    // Generate transaction data
    let callData;
    if (routeInfo.version === 'V2') {
      callData = encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, fromAddress, deadline);
    } else if (routeInfo.version === 'V3') {
      callData = encodeV3SwapData(tokenIn, tokenOut, routeInfo.fee, amountIn, amountOutMin, fromAddress, deadline);
    } else {
      throw new Error('Unknown Uniswap version');
    }

    // Estimate gas
    const gas = await eth.estimate_gas(network, fromAddress, routeInfo.routerAddress, 0, callData.startsWith('0x') ? callData : '0x' + callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    // Get gas price
    const gasPrice = await eth.getEthGasPrice(network);
    if (!gasPrice) {
      throw new Error('Failed to get gas price');
    }

    const finalGasPrice = BigInt(Math.round(gasPrice * 1.2));
    const gasFee = finalGasPrice * BigInt(gas);

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      version: routeInfo.version,
      routerAddress: routeInfo.routerAddress,
      poolAddress: routeInfo.poolAddress,
      fee: routeInfo.fee,
      callData,
      gasEstimate: gas,
      gasPrice: finalGasPrice.toString(),
      gasFee: gasFee.toString(),
      deadline,
      approvalRequired: !approvalStatus.isApproved,
      currentAllowance: approvalStatus.currentAllowance,
      requiredAmount: amountIn,
      priceImpact: routeInfo.priceImpact
    };
  } catch (error) {
    console.error('Error preparing swap transaction:', error.message);
    return null;
  }
}

module.exports = {
  // Constants
  UNISWAP_V2_ROUTER,
  UNISWAP_V2_FACTORY,
  UNISWAP_V3_ROUTER,
  UNISWAP_V3_FACTORY,
  FEE_TIERS,
  SELECTORS,
  NETWORK_CONFIG,
  COMMON_TOKENS,
  ERROR_CODES,

  // Basic utility functions
  getNetworkConfig,
  getCommonTokens,
  isNetworkSupported,
  getFeeTierName,
  isValidAddress,
  isValidAmount,

  // Uniswap calculation utilities
  calculateV2SwapOutput,
  calculateV2SwapInput,
  calculatePriceImpact,
  applySlippage,

  // Hex encoding/decoding utilities
  encodeFunctionCall,
  encodeAddress,
  encodeUint256,
  decodeHexToDecimal,
  decodeAddress,

  // Token approval handling
  getTokenAllowance,
  checkTokenApproval,
  getApprovalCalldata,
  executeTokenApproval,
  handleTokenApproval,
  getUniswapSpenderAddress,

  // Input validation utilities
  validateSwapParams,
  validatePoolParams,
  isValidSlippage,
  isValidDeadline,
  validateAndSanitizeParams,

  // Error handling utilities
  createError,
  getUserFriendlyErrorMessage,
  analyzePriceImpact,
  validateLiquidity,
  withErrorHandling,

  // Pool query functionality
  getV2PairAddress,
  getV3PoolAddress,
  getV2PoolReserves,
  getV3PoolData,
  getPoolInfo,
  poolExists,
  getAllPools,

  // Token price and quote functionality
  calculateV2Price,
  calculateV3Price,
  getTokenPrice,
  getSwapQuote,
  getOptimalRoute,
  comparePrices,

  // Swap transaction functionality
  encodeV2SwapData,
  encodeV3SwapData,
  selectOptimalRoute,
  executeSwap,
  prepareSwapTransaction
};
