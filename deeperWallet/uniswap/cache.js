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

module.exports = {
  PerformanceCache,
  performanceCache
};