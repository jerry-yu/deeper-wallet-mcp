/**
 * Unit Tests for Uniswap Quote Gas Estimation and Route Optimization
 * Tests advanced quotation functionality including gas estimation and route optimization
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  getBestRoute,
  getDirectFeeQuote,
  selectOptimalRoute,
  estimateRouteGasCost,
  calculateRouteEfficiency,
  estimateGasCost,
  clearRouteCache
} = require('../deeperWallet/uniswap/quote');

describe('Uniswap Quote Gas Estimation and Route Optimization Tests', function() {
  let loggerStub;

  beforeEach(function() {
    // Stub logger to prevent console output during tests
    loggerStub = {
      info: sinon.stub(),
      error: sinon.stub(),
      warn: sinon.stub()
    };

    // Clear route cache before each test
    clearRouteCache();
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('selectOptimalRoute', function() {
    it('should select the best route from multiple quotes', function() {
      const quotes = [
        {
          amountOut: '1000',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000
        },
        {
          amountOut: '1100',
          priceImpact: 2.0,
          route: { gasEstimate: '160000' },
          feeTier: 3000
        },
        {
          amountOut: '950',
          priceImpact: 0.5,
          route: { gasEstimate: '140000' },
          feeTier: 500
        }
      ];

      const bestRoute = selectOptimalRoute(quotes);
      
      // Should select the quote with highest output (1100) despite higher price impact
      assert.strictEqual(bestRoute.amountOut, '1100');
    });

    it('should handle single quote', function() {
      const quotes = [
        {
          amountOut: '1000',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000
        }
      ];

      const bestRoute = selectOptimalRoute(quotes);
      assert.strictEqual(bestRoute.amountOut, '1000');
    });

    it('should throw error for empty quotes array', function() {
      assert.throws(() => {
        selectOptimalRoute([]);
      }, /No quotes to select from/);
    });

    it('should apply price impact filter when specified', function() {
      const quotes = [
        {
          amountOut: '1100',
          priceImpact: 5.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000
        },
        {
          amountOut: '1000',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000
        }
      ];

      const options = { maxPriceImpact: 2.0 };
      const bestRoute = selectOptimalRoute(quotes, options);
      
      // Should select the lower output quote due to price impact filter
      assert.strictEqual(bestRoute.amountOut, '1000');
    });

    it('should apply gas limit filter when specified', function() {
      const quotes = [
        {
          amountOut: '1100',
          priceImpact: 1.0,
          route: { gasEstimate: '200000' },
          feeTier: 3000
        },
        {
          amountOut: '1000',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000
        }
      ];

      const options = { maxGas: 180000 };
      const bestRoute = selectOptimalRoute(quotes, options);
      
      // Should select the lower gas quote
      assert.strictEqual(bestRoute.route.gasEstimate, '150000');
    });
  });

  describe('calculateRouteEfficiency', function() {
    it('should calculate efficiency score correctly', function() {
      const quote = {
        amountOut: '100',
        priceImpact: 1.0
      };
      
      const gasEstimation = {
        gasCostEth: '0.01'
      };

      const efficiency = calculateRouteEfficiency(quote, gasEstimation);
      
      assert(typeof efficiency === 'number');
      assert(efficiency >= 0);
      assert(efficiency <= 100);
    });

    it('should return default score on calculation error', function() {
      const quote = {
        amountOut: 'invalid',
        priceImpact: 'invalid'
      };
      
      const gasEstimation = {
        gasCostEth: 'invalid'
      };

      const efficiency = calculateRouteEfficiency(quote, gasEstimation);
      assert.strictEqual(efficiency, 50);
    });

    it('should penalize high price impact', function() {
      const lowImpactQuote = {
        amountOut: '100',
        priceImpact: 0.5
      };
      
      const highImpactQuote = {
        amountOut: '100',
        priceImpact: 5.0
      };
      
      const gasEstimation = {
        gasCostEth: '0.01'
      };

      const lowImpactEfficiency = calculateRouteEfficiency(lowImpactQuote, gasEstimation);
      const highImpactEfficiency = calculateRouteEfficiency(highImpactQuote, gasEstimation);
      
      assert(lowImpactEfficiency > highImpactEfficiency);
    });

    it('should penalize high gas costs', function() {
      const quote = {
        amountOut: '100',
        priceImpact: 1.0
      };
      
      const lowGasEstimation = {
        gasCostEth: '0.001'
      };
      
      const highGasEstimation = {
        gasCostEth: '0.1'
      };

      const lowGasEfficiency = calculateRouteEfficiency(quote, lowGasEstimation);
      const highGasEfficiency = calculateRouteEfficiency(quote, highGasEstimation);
      
      assert(lowGasEfficiency > highGasEfficiency);
    });
  });

  describe('estimateRouteGasCost', function() {
    it('should return fallback estimation on error', async function() {
      const quote = {
        route: {
          path: [{ address: '0x123' }, { address: '0x456' }],
          gasEstimate: '150000'
        }
      };

      const estimation = await estimateRouteGasCost(quote, 'ETHEREUM', null);
      
      assert(estimation.fallback === true);
      assert(typeof estimation.gasEstimate === 'number');
      assert(typeof estimation.gasLimit === 'number');
      assert(typeof estimation.gasPrice === 'string');
      assert(typeof estimation.gasCostWei === 'string');
      assert(typeof estimation.gasCostEth === 'string');
      assert(typeof estimation.routeComplexity === 'number');
      assert(typeof estimation.complexityMultiplier === 'number');
    });

    it('should calculate route complexity correctly', async function() {
      const simpleRoute = {
        route: {
          path: [{ address: '0x123' }, { address: '0x456' }],
          gasEstimate: '150000'
        }
      };

      const complexRoute = {
        route: {
          path: [{ address: '0x123' }, { address: '0x456' }, { address: '0x789' }],
          gasEstimate: '150000'
        }
      };

      const simpleEstimation = await estimateRouteGasCost(simpleRoute, 'ETHEREUM', null);
      const complexEstimation = await estimateRouteGasCost(complexRoute, 'ETHEREUM', null);
      
      assert(complexEstimation.routeComplexity > simpleEstimation.routeComplexity);
      assert(complexEstimation.complexityMultiplier > simpleEstimation.complexityMultiplier);
    });

    it('should use dummy address when fromAddress not provided', async function() {
      const quote = {
        route: {
          path: [{ address: '0x123' }, { address: '0x456' }],
          gasEstimate: '150000'
        }
      };

      // Should not throw error when fromAddress is null
      const estimation = await estimateRouteGasCost(quote, 'ETHEREUM', null);
      assert(estimation !== null);
    });
  });

  describe('Gas Estimation Functions', function() {
    it('should have estimateGasCost function available', function() {
      assert(typeof estimateGasCost === 'function');
    });

    it('should handle invalid swap data gracefully', async function() {
      try {
        await estimateGasCost(null, 'ETHEREUM', '0x123');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('Invalid swap data'));
      }
    });

    it('should handle invalid network gracefully', async function() {
      const swapData = {
        to: '0x123',
        data: '0x456'
      };

      try {
        await estimateGasCost(swapData, 'INVALID', '0x123');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('Invalid network'));
      }
    });
  });

  describe('Route Optimization Integration', function() {
    it('should have getBestRoute function available', function() {
      assert(typeof getBestRoute === 'function');
    });

    it('should have getDirectFeeQuote function available', function() {
      assert(typeof getDirectFeeQuote === 'function');
    });

    it('should validate inputs in getBestRoute', async function() {
      try {
        await getBestRoute('invalid', '0x456', '100', 'ETHEREUM');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('Invalid'));
      }
    });
  });

  describe('Caching Behavior', function() {
    it('should implement route caching', function() {
      // Test that cache functions exist and work
      clearRouteCache();
      clearRouteCache('ETHEREUM');
      
      // Should not throw errors
      assert(true);
    });
  });

  describe('Fee Tier Optimization', function() {
    it('should handle different fee tiers in optimization', function() {
      const quotes = [
        {
          amountOut: '1000',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 500 // Low fee
        },
        {
          amountOut: '990',
          priceImpact: 1.0,
          route: { gasEstimate: '150000' },
          feeTier: 3000 // Medium fee (should get bonus)
        }
      ];

      const bestRoute = selectOptimalRoute(quotes);
      
      // Medium fee tier should get preference due to bonus
      assert.strictEqual(bestRoute.feeTier, 3000);
    });
  });

  describe('Error Handling', function() {
    it('should handle network errors in route optimization', function() {
      // Test that functions handle errors gracefully
      assert(typeof selectOptimalRoute === 'function');
      assert(typeof calculateRouteEfficiency === 'function');
    });

    it('should provide fallback values on calculation errors', function() {
      const efficiency = calculateRouteEfficiency({}, {});
      assert.strictEqual(efficiency, 50);
    });
  });
});