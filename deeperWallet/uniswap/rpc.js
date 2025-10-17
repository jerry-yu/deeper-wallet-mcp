const { getRpcUrl } = require('./utils');
const axios = require('axios');
const to = require('await-to-js').default;
const { performanceCache } = require('./cache');

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

module.exports = {
  BatchRpcManager,
  batchRpcManager,
  sendRpcRequest,
  sendCachedRpcRequest,
  sendMultipleRpcRequests
};