/**
 * Integration Tests for Uniswap Caching and Network Optimizations
 * Tests the integration between caching system and network optimization modules
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const assert = require('assert');
const sinon = require('sinon');

// Import modules
const {
  tokenCache,
  poolCache,
  gasPriceCache,
  clear,
  getStats
} = require('../deeperWallet/uniswap/cache');

const {
  resetNetworkState,
  getNetworkStats
} = require('../deeperWallet/uniswap/network');

describe('Uniswap Cache and Network Integration', () => {
  beforeEach(() => {
    // Clear all caches and reset network state
    clear();
    resetNetworkState();
  });

  afterEach(() => {
    // Clean up after each test
    clear();
    resetNetworkState();
  });

  describe('Cache Integration', () => {
    it('should integrate token cache with network operations', () => {
      // Simulate token metadata caching
      const tokenData = {
        address: '0xA0b86a33E6441c8C06DD2b7c94b7E0e8c07e8e8e',
        name: 'Uniswap',
        symbol: 'UNI',
        decimals: 18,
        network: 'ETHEREUM'
      };

      // Cache token data
      tokenCache.set('ETHEREUM', tokenData.address, tokenData);

      // Verify cache hit
      const retrieved = tokenCache.get('ETHEREUM', tokenData.address);
      assert.deepStrictEqual(retrieved, tokenData);

      // Verify cache statistics
      const stats = getStats('tokenMetadata');
      assert(stats.totalEntries >= 1);
      assert(stats.hits >= 1);
    });

    it('should integrate pool cache with network operations', () => {
      // Simulate pool data caching
      const poolData = {
        exists: true,
        address: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
        liquidity: '1000000000000000000000',
        sqrtPriceX96: '79228162514264337593543950336',
        tick: 0,
        network: 'ETHEREUM'
      };

      // Cache pool data
      poolCache.set('ETHEREUM', poolData.address, poolData);

      // Verify cache hit
      const retrieved = poolCache.get('ETHEREUM', poolData.address);
      assert.deepStrictEqual(retrieved, poolData);

      // Test pool statistics caching
      const statsData = {
        ...poolData,
        volume24h: '5000000',
        tvl: '10000000',
        priceChange24h: 1.5
      };

      poolCache.setStats('ETHEREUM', poolData.address, statsData);
      const retrievedStats = poolCache.getStats('ETHEREUM', poolData.address);
      assert.deepStrictEqual(retrievedStats, statsData);
    });

    it('should integrate gas price cache with network operations', () => {
      // Simulate gas price caching
      const gasPriceData = {
        gasPrice: '25000000000', // 25 gwei
        gasPriceHex: '0x5d21dba00',
        network: 'ETHEREUM',
        timestamp: Date.now()
      };

      // Cache gas price data
      gasPriceCache.set('ETHEREUM', gasPriceData);

      // Verify cache hit
      const retrieved = gasPriceCache.get('ETHEREUM');
      assert.deepStrictEqual(retrieved, gasPriceData);
    });
  });

  describe('Network Statistics Integration', () => {
    it('should provide comprehensive network statistics', () => {
      // Get initial network stats
      const stats = getNetworkStats();
      
      assert(typeof stats === 'object');
      assert(stats.hasOwnProperty('requests'));
      assert(stats.hasOwnProperty('connectionPools'));
      assert(stats.hasOwnProperty('batchQueues'));
      assert(stats.hasOwnProperty('pendingRequests'));

      // Verify request statistics structure
      assert(typeof stats.requests.totalRequests === 'number');
      assert(typeof stats.requests.batchedRequests === 'number');
      assert(typeof stats.requests.deduplicatedRequests === 'number');
      assert(typeof stats.requests.failedRequests === 'number');
    });

    it('should track cache performance metrics', () => {
      // Add some cache entries
      tokenCache.set('ETHEREUM', '0x1111111111111111111111111111111111111111', { symbol: 'TOKEN1' });
      tokenCache.set('ETHEREUM', '0x2222222222222222222222222222222222222222', { symbol: 'TOKEN2' });
      
      // Access cache to generate hits
      tokenCache.get('ETHEREUM', '0x1111111111111111111111111111111111111111');
      tokenCache.get('ETHEREUM', '0x1111111111111111111111111111111111111111'); // Second access for hit
      
      // Get cache statistics
      const cacheStats = getStats();
      
      assert(typeof cacheStats === 'object');
      assert(cacheStats.hasOwnProperty('summary'));
      assert(cacheStats.summary.totalEntries >= 2);
      assert(cacheStats.summary.totalHits >= 1);
    });
  });

  describe('Performance Optimization Integration', () => {
    it('should demonstrate cache TTL behavior', (done) => {
      // Set entry with short TTL
      const testData = { test: 'performance' };
      tokenCache.set('ETHEREUM', 'test-token', testData);
      
      // Should be available immediately
      const immediate = tokenCache.get('ETHEREUM', 'test-token');
      assert.deepStrictEqual(immediate, testData);
      
      // Test that cache works as expected
      setTimeout(() => {
        // Should still be available (default TTL is 24 hours)
        const later = tokenCache.get('ETHEREUM', 'test-token');
        assert.deepStrictEqual(later, testData);
        done();
      }, 100);
    });

    it('should handle multiple cache types efficiently', () => {
      const startTime = Date.now();
      
      // Add entries to different cache types
      for (let i = 0; i < 100; i++) {
        tokenCache.set('ETHEREUM', `token-${i}`, { symbol: `TK${i}` });
        poolCache.set('ETHEREUM', `pool-${i}`, { liquidity: `${i}000000` });
        gasPriceCache.set(`NETWORK-${i}`, { gasPrice: `${i}000000000` });
      }
      
      // Access all entries
      for (let i = 0; i < 100; i++) {
        tokenCache.get('ETHEREUM', `token-${i}`);
        poolCache.get('ETHEREUM', `pool-${i}`);
        gasPriceCache.get(`NETWORK-${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete quickly
      assert(duration < 1000, `Cache operations took ${duration}ms, expected < 1000ms`);
      
      // Verify all entries are accessible
      const stats = getStats();
      assert(stats.summary.totalEntries >= 300); // 100 each type
    });

    it('should demonstrate cache key generation consistency', () => {
      const { createCacheKey } = require('../deeperWallet/uniswap/cache');
      
      // Test consistent key generation
      const key1 = createCacheKey('ETHEREUM', '0xABC', 'metadata');
      const key2 = createCacheKey('ethereum', '0xabc', 'metadata');
      
      // Keys should be normalized to lowercase
      assert.strictEqual(key1, 'ethereum:0xabc:metadata');
      assert.strictEqual(key2, 'ethereum:0xabc:metadata');
      assert.strictEqual(key1, key2);
      
      // Test with null/undefined values
      const key3 = createCacheKey('ETHEREUM', null, 'test', undefined, 'end');
      assert.strictEqual(key3, 'ethereum:test:end');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid cache operations gracefully', () => {
      const { get, set } = require('../deeperWallet/uniswap/cache');
      
      // Test invalid cache type
      const result = get('invalidType', 'key');
      assert.strictEqual(result, null);
      
      const success = set('invalidType', 'key', { data: 'test' });
      assert.strictEqual(success, false);
    });

    it('should handle cache validation correctly', () => {
      const { isValidEntry } = require('../deeperWallet/uniswap/cache');
      
      // Valid entry
      const validEntry = {
        data: { test: 'data' },
        timestamp: Date.now(),
        ttl: 3600,
        key: 'test-key'
      };
      assert.strictEqual(isValidEntry(validEntry), true);
      
      // Invalid entries
      assert.strictEqual(isValidEntry(null), false);
      assert.strictEqual(isValidEntry({}), false);
      assert.strictEqual(isValidEntry({ timestamp: Date.now() }), false);
      
      // Expired entry
      const expiredEntry = {
        data: { test: 'data' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        ttl: 3600, // 1 hour TTL
        key: 'test-key'
      };
      assert.strictEqual(isValidEntry(expiredEntry), false);
    });
  });

  describe('Memory Management Integration', () => {
    it('should manage memory efficiently with large datasets', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Add many entries
      for (let i = 0; i < 1000; i++) {
        tokenCache.set('ETHEREUM', `token-${i}`, {
          address: `0x${i.toString(16).padStart(40, '0')}`,
          name: `Token ${i}`,
          symbol: `TK${i}`,
          decimals: 18
        });
      }
      
      // Clear cache to free memory
      clear();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      assert(memoryIncrease < 20 * 1024 * 1024, `Memory increased by ${memoryIncrease} bytes, expected < 20MB`);
    });
  });
});