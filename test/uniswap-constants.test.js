/**
 * Unit tests for Uniswap constants module
 */

const assert = require('assert');
const constants = require('../deeperWallet/uniswap/constants');

describe('Uniswap Constants Module', function() {
  describe('getNetworkConfig', function() {
    it('should return config for supported networks', function() {
      const ethereumConfig = constants.getNetworkConfig('ETHEREUM');
      assert(ethereumConfig);
      assert.strictEqual(ethereumConfig.CHAIN_ID, 1);
      assert(ethereumConfig.UNIVERSAL_ROUTER);
      assert(ethereumConfig.V3_FACTORY);
      assert(ethereumConfig.QUOTER_V2);
      assert(ethereumConfig.WETH);
    });

    it('should return config for case-insensitive network names', function() {
      const config1 = constants.getNetworkConfig('ethereum');
      const config2 = constants.getNetworkConfig('ETHEREUM');
      const config3 = constants.getNetworkConfig('Ethereum');
      
      assert.deepStrictEqual(config1, config2);
      assert.deepStrictEqual(config2, config3);
    });

    it('should throw error for unsupported networks', function() {
      assert.throws(() => {
        constants.getNetworkConfig('UNSUPPORTED_NETWORK');
      }, /Unsupported network/);
    });

    it('should have all required fields for each network', function() {
      const supportedNetworks = constants.getSupportedNetworks();
      
      supportedNetworks.forEach(network => {
        const config = constants.getNetworkConfig(network);
        
        assert(config.UNIVERSAL_ROUTER, `${network} missing UNIVERSAL_ROUTER`);
        assert(config.V3_FACTORY, `${network} missing V3_FACTORY`);
        assert(config.QUOTER_V2, `${network} missing QUOTER_V2`);
        assert(config.WETH, `${network} missing WETH`);
        assert(typeof config.CHAIN_ID === 'number', `${network} missing or invalid CHAIN_ID`);
        
        // V4_FACTORY can be null for networks that don't support V4 yet
        assert(config.hasOwnProperty('V4_FACTORY'), `${network} missing V4_FACTORY property`);
      });
    });
  });

  describe('getSupportedNetworks', function() {
    it('should return array of supported networks', function() {
      const networks = constants.getSupportedNetworks();
      
      assert(Array.isArray(networks));
      assert(networks.length > 0);
      assert(networks.includes('ETHEREUM'));
      assert(networks.includes('ARBITRUM'));
      assert(networks.includes('OPTIMISM'));
      assert(networks.includes('BASE'));
      assert(networks.includes('POLYGON'));
    });

    it('should return networks in uppercase', function() {
      const networks = constants.getSupportedNetworks();
      
      networks.forEach(network => {
        assert.strictEqual(network, network.toUpperCase());
      });
    });
  });

  describe('supportsV4', function() {
    it('should return boolean for V4 support', function() {
      const networks = constants.getSupportedNetworks();
      
      networks.forEach(network => {
        const supportsV4 = constants.supportsV4(network);
        assert(typeof supportsV4 === 'boolean');
      });
    });

    it('should return false for networks without V4 factory', function() {
      // Currently most networks don't have V4 deployed
      const ethereumSupportsV4 = constants.supportsV4('ETHEREUM');
      assert.strictEqual(ethereumSupportsV4, false);
    });

    it('should throw error for unsupported networks', function() {
      assert.throws(() => {
        constants.supportsV4('UNSUPPORTED_NETWORK');
      }, /Unsupported network/);
    });
  });

  describe('FEE_TIERS', function() {
    it('should have all standard Uniswap V3 fee tiers', function() {
      assert.strictEqual(constants.FEE_TIERS.LOWEST, 100);
      assert.strictEqual(constants.FEE_TIERS.LOW, 500);
      assert.strictEqual(constants.FEE_TIERS.MEDIUM, 3000);
      assert.strictEqual(constants.FEE_TIERS.HIGH, 10000);
    });

    it('should have numeric values for all fee tiers', function() {
      Object.values(constants.FEE_TIERS).forEach(fee => {
        assert(typeof fee === 'number');
        assert(fee > 0);
      });
    });
  });

  describe('DEFAULTS', function() {
    it('should have reasonable default values', function() {
      assert(typeof constants.DEFAULTS.SLIPPAGE_TOLERANCE === 'number');
      assert(constants.DEFAULTS.SLIPPAGE_TOLERANCE > 0);
      assert(constants.DEFAULTS.SLIPPAGE_TOLERANCE < 100);
      
      assert(typeof constants.DEFAULTS.DEADLINE_MINUTES === 'number');
      assert(constants.DEFAULTS.DEADLINE_MINUTES > 0);
      
      assert(typeof constants.DEFAULTS.GAS_LIMIT_BUFFER === 'number');
      assert(constants.DEFAULTS.GAS_LIMIT_BUFFER > 1);
      
      assert(typeof constants.DEFAULTS.MAX_HOPS === 'number');
      assert(constants.DEFAULTS.MAX_HOPS > 0);
    });
  });

  describe('CACHE_TTL', function() {
    it('should have TTL values for all cache types', function() {
      assert(typeof constants.CACHE_TTL.TOKEN_METADATA === 'number');
      assert(typeof constants.CACHE_TTL.POOL_INFO === 'number');
      assert(typeof constants.CACHE_TTL.GAS_PRICE === 'number');
      assert(typeof constants.CACHE_TTL.ROUTES === 'number');
    });

    it('should have reasonable TTL values', function() {
      // Token metadata should have longer TTL than pool info
      assert(constants.CACHE_TTL.TOKEN_METADATA > constants.CACHE_TTL.POOL_INFO);
      
      // Gas price should have shortest TTL
      assert(constants.CACHE_TTL.GAS_PRICE <= constants.CACHE_TTL.POOL_INFO);
      
      // All TTL values should be positive
      Object.values(constants.CACHE_TTL).forEach(ttl => {
        assert(ttl > 0);
      });
    });
  });

  describe('UNISWAP_CONFIGS structure', function() {
    it('should have consistent structure across all networks', function() {
      const networks = constants.getSupportedNetworks();
      const requiredFields = ['UNIVERSAL_ROUTER', 'V3_FACTORY', 'V4_FACTORY', 'QUOTER_V2', 'WETH', 'CHAIN_ID'];
      
      networks.forEach(network => {
        const config = constants.getNetworkConfig(network);
        
        requiredFields.forEach(field => {
          assert(config.hasOwnProperty(field), `${network} missing field: ${field}`);
        });
      });
    });

    it('should have unique chain IDs', function() {
      const networks = constants.getSupportedNetworks();
      const chainIds = new Set();
      
      networks.forEach(network => {
        const config = constants.getNetworkConfig(network);
        assert(!chainIds.has(config.CHAIN_ID), `Duplicate chain ID: ${config.CHAIN_ID}`);
        chainIds.add(config.CHAIN_ID);
      });
    });

    it('should have valid Ethereum addresses', function() {
      const networks = constants.getSupportedNetworks();
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      
      networks.forEach(network => {
        const config = constants.getNetworkConfig(network);
        
        assert(addressRegex.test(config.UNIVERSAL_ROUTER), `${network} invalid UNIVERSAL_ROUTER address`);
        assert(addressRegex.test(config.V3_FACTORY), `${network} invalid V3_FACTORY address`);
        assert(addressRegex.test(config.QUOTER_V2), `${network} invalid QUOTER_V2 address`);
        assert(addressRegex.test(config.WETH), `${network} invalid WETH address`);
        
        // V4_FACTORY can be null
        if (config.V4_FACTORY !== null) {
          assert(addressRegex.test(config.V4_FACTORY), `${network} invalid V4_FACTORY address`);
        }
      });
    });
  });

  describe('Network-specific configurations', function() {
    it('should have correct Ethereum mainnet configuration', function() {
      const config = constants.getNetworkConfig('ETHEREUM');
      
      assert.strictEqual(config.CHAIN_ID, 1);
      assert.strictEqual(config.WETH, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      assert.strictEqual(config.V4_FACTORY, null); // V4 not deployed on mainnet yet
    });

    it('should have correct Arbitrum configuration', function() {
      const config = constants.getNetworkConfig('ARBITRUM');
      
      assert.strictEqual(config.CHAIN_ID, 42161);
      assert.strictEqual(config.WETH, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
    });

    it('should have correct Base configuration', function() {
      const config = constants.getNetworkConfig('BASE');
      
      assert.strictEqual(config.CHAIN_ID, 8453);
      // Base uses different factory address
      assert.strictEqual(config.V3_FACTORY, '0x33128a8fC17869897dcE68Ed026d694621f6FDfD');
    });

    it('should have correct Polygon configuration', function() {
      const config = constants.getNetworkConfig('POLYGON');
      
      assert.strictEqual(config.CHAIN_ID, 137);
      // Polygon uses WMATIC instead of WETH
      assert.strictEqual(config.WETH, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270');
    });
  });
});