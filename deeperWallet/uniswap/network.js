/**
 * Network Request Optimization Module
 * Provides RPC call batching, connection pooling, and request deduplication
 */

const axios = require('axios');
const logger = require('../log');
const { gasPriceCache } = require('./cache');

// Network configuration
const NETWORK_CONFIG = {
  MAX_BATCH_SIZE: 10,
  BATCH_TIMEOUT: 100, // ms
  CONNECTION_TIMEOUT: 10000, // ms
  MAX_RETRIES: 3,
  RETRY_DELAY: 500, // ms
  POOL_SIZE: 5,
  REQUEST_TIMEOUT: 30000 // ms
};

// RPC endpoints for different networks
const RPC_ENDPOINTS = {
  'ETHEREUM': [
    'https://eth.blockrazor.xyz',
   
    'https://ethereum.publicnode.com'
  ],
  'ARBITRUM': [
    'https://arb1.arbitrum.io/rpc',
    
    'https://arbitrum.publicnode.com'
  ],
  'OPTIMISM': [
    'https://mainnet.optimism.io',
   
    'https://optimism.publicnode.com'
  ],
  'BASE': [
    'https://mainnet.base.org',
    
    'https://base.publicnode.com'
  ],
  'POLYGON': [
    'https://polygon-rpc.com',
    
    'https://polygon.publicnode.com'
  ]
};

// Connection pools for each network
const connectionPools = new Map();

// Pending batch requests
const batchQueues = new Map();

// Request deduplication cache
const pendingRequests = new Map();

// Network statistics
const networkStats = {
  totalRequests: 0,
  batchedRequests: 0,
  deduplicatedRequests: 0,
  failedRequests: 0,
  retryCount: 0,
  averageResponseTime: 0
};

/**
 * Connection pool for a specific network
 */
class ConnectionPool {
  constructor(network, endpoints, poolSize = NETWORK_CONFIG.POOL_SIZE) {
    this.network = network;
    this.endpoints = endpoints;
    this.poolSize = poolSize;
    this.connections = [];
    this.currentIndex = 0;
    this.failedEndpoints = new Set();
    this.lastFailureCheck = 0;
    
    this.initializePool();
  }

  /**
   * Initialize connection pool
   */
  initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.connections.push({
        id: i,
        endpoint: this.getNextEndpoint(),
        lastUsed: 0,
        requestCount: 0,
        errorCount: 0
      });
    }
    
    console.warn(`Initialized connection pool for ${this.network} with ${this.poolSize} connections`);
  }

  /**
   * Get next available endpoint (round-robin with failure handling)
   */
  getNextEndpoint() {
    const now = Date.now();
    
    // Reset failed endpoints every 5 minutes
    if (now - this.lastFailureCheck > 5 * 60 * 1000) {
      this.failedEndpoints.clear();
      this.lastFailureCheck = now;
    }

    const availableEndpoints = this.endpoints.filter(ep => !this.failedEndpoints.has(ep));
    
    if (availableEndpoints.length === 0) {
      // All endpoints failed, reset and use original list
      this.failedEndpoints.clear();
      return this.endpoints[0];
    }

    const endpoint = availableEndpoints[this.currentIndex % availableEndpoints.length];
    this.currentIndex++;
    
    return endpoint;
  }

  /**
   * Get connection from pool
   */
  getConnection() {
    // Find least recently used connection
    const connection = this.connections.reduce((lru, conn) => 
      conn.lastUsed < lru.lastUsed ? conn : lru
    );

    connection.lastUsed = Date.now();
    connection.requestCount++;
    
    return connection;
  }

  /**
   * Mark endpoint as failed
   */
  markEndpointFailed(endpoint) {
    this.failedEndpoints.add(endpoint);
    console.warn(`Marked endpoint as failed: ${endpoint}`);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      network: this.network,
      poolSize: this.poolSize,
      totalEndpoints: this.endpoints.length,
      failedEndpoints: this.failedEndpoints.size,
      connections: this.connections.map(conn => ({
        id: conn.id,
        endpoint: conn.endpoint,
        requestCount: conn.requestCount,
        errorCount: conn.errorCount,
        lastUsed: conn.lastUsed
      }))
    };
  }
}

/**
 * Get or create connection pool for network
 */
function getConnectionPool(network) {
  if (!connectionPools.has(network)) {
    const endpoints = RPC_ENDPOINTS[network];
    if (!endpoints) {
      throw new Error(`No RPC endpoints configured for network: ${network}`);
    }
    
    const pool = new ConnectionPool(network, endpoints);
    connectionPools.set(network, pool);
  }
  
  return connectionPools.get(network);
}

/**
 * Create request deduplication key
 */
function createRequestKey(network, method, params) {
  return `${network}:${method}:${JSON.stringify(params)}`;
}

/**
 * Make single RPC request with connection pooling
 */
async function makeRpcRequest(network, method, params, options = {}) {
  const startTime = Date.now();
  networkStats.totalRequests++;

  try {
    // Check for pending identical request (deduplication)
    const requestKey = createRequestKey(network, method, params);
    
    if (pendingRequests.has(requestKey)) {
      networkStats.deduplicatedRequests++;
      console.warn(`Request deduplicated: ${method}`);
      return await pendingRequests.get(requestKey);
    }

    // Create request promise
    const requestPromise = executeRpcRequest(network, method, params, options);
    pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Update response time statistics
      const responseTime = Date.now() - startTime;
      networkStats.averageResponseTime = 
        (networkStats.averageResponseTime + responseTime) / 2;
      
      return result;
    } finally {
      // Clean up pending request
      pendingRequests.delete(requestKey);
    }

  } catch (error) {
    networkStats.failedRequests++;
    logger.error(`RPC request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Execute RPC request with retry logic
 */
async function executeRpcRequest(network, method, params, options = {}) {
  const pool = getConnectionPool(network);
  let lastError;

  for (let attempt = 0; attempt < NETWORK_CONFIG.MAX_RETRIES; attempt++) {
    const connection = pool.getConnection();
    
    try {
      const response = await axios.post(connection.endpoint, {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      }, {
        timeout: options.timeout || NETWORK_CONFIG.REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'deeperWallet-uniswap/1.0'
        }
      });

      console.warn(`--- RPC request to ${method} ${JSON.stringify(params)}`);
      if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;

    } catch (error) {
      lastError = error;
      connection.errorCount++;
      
      // Mark endpoint as failed if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        pool.markEndpointFailed(connection.endpoint);
      }

      if (attempt < NETWORK_CONFIG.MAX_RETRIES - 1) {
        networkStats.retryCount++;
        const delay = NETWORK_CONFIG.RETRY_DELAY * Math.pow(2, attempt);
        console.warn(`RPC request failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Batch multiple RPC requests
 */
async function makeBatchRpcRequest(network, requests, options = {}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('Requests must be a non-empty array');
  }

  if (requests.length === 1) {
    // Single request, use regular method
    const req = requests[0];
    return [await makeRpcRequest(network, req.method, req.params, options)];
  }

  const startTime = Date.now();
  networkStats.totalRequests += requests.length;
  networkStats.batchedRequests += requests.length;

  try {
    const pool = getConnectionPool(network);
    const connection = pool.getConnection();

    // Prepare batch request payload
    const batchPayload = requests.map((req, index) => ({
      jsonrpc: '2.0',
      id: index,
      method: req.method,
      params: req.params
    }));

    const response = await axios.post(connection.endpoint, batchPayload, {
      timeout: options.timeout || NETWORK_CONFIG.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'deeperWallet-uniswap/1.0'
      }
    });

    console.warn(`--- Batch request to ${connection.endpoint} completed response ${JSON.stringify(response.data)}`);

    if (!Array.isArray(response.data)) {
      throw new Error('Invalid batch response format');
    }

    // Process batch response
    const results = new Array(requests.length);
    
    for (const item of response.data) {
      if (item.error) {
        results[item.id] = { error: item.error };
      } else {
        results[item.id] = item.result;
      }
    }

    // Update response time statistics
    const responseTime = Date.now() - startTime;
    networkStats.averageResponseTime = 
      (networkStats.averageResponseTime + responseTime) / 2;

    console.warn(`Batch request completed: ${requests.length} requests in ${responseTime}ms`);
    return results;

  } catch (error) {
    networkStats.failedRequests += requests.length;
    logger.error(`Batch RPC request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Queue request for batching
 */
function queueBatchRequest(network, method, params, options = {}) {
  return new Promise((resolve, reject) => {
    if (!batchQueues.has(network)) {
      batchQueues.set(network, {
        requests: [],
        callbacks: [],
        timeout: null
      });
    }

    const queue = batchQueues.get(network);
    
    queue.requests.push({ method, params });
    queue.callbacks.push({ resolve, reject });

    // Set timeout for batch processing if not already set
    if (!queue.timeout) {
      queue.timeout = setTimeout(() => {
        processBatchQueue(network);
      }, NETWORK_CONFIG.BATCH_TIMEOUT);
    }

    // Process immediately if batch is full
    if (queue.requests.length >= NETWORK_CONFIG.MAX_BATCH_SIZE) {
      clearTimeout(queue.timeout);
      processBatchQueue(network);
    }
  });
}

/**
 * Process queued batch requests
 */
async function processBatchQueue(network) {
  const queue = batchQueues.get(network);
  if (!queue || queue.requests.length === 0) {
    return;
  }

  const { requests, callbacks } = queue;
  
  // Reset queue
  batchQueues.set(network, {
    requests: [],
    callbacks: [],
    timeout: null
  });

  try {
    const results = await makeBatchRpcRequest(network, requests);
    
    // Resolve individual promises
    for (let i = 0; i < callbacks.length; i++) {
      const result = results[i];
      if (result && result.error) {
        callbacks[i].reject(new Error(result.error.message));
      } else {
        callbacks[i].resolve(result);
      }
    }

  } catch (error) {
    // Reject all promises in batch
    for (const callback of callbacks) {
      callback.reject(error);
    }
  }
}

/**
 * Get current gas price with caching
 */
async function getCurrentGasPrice(network) {
  try {
    // Check cache first
    const cached = gasPriceCache.get(network);
    if (cached) {
      console.warn(`Gas price cache hit for ${network}`);
      return cached;
    }

    console.warn(`Fetching current gas price for ${network}`);

    // Get gas price from network
    const gasPrice = await makeRpcRequest(network, 'eth_gasPrice', []);
    
    if (!gasPrice) {
      throw new Error('Failed to fetch gas price');
    }

    // Convert hex to decimal
    const gasPriceDecimal = BigInt(gasPrice).toString();
    
    const gasPriceData = {
      gasPrice: gasPriceDecimal,
      gasPriceHex: gasPrice,
      network,
      timestamp: Date.now()
    };

    // Cache the result
    gasPriceCache.set(network, gasPriceData);
    
    console.warn(`Gas price for ${network}: ${gasPriceDecimal} wei`);
    return gasPriceData;

  } catch (error) {
    logger.error(`Failed to get gas price for ${network}: ${error.message}`);
    throw error;
  }
}

/**
 * Get multiple token balances in batch
 */
async function getBatchTokenBalances(network, tokenAddresses, walletAddress) {
  try {
    if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
      return [];
    }

    console.warn(`Getting batch token balances for ${tokenAddresses.length} tokens on ${network}`);

    // Prepare batch requests for balanceOf calls
    const requests = tokenAddresses.map(tokenAddress => ({
      method: 'eth_call',
      params: [{
        to: tokenAddress,
        data: '0x70a08231' + walletAddress.slice(2).padStart(64, '0') // balanceOf(address)
      }, 'latest']
    }));

    const results = await makeBatchRpcRequest(network, requests);
    
    // Process results
    const balances = results.map((result, index) => {
      if (result && result.error) {
        console.warn(`Balance query failed for ${tokenAddresses[index]}: ${result.error.message}`);
        return {
          tokenAddress: tokenAddresses[index],
          balance: '0',
          error: result.error.message
        };
      }

      const balance = result ? BigInt(result).toString() : '0';
      return {
        tokenAddress: tokenAddresses[index],
        balance,
        error: null
      };
    });

    console.warn(`Retrieved ${balances.length} token balances`);
    return balances;

  } catch (error) {
    logger.error(`Batch token balance query failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get network statistics
 */
function getNetworkStats() {
  const poolStats = {};
  
  for (const [network, pool] of connectionPools.entries()) {
    poolStats[network] = pool.getStats();
  }

  return {
    requests: networkStats,
    connectionPools: poolStats,
    batchQueues: Object.fromEntries(
      Array.from(batchQueues.entries()).map(([network, queue]) => [
        network,
        {
          pendingRequests: queue.requests.length,
          hasTimeout: !!queue.timeout
        }
      ])
    ),
    pendingRequests: pendingRequests.size
  };
}

/**
 * Clear all network caches and reset pools
 */
function resetNetworkState() {
  // Clear connection pools
  connectionPools.clear();
  
  // Clear batch queues
  for (const queue of batchQueues.values()) {
    if (queue.timeout) {
      clearTimeout(queue.timeout);
    }
  }
  batchQueues.clear();
  
  // Clear pending requests
  pendingRequests.clear();
  
  // Reset statistics
  Object.assign(networkStats, {
    totalRequests: 0,
    batchedRequests: 0,
    deduplicatedRequests: 0,
    failedRequests: 0,
    retryCount: 0,
    averageResponseTime: 0
  });
  
  console.warn('Network state reset completed');
}

/**
 * Sleep utility function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  makeRpcRequest,
  makeBatchRpcRequest,
  queueBatchRequest,
  getCurrentGasPrice,
  getBatchTokenBalances,
  getNetworkStats,
  resetNetworkState,
  getConnectionPool,
  NETWORK_CONFIG,
  RPC_ENDPOINTS
};