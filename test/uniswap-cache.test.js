/**
 * Tests for Uniswap Caching System
 * Tests token metadata, pool data, and gas price caching with TTL behavior
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const assert = require('assert');
const {
  get,
  set,
  del,
  clear,
  cleanup,
  getStats,
  tokenCache,
  poolCache,
  gasPriceCache,
  routeCache,
  quoteCache,
  approvalCache,
  createCacheKey,
  isValidEntry,
  CACHE_TTL
} = require('../deeperWallet/uniswap/cache');

describe('Uniswap Cache System', () => {
  beforeEach(() => {
    // Clear all caches before each test
    clear();
  });

  afterEach(() => {
    // Clean up after each test
    clear();
  });

  describe('Core Cache Operations', () => {
    it('should set and get cache entries', () => {
      const testData = { name: 'Test Token', symbol: 'TEST', decimals: 18 };
      
      const success = set('tokenMetadata', 'test-key', testData);
      assert.strictEqual(success, true);
      
      const retrieved = get('tokenMetadata', 'test-key');
      assert.deepStrictEqual(retrieved, testData);
    });

    it('should return null for non-existent cache entries', () => {
      const result = get('tokenMetadata', 'non-existent-key');
      assert.strictEqual(result, null);
    });

    it('should delete cache entries', () => {
      const testData = { test: 'data' };
      set('tokenMetadata', 'test-key', testData);
      
      const deleted = del('tokenMetadata', 'test-key');
      assert.strictEqual(deleted, true);
      
      const retrieved = get('tokenMetadata', 'test-key');
      assert.strictEqual(retrieved, null);
    });

    it('should clear entire cache', () => {
      set('tokenMetadata', 'key1', { data: 1 });
      set('poolData', 'key2', { data: 2 });
      
      const cleared = clear();
      assert(cleared > 0);
      
      assert.strictEqual(get('tokenMetadata', 'key1'), null);
      assert.strictEqual(get('poolData', 'key2'), null);
    });

    it('should clear specific cache type', () => {
      set('tokenMetadata', 'key1', { data: 1 });
      set('poolData', 'key2', { data: 2 });
      
      const cleared = clear('tokenMetadata');
      assert.strictEqual(cleared, 1);
      
      assert.strictEqual(get('tokenMetadata', 'key1'), null);
      assert.deepStrictEqual(get('poolData', 'key2'), { data: 2 });
    });
  });

  describe('Cache TTL Behavior', () => {
    it('should use default TTL when not specified', () => {
      const testData = { test: 'data' };
      
      set('tokenMetadata', 'test-key', testData);
      
      // Should be available
      assert.deepStrictEqual(get('tokenMetadata', 'test-key'), testData);
    });

    it('should handle cleanup of entries', () => {
      const testData = { test: 'data' };
      set('tokenMetadata', 'test-key', testData);
      
      // Cleanup should not remove valid entries
      const cleaned = cleanup();
      assert.deepStrictEqual(get('tokenMetadata', 'test-key'), testData);
    });
  });

  describe('Token Cache Helpers', () => {
    it('should cache and retrieve token metadata', () => {
      const tokenData = {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        network: 'ETHEREUM'
      };
      
      tokenCache.set('ETHEREUM', '0x1234567890123456789012345678901234567890', tokenData);
      
      const retrieved = tokenCache.get('ETHEREUM', '0x1234567890123456789012345678901234567890');
      assert.deepStrictEqual(retrieved, tokenData);
    });

    it('should clear token cache', () => {
      tokenCache.set('ETHEREUM', '0x1234567890123456789012345678901234567890', { test: 'data' });
      
      tokenCache.clear();
      
      const retrieved = tokenCache.get('ETHEREUM', '0x1234567890123456789012345678901234567890');
      assert.strictEqual(retrieved, null);
    });

    it('should delete specific token from cache', () => {
      tokenCache.set('ETHEREUM', '0x1234567890123456789012345678901234567890', { test: 'data' });
      
      const deleted = tokenCache.del('ETHEREUM', '0x1234567890123456789012345678901234567890');
      assert.strictEqual(deleted, true);
      
      const retrieved = tokenCache.get('ETHEREUM', '0x1234567890123456789012345678901234567890');
      assert.strictEqual(retrieved, null);
    });
  });

  describe('Utility Functions', () => {
    it('should create cache keys correctly', () => {
      const key = createCacheKey('ETHEREUM', '0x1234', 'test');
      assert.strictEqual(key, 'ethereum:0x1234:test');
    });

    it('should handle null/undefined in cache key creation', () => {
      const key = createCacheKey('ETHEREUM', null, 'test', undefined);
      assert.strictEqual(key, 'ethereum:test');
    });

    it('should validate cache entries correctly', () => {
      const validEntry = {
        data: { test: 'data' },
        timestamp: Date.now(),
        ttl: 3600,
        key: 'test-key'
      };
      
      assert.strictEqual(isValidEntry(validEntry), true);
      
      const expiredEntry = {
        data: { test: 'data' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        ttl: 3600, // 1 hour TTL
        key: 'test-key'
      };
      
      assert.strictEqual(isValidEntry(expiredEntry), false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid cache type gracefully', () => {
      const result = get('invalidCacheType', 'test-key');
      assert.strictEqual(result, null);
      
      const success = set('invalidCacheType', 'test-key', { data: 'test' });
      assert.strictEqual(success, false);
    });

    it('should handle cache operations with invalid parameters', () => {
      assert.strictEqual(isValidEntry(null), false);
      assert.strictEqual(isValidEntry({}), false);
      assert.strictEqual(isValidEntry({ timestamp: Date.now() }), false);
    });
  });
});