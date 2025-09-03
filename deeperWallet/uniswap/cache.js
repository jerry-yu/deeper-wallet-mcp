/**
 * Centralized Caching System for Uniswap Module
 * Provides token metadata, pool data, and gas price caching with configurable TTL
 */

const logger = require('../log');

// Cache TTL configurations (in seconds)
const CACHE_TTL = {
  TOKEN_METADATA: 24 * 60 * 60, // 24 hours
  POOL_DATA: 5 * 60,            // 5 minutes
  GAS_PRICE: 30,                // 30 seconds
  ROUTES: 60,                   // 1 minute
  QUOTES: 30,                   // 30 seconds
  APPROVALS: 10 * 60            // 10 minutes
};

// Cache storage maps
const caches = {
  tokenMetadata: new Map(),
  poolData: new Map(),
  gasPrice: new Map(),
  routes: new Map(),
  quotes: new Map(),
  approvals: new Map()
};

// Cache statistics
const stats = {
  tokenMetadata: { hits: 0, misses: 0, sets: 0, deletes: 0 },
  poolData: { hits: 0, misses: 0, sets: 0, deletes: 0 },
  gasPrice: { hits: 0, misses: 0, sets: 0, deletes: 0 },
  routes: { hits: 0, misses: 0, sets: 0, deletes: 0 },
  quotes: { hits: 0, misses: 0, sets: 0, deletes: 0 },
  approvals: { hits: 0, misses: 0, sets: 0, deletes: 0 }
};

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} data - Cached data
 * @property {number} timestamp - Cache entry timestamp
 * @property {number} ttl - Time to live in seconds
 * @property {string} key - Cache key
 */

/**
 * Create a cache key from components
 * @param {...string} components - Key components
 * @returns {string} Cache key
 */
function createCacheKey(...components) {
  return components
    .filter(c => c !== null && c !== undefined)
    .map(c => String(c).toLowerCase())
    .join(':');
}

/**
 * Check if cache entry is valid (not expired)
 * @param {CacheEntry} entry - Cache entry
 * @returns {boolean} True if valid
 */
function isValidEntry(entry) {
  if (!entry || !entry.timestamp || !entry.ttl) {
    return false;
  }
  
  const now = Date.now();
  const expirationTime = entry.timestamp + (entry.ttl * 1000);
  return now < expirationTime;
}

/**
 * Get data from cache
 * @param {string} cacheType - Type of cache (tokenMetadata, poolData, etc.)
 * @param {string} key - Cache key
 * @returns {any|null} Cached data or null if not found/expired
 */
function get(cacheType, key) {
  try {
    const cache = caches[cacheType];
    if (!cache) {
      console.warn(`Invalid cache type: ${cacheType}`);
      return null;
    }

    const entry = cache.get(key);
    if (!entry) {
      stats[cacheType].misses++;
      return null;
    }

    if (!isValidEntry(entry)) {
      // Entry expired, remove it
      cache.delete(key);
      stats[cacheType].misses++;
      stats[cacheType].deletes++;
      logger.debug(`Cache entry expired and removed: ${cacheType}:${key}`);
      return null;
    }

    stats[cacheType].hits++;
    logger.debug(`Cache hit: ${cacheType}:${key}`);
    return entry.data;

  } catch (error) {
    logger.error(`Cache get failed for ${cacheType}:${key}: ${error.message}`);
    return null;
  }
}

/**
 * Set data in cache
 * @param {string} cacheType - Type of cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} customTTL - Custom TTL in seconds (optional)
 * @returns {boolean} True if successful
 */
function set(cacheType, key, data, customTTL = null) {
  try {
    const cache = caches[cacheType];
    if (!cache) {
      console.warn(`Invalid cache type: ${cacheType}`);
      return false;
    }

    const ttl = customTTL || CACHE_TTL[cacheType.toUpperCase()] || CACHE_TTL.POOL_DATA;
    
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      key
    };

    cache.set(key, entry);
    stats[cacheType].sets++;
    
    logger.debug(`Cache set: ${cacheType}:${key} (TTL: ${ttl}s)`);
    return true;

  } catch (error) {
    logger.error(`Cache set failed for ${cacheType}:${key}: ${error.message}`);
    return false;
  }
}

/**
 * Delete specific cache entry
 * @param {string} cacheType - Type of cache
 * @param {string} key - Cache key
 * @returns {boolean} True if deleted
 */
function del(cacheType, key) {
  try {
    const cache = caches[cacheType];
    if (!cache) {
      console.warn(`Invalid cache type: ${cacheType}`);
      return false;
    }

    const deleted = cache.delete(key);
    if (deleted) {
      stats[cacheType].deletes++;
      logger.debug(`Cache deleted: ${cacheType}:${key}`);
    }
    
    return deleted;

  } catch (error) {
    logger.error(`Cache delete failed for ${cacheType}:${key}: ${error.message}`);
    return false;
  }
}

/**
 * Clear entire cache or specific cache type
 * @param {string} cacheType - Optional cache type to clear (clears all if not specified)
 * @returns {number} Number of entries cleared
 */
function clear(cacheType = null) {
  try {
    let totalCleared = 0;

    if (cacheType) {
      const cache = caches[cacheType];
      if (cache) {
        const size = cache.size;
        cache.clear();
        stats[cacheType].deletes += size;
        totalCleared = size;
        console.warn(`Cleared ${cacheType} cache: ${size} entries`);
      }
    } else {
      // Clear all caches
      for (const [type, cache] of Object.entries(caches)) {
        const size = cache.size;
        cache.clear();
        stats[type].deletes += size;
        totalCleared += size;
      }
      console.warn(`Cleared all caches: ${totalCleared} entries`);
    }

    return totalCleared;

  } catch (error) {
    logger.error(`Cache clear failed: ${error.message}`);
    return 0;
  }
}

/**
 * Clean up expired entries from all caches
 * @returns {number} Number of expired entries removed
 */
function cleanup() {
  try {
    let totalCleaned = 0;

    for (const [cacheType, cache] of Object.entries(caches)) {
      const keysToDelete = [];
      
      for (const [key, entry] of cache.entries()) {
        if (!isValidEntry(entry)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        cache.delete(key);
        stats[cacheType].deletes++;
        totalCleaned++;
      }

      if (keysToDelete.length > 0) {
        logger.debug(`Cleaned ${keysToDelete.length} expired entries from ${cacheType} cache`);
      }
    }

    if (totalCleaned > 0) {
      console.warn(`Cache cleanup completed: ${totalCleaned} expired entries removed`);
    }

    return totalCleaned;

  } catch (error) {
    logger.error(`Cache cleanup failed: ${error.message}`);
    return 0;
  }
}

/**
 * Get cache statistics
 * @param {string} cacheType - Optional specific cache type
 * @returns {Object} Cache statistics
 */
function getStats(cacheType = null) {
  try {
    if (cacheType) {
      const cache = caches[cacheType];
      const stat = stats[cacheType];
      
      if (!cache || !stat) {
        return null;
      }

      const now = Date.now();
      let validEntries = 0;
      let expiredEntries = 0;

      for (const entry of cache.values()) {
        if (isValidEntry(entry)) {
          validEntries++;
        } else {
          expiredEntries++;
        }
      }

      return {
        cacheType,
        totalEntries: cache.size,
        validEntries,
        expiredEntries,
        hits: stat.hits,
        misses: stat.misses,
        sets: stat.sets,
        deletes: stat.deletes,
        hitRate: stat.hits + stat.misses > 0 ? (stat.hits / (stat.hits + stat.misses) * 100).toFixed(2) + '%' : '0%',
        ttl: CACHE_TTL[cacheType.toUpperCase()] || 'unknown'
      };
    } else {
      // Return stats for all caches
      const allStats = {};
      let totalEntries = 0;
      let totalHits = 0;
      let totalMisses = 0;

      for (const type of Object.keys(caches)) {
        const typeStats = getStats(type);
        if (typeStats) {
          allStats[type] = typeStats;
          totalEntries += typeStats.totalEntries;
          totalHits += typeStats.hits;
          totalMisses += typeStats.misses;
        }
      }

      return {
        summary: {
          totalEntries,
          totalHits,
          totalMisses,
          overallHitRate: totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses) * 100).toFixed(2) + '%' : '0%'
        },
        caches: allStats
      };
    }

  } catch (error) {
    logger.error(`Get cache stats failed: ${error.message}`);
    return null;
  }
}

/**
 * Token metadata cache helpers
 */
const tokenCache = {
  get: (network, address) => get('tokenMetadata', createCacheKey(network, address)),
  set: (network, address, data) => set('tokenMetadata', createCacheKey(network, address), data),
  del: (network, address) => del('tokenMetadata', createCacheKey(network, address)),
  clear: () => clear('tokenMetadata')
};

/**
 * Pool data cache helpers
 */
const poolCache = {
  get: (network, poolAddress) => get('poolData', createCacheKey(network, poolAddress)),
  set: (network, poolAddress, data) => set('poolData', createCacheKey(network, poolAddress), data),
  del: (network, poolAddress) => del('poolData', createCacheKey(network, poolAddress)),
  clear: () => clear('poolData'),
  
  // Pool statistics cache
  getStats: (network, poolAddress) => get('poolData', createCacheKey('stats', network, poolAddress)),
  setStats: (network, poolAddress, data) => set('poolData', createCacheKey('stats', network, poolAddress), data),
  
  // Pool pair cache
  getPair: (network, token0, token1) => get('poolData', createCacheKey('pair', network, token0, token1)),
  setPair: (network, token0, token1, data) => set('poolData', createCacheKey('pair', network, token0, token1), data)
};

/**
 * Gas price cache helpers
 */
const gasPriceCache = {
  get: (network) => get('gasPrice', createCacheKey(network)),
  set: (network, data) => set('gasPrice', createCacheKey(network), data),
  del: (network) => del('gasPrice', createCacheKey(network)),
  clear: () => clear('gasPrice')
};

/**
 * Route cache helpers
 */
const routeCache = {
  get: (network, tokenIn, tokenOut, amountIn, slippage) => 
    get('routes', createCacheKey(network, tokenIn, tokenOut, amountIn, slippage)),
  set: (network, tokenIn, tokenOut, amountIn, slippage, data) => 
    set('routes', createCacheKey(network, tokenIn, tokenOut, amountIn, slippage), data),
  del: (network, tokenIn, tokenOut, amountIn, slippage) => 
    del('routes', createCacheKey(network, tokenIn, tokenOut, amountIn, slippage)),
  clear: () => clear('routes')
};

/**
 * Quote cache helpers
 */
const quoteCache = {
  get: (network, tokenIn, tokenOut, amountIn, fee) => 
    get('quotes', createCacheKey(network, tokenIn, tokenOut, amountIn, fee)),
  set: (network, tokenIn, tokenOut, amountIn, fee, data) => 
    set('quotes', createCacheKey(network, tokenIn, tokenOut, amountIn, fee), data),
  del: (network, tokenIn, tokenOut, amountIn, fee) => 
    del('quotes', createCacheKey(network, tokenIn, tokenOut, amountIn, fee)),
  clear: () => clear('quotes')
};

/**
 * Approval cache helpers
 */
const approvalCache = {
  get: (network, tokenAddress, ownerAddress, spenderAddress) => 
    get('approvals', createCacheKey(network, tokenAddress, ownerAddress, spenderAddress)),
  set: (network, tokenAddress, ownerAddress, spenderAddress, data) => 
    set('approvals', createCacheKey(network, tokenAddress, ownerAddress, spenderAddress), data),
  del: (network, tokenAddress, ownerAddress, spenderAddress) => 
    del('approvals', createCacheKey(network, tokenAddress, ownerAddress, spenderAddress)),
  clear: () => clear('approvals')
};

/**
 * Start automatic cache cleanup interval
 * @param {number} intervalMs - Cleanup interval in milliseconds (default: 5 minutes)
 * @returns {NodeJS.Timeout} Interval timer
 */
function startCleanupInterval(intervalMs = 5 * 60 * 1000) {
  const interval = setInterval(() => {
    try {
      cleanup();
    } catch (error) {
      logger.error(`Automatic cache cleanup failed: ${error.message}`);
    }
  }, intervalMs);

  console.warn(`Started automatic cache cleanup with ${intervalMs / 1000}s interval`);
  return interval;
}

/**
 * Stop automatic cache cleanup
 * @param {NodeJS.Timeout} interval - Interval timer to stop
 */
function stopCleanupInterval(interval) {
  if (interval) {
    clearInterval(interval);
    console.warn('Stopped automatic cache cleanup');
  }
}

// Export cache interface
module.exports = {
  // Core cache operations
  get,
  set,
  del,
  clear,
  cleanup,
  getStats,
  
  // Specialized cache helpers
  tokenCache,
  poolCache,
  gasPriceCache,
  routeCache,
  quoteCache,
  approvalCache,
  
  // Utility functions
  createCacheKey,
  isValidEntry,
  startCleanupInterval,
  stopCleanupInterval,
  
  // Constants
  CACHE_TTL
};