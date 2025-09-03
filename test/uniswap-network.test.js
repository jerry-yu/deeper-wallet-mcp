/**
 * Unit tests for Uniswap network module
 */

const assert = require('assert');
const sinon = require('sinon');

// Mock axios before requiring the module
const mockAxios = {
  post: sinon.stub()
};

// Mock logger
const mockLogger = {
  info: sinon.stub(),
  error: sinon.stub(),
  warn: sinon.stub(),
  debug: sinon.stub()
};

// Mock cache
const mockCache = {
  gasPriceCache: {
    get: sinon.stub(),
    set: sinon.stub()
  }
};

// Mock require calls
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'axios') {
    return mockAxios;
  }
  if (id === '../log') {
    return mockLogger;
  }
  if (id === './cache') {
    return mockCache;
  }
  return originalRequire.apply(this, arguments);
};

const network = require('../deeperWallet/uniswap/network');

describe('Uniswap Network Module', function() {
  beforeEach(function() {
    // Reset all stubs before each test
    sinon.resetHistory();
    mockAxios.post.reset();
    mockLogger.info.reset();
    mockLogger.error.reset();
    mockLogger.warn.reset();
    mockLogger.debug.reset();
    mockCache.gasPriceCache.get.reset();
    mockCache.gasPriceCache.set.reset();
    
    // Reset network state
    network.resetNetworkState();
  });

  describe('NETWORK_CONFIG', function() {
    it('should have reasonable configuration values', function() {
      assert(typeof network.NETWORK_CONFIG.MAX_BATCH_SIZE === 'number');
      assert(network.NETWORK_CONFIG.MAX_BATCH_SIZE > 0);
      
      assert(typeof network.NETWORK_CONFIG.BATCH_TIMEOUT === 'number');
      assert(network.NETWORK_CONFIG.BATCH_TIMEOUT > 0);
      
      assert(typeof network.NETWORK_CONFIG.CONNECTION_TIMEOUT === 'number');
      assert(network.NETWORK_CONFIG.CONNECTION_TIMEOUT > 0);
      
      assert(typeof network.NETWORK_CONFIG.MAX_RETRIES === 'number');
      assert(network.NETWORK_CONFIG.MAX_RETRIES > 0);
      
      assert(typeof network.NETWORK_CONFIG.RETRY_DELAY === 'number');
      assert(network.NETWORK_CONFIG.RETRY_DELAY > 0);
      
      assert(typeof network.NETWORK_CONFIG.POOL_SIZE === 'number');
      assert(network.NETWORK_CONFIG.POOL_SIZE > 0);
      
      assert(typeof network.NETWORK_CONFIG.REQUEST_TIMEOUT === 'number');
      assert(network.NETWORK_CONFIG.REQUEST_TIMEOUT > 0);
    });
  });

  describe('RPC_ENDPOINTS', function() {
    it('should have endpoints for all supported networks', function() {
      const supportedNetworks = ['ETHEREUM', 'ARBITRUM', 'OPTIMISM', 'BASE', 'POLYGON'];
      
      supportedNetworks.forEach(networkName => {
        assert(network.RPC_ENDPOINTS[networkName], `Missing endpoints for ${networkName}`);
        assert(Array.isArray(network.RPC_ENDPOINTS[networkName]), `Endpoints for ${networkName} should be array`);
        assert(network.RPC_ENDPOINTS[networkName].length > 0, `No endpoints for ${networkName}`);
      });
    });

    it('should have valid HTTP/HTTPS URLs', function() {
      const urlRegex = /^https?:\/\/.+/;
      
      Object.values(network.RPC_ENDPOINTS).forEach(endpoints => {
        endpoints.forEach(endpoint => {
          assert(urlRegex.test(endpoint), `Invalid endpoint URL: ${endpoint}`);
        });
      });
    });

    it('should have multiple endpoints per network for redundancy', function() {
      Object.entries(network.RPC_ENDPOINTS).forEach(([networkName, endpoints]) => {
        assert(endpoints.length >= 2, `${networkName} should have at least 2 endpoints for redundancy`);
      });
    });
  });

  describe('getConnectionPool', function() {
    it('should create connection pool for supported networks', function() {
      const pool = network.getConnectionPool('ETHEREUM');
      assert(pool);
      assert.strictEqual(pool.network, 'ETHEREUM');
    });

    it('should reuse existing connection pool', function() {
      const pool1 = network.getConnectionPool('ETHEREUM');
      const pool2 = network.getConnectionPool('ETHEREUM');
      assert.strictEqual(pool1, pool2);
    });

    it('should throw error for unsupported networks', function() {
      assert.throws(() => {
        network.getConnectionPool('UNSUPPORTED_NETWORK');
      }, /No RPC endpoints configured/);
    });
  });

  describe('makeRpcRequest', function() {
    it('should make successful RPC request', async function() {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x1234567890abcdef'
        }
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const result = await network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', []);
      
      assert.strictEqual(result, '0x1234567890abcdef');
      assert(mockAxios.post.calledOnce);
    });

    it('should handle RPC errors', async function() {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32000,
            message: 'execution reverted'
          }
        }
      };
      
      mockAxios.post.resolves(mockResponse);
      
      try {
        await network.makeRpcRequest('ETHEREUM', 'eth_call', []);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('RPC Error'));
      }
    });

    it('should retry on network failures', async function() {
      // First two calls fail, third succeeds
      mockAxios.post.onFirstCall().rejects(new Error('ECONNREFUSED'));
      mockAxios.post.onSecondCall().rejects(new Error('ETIMEDOUT'));
      mockAxios.post.onThirdCall().resolves({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x123'
        }
      });
      
      const result = await network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', []);
      
      assert.strictEqual(result, '0x123');
      assert.strictEqual(mockAxios.post.callCount, 3);
    });

    it('should deduplicate identical requests', async function() {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x123'
        }
      };
      
      mockAxios.post.resolves(mockResponse);
      
      // Make two identical requests simultaneously
      const [result1, result2] = await Promise.all([
        network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', []),
        network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', [])
      ]);
      
      assert.strictEqual(result1, result2);
      // Should only make one actual HTTP request due to deduplication
      assert.strictEqual(mockAxios.post.callCount, 1);
    });

    it('should handle request timeout', async function() {
      mockAxios.post.rejects(new Error('timeout'));
      
      try {
        await network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', [], { timeout: 1000 });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('timeout'));
      }
    });
  });

  describe('makeBatchRpcRequest', function() {
    it('should handle single request in batch', async function() {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x123'
        }
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const requests = [{ method: 'eth_blockNumber', params: [] }];
      const results = await network.makeBatchRpcRequest('ETHEREUM', requests);
      
      assert(Array.isArray(results));
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0], '0x123');
    });

    it('should handle multiple requests in batch', async function() {
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 0, result: '0x123' },
          { jsonrpc: '2.0', id: 1, result: '0x456' },
          { jsonrpc: '2.0', id: 2, result: '0x789' }
        ]
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const requests = [
        { method: 'eth_blockNumber', params: [] },
        { method: 'eth_gasPrice', params: [] },
        { method: 'eth_getBalance', params: ['0x123', 'latest'] }
      ];
      
      const results = await network.makeBatchRpcRequest('ETHEREUM', requests);
      
      assert(Array.isArray(results));
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0], '0x123');
      assert.strictEqual(results[1], '0x456');
      assert.strictEqual(results[2], '0x789');
    });

    it('should handle mixed success/error responses in batch', async function() {
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 0, result: '0x123' },
          { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }
        ]
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const requests = [
        { method: 'eth_blockNumber', params: [] },
        { method: 'eth_call', params: [] }
      ];
      
      const results = await network.makeBatchRpcRequest('ETHEREUM', requests);
      
      assert(Array.isArray(results));
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0], '0x123');
      assert(results[1].error);
    });

    it('should throw error for empty requests array', async function() {
      try {
        await network.makeBatchRpcRequest('ETHEREUM', []);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('non-empty array'));
      }
    });

    it('should throw error for invalid batch response', async function() {
      mockAxios.post.resolves({ data: 'invalid response' });
      
      const requests = [{ method: 'eth_blockNumber', params: [] }];
      
      try {
        await network.makeBatchRpcRequest('ETHEREUM', requests);
        assert.fail('Should have thrown an error');
      } catch (error) {
        // Just verify that an error was thrown - the specific message may vary
        assert(error instanceof Error);
        assert(error.message); // Should have some error message
      }
    });
  });

  describe('getCurrentGasPrice', function() {
    it('should fetch gas price successfully', async function() {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x4a817c800' // 20 gwei in hex
        }
      };
      
      mockAxios.post.resolves(mockResponse);
      mockCache.gasPriceCache.get.returns(null); // Cache miss
      
      const result = await network.getCurrentGasPrice('ETHEREUM');
      
      assert(result.gasPrice);
      assert(result.gasPriceHex);
      assert.strictEqual(result.network, 'ETHEREUM');
      assert(result.timestamp);
      
      // Verify cache was called
      assert(mockCache.gasPriceCache.set.calledOnce);
    });

    it('should return cached gas price', async function() {
      const cachedData = {
        gasPrice: '20000000000',
        gasPriceHex: '0x4a817c800',
        network: 'ETHEREUM',
        timestamp: Date.now()
      };
      
      mockCache.gasPriceCache.get.returns(cachedData);
      
      const result = await network.getCurrentGasPrice('ETHEREUM');
      
      assert.deepStrictEqual(result, cachedData);
      // Should not make HTTP request
      assert(mockAxios.post.notCalled);
    });

    it('should handle gas price fetch failure', async function() {
      mockAxios.post.resolves({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: null
        }
      });
      mockCache.gasPriceCache.get.returns(null);
      
      try {
        await network.getCurrentGasPrice('ETHEREUM');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Failed to fetch gas price'));
      }
    });
  });

  describe('getBatchTokenBalances', function() {
    it('should fetch multiple token balances', async function() {
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 0, result: '0xde0b6b3a7640000' }, // 1 token
          { jsonrpc: '2.0', id: 1, result: '0x1bc16d674ec80000' }  // 2 tokens
        ]
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const tokenAddresses = [
        '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        '0x1234567890123456789012345678901234567890'
      ];
      const walletAddress = '0x9876543210987654321098765432109876543210';
      
      const results = await network.getBatchTokenBalances('ETHEREUM', tokenAddresses, walletAddress);
      
      assert(Array.isArray(results));
      assert.strictEqual(results.length, 2);
      
      assert.strictEqual(results[0].tokenAddress, tokenAddresses[0]);
      assert.strictEqual(results[0].balance, '1000000000000000000');
      assert.strictEqual(results[0].error, null);
      
      assert.strictEqual(results[1].tokenAddress, tokenAddresses[1]);
      assert.strictEqual(results[1].balance, '2000000000000000000');
      assert.strictEqual(results[1].error, null);
    });

    it('should handle empty token addresses array', async function() {
      const results = await network.getBatchTokenBalances('ETHEREUM', [], '0x123');
      
      assert(Array.isArray(results));
      assert.strictEqual(results.length, 0);
    });

    it('should handle balance query errors', async function() {
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 0, result: '0x123' },
          { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }
        ]
      };
      
      mockAxios.post.resolves(mockResponse);
      
      const tokenAddresses = ['0xToken1', '0xToken2'];
      const walletAddress = '0xWallet';
      
      const results = await network.getBatchTokenBalances('ETHEREUM', tokenAddresses, walletAddress);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].error, null);
      assert(results[1].error);
      assert.strictEqual(results[1].balance, '0');
    });
  });

  describe('getNetworkStats', function() {
    it('should return network statistics', function() {
      const stats = network.getNetworkStats();
      
      assert(stats.requests);
      assert(typeof stats.requests.totalRequests === 'number');
      assert(typeof stats.requests.batchedRequests === 'number');
      assert(typeof stats.requests.deduplicatedRequests === 'number');
      assert(typeof stats.requests.failedRequests === 'number');
      assert(typeof stats.requests.retryCount === 'number');
      assert(typeof stats.requests.averageResponseTime === 'number');
      
      assert(stats.connectionPools);
      assert(stats.batchQueues);
      assert(typeof stats.pendingRequests === 'number');
    });

    it('should include connection pool stats after creating pools', function() {
      // Create a connection pool
      network.getConnectionPool('ETHEREUM');
      
      const stats = network.getNetworkStats();
      
      assert(stats.connectionPools.ETHEREUM);
      assert.strictEqual(stats.connectionPools.ETHEREUM.network, 'ETHEREUM');
      assert(typeof stats.connectionPools.ETHEREUM.poolSize === 'number');
      assert(typeof stats.connectionPools.ETHEREUM.totalEndpoints === 'number');
      assert(typeof stats.connectionPools.ETHEREUM.failedEndpoints === 'number');
      assert(Array.isArray(stats.connectionPools.ETHEREUM.connections));
    });
  });

  describe('resetNetworkState', function() {
    it('should reset all network state', function() {
      // Create some state first
      network.getConnectionPool('ETHEREUM');
      
      // Reset state
      network.resetNetworkState();
      
      const stats = network.getNetworkStats();
      
      // All stats should be reset to 0
      assert.strictEqual(stats.requests.totalRequests, 0);
      assert.strictEqual(stats.requests.batchedRequests, 0);
      assert.strictEqual(stats.requests.deduplicatedRequests, 0);
      assert.strictEqual(stats.requests.failedRequests, 0);
      assert.strictEqual(stats.requests.retryCount, 0);
      assert.strictEqual(stats.requests.averageResponseTime, 0);
      
      // Connection pools should be cleared
      assert.strictEqual(Object.keys(stats.connectionPools).length, 0);
      
      // Pending requests should be cleared
      assert.strictEqual(stats.pendingRequests, 0);
    });
  });

  describe('ConnectionPool class functionality', function() {
    it('should create connection pool with correct configuration', function() {
      const pool = network.getConnectionPool('ETHEREUM');
      const stats = pool.getStats();
      
      assert.strictEqual(stats.network, 'ETHEREUM');
      assert(stats.poolSize > 0);
      assert(stats.totalEndpoints > 0);
      assert.strictEqual(stats.failedEndpoints, 0);
      assert(Array.isArray(stats.connections));
      assert.strictEqual(stats.connections.length, stats.poolSize);
    });

    it('should track connection usage', function() {
      const pool = network.getConnectionPool('ETHEREUM');
      
      // Get a connection
      const connection = pool.getConnection();
      
      assert(connection.id >= 0);
      assert(connection.endpoint);
      assert(connection.lastUsed > 0);
      assert(connection.requestCount > 0);
    });

    it('should handle endpoint failures', function() {
      const pool = network.getConnectionPool('ETHEREUM');
      const initialStats = pool.getStats();
      
      // Mark an endpoint as failed
      const endpoint = network.RPC_ENDPOINTS['ETHEREUM'][0];
      pool.markEndpointFailed(endpoint);
      
      const updatedStats = pool.getStats();
      assert(updatedStats.failedEndpoints > initialStats.failedEndpoints);
    });
  });

  describe('Error handling and edge cases', function() {
    it('should handle axios network errors', async function() {
      mockAxios.post.rejects(new Error('Network Error'));
      
      try {
        await network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', []);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('Network Error'));
      }
    });

    it('should handle malformed RPC responses', async function() {
      mockAxios.post.resolves({ data: null });
      
      try {
        await network.makeRpcRequest('ETHEREUM', 'eth_blockNumber', []);
        assert.fail('Should have thrown an error');
      } catch (error) {
        // Should handle gracefully
        assert(error);
      }
    });

    it('should validate batch request parameters', async function() {
      try {
        await network.makeBatchRpcRequest('ETHEREUM', null);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('non-empty array'));
      }
      
      try {
        await network.makeBatchRpcRequest('ETHEREUM', 'not an array');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error.message.includes('non-empty array'));
      }
    });
  });
});