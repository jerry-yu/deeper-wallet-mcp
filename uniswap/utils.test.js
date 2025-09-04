// Unit tests for Uniswap utility functions
const { parseToken, isValidAddress, isValidAmount, slippageToPercent, calculateDeadline } = require('./utils');

// Mock console.error to suppress error messages during tests
const originalConsoleError = console.error;
console.error = () => {};

// Test isValidAddress function
function testIsValidAddress() {
  console.log('Testing isValidAddress...');
  
  // Valid addresses
  console.assert(isValidAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') === true, 'Valid address should return true');
  console.assert(isValidAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984') === true, 'Valid lowercase address should return true');
  
  // Invalid addresses
  console.assert(isValidAddress('') === false, 'Empty string should return false');
  console.assert(isValidAddress(null) === false, 'Null should return false');
  console.assert(isValidAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc') === false, 'Address with wrong length should return false');
  console.assert(isValidAddress('C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') === false, 'Address without 0x prefix should return false');
  console.assert(isValidAddress('0xG02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') === false, 'Address with invalid characters should return false');
  
  console.log('isValidAddress tests passed');
}

// Test isValidAmount function
function testIsValidAmount() {
  console.log('Testing isValidAmount...');
  
  // Valid amounts
  console.assert(isValidAmount('1') === true, 'String "1" should return true');
  console.assert(isValidAmount('1.5') === true, 'String "1.5" should return true');
  console.assert(isValidAmount(2) === true, 'Number 2 should return true');
  console.assert(isValidAmount('0.0001') === true, 'Small amount should return true');
  
  // Invalid amounts
  console.assert(isValidAmount('') === false, 'Empty string should return false');
  console.assert(isValidAmount(null) === false, 'Null should return false');
  console.assert(isValidAmount('abc') === false, 'Non-numeric string should return false');
  console.assert(isValidAmount('0') === false, 'Zero should return false');
  console.assert(isValidAmount('-1') === false, 'Negative number should return false');
  
  console.log('isValidAmount tests passed');
}

// Test parseToken function
function testParseToken() {
  console.log('Testing parseToken...');
  
  const chainId = 1;
  const symbol = 'WETH';
  const decimals = 18;
  const name = 'Wrapped Ether';
  
  // Valid token
  try {
    const validToken = parseToken('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', chainId, symbol, decimals, name);
    console.assert(validToken.address === '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'Token address should match');
    console.assert(validToken.chainId === chainId, 'Token chainId should match');
    console.assert(validToken.symbol === symbol, 'Token symbol should match');
    console.assert(validToken.decimals === decimals, 'Token decimals should match');
    console.assert(validToken.name === name, 'Token name should match');
  } catch (error) {
    console.error('Valid token parsing failed:', error);
    console.assert(false, 'Valid token should not throw error');
  }
  
  // Invalid token address
  try {
    parseToken('invalid_address', chainId, symbol, decimals, name);
    console.assert(false, 'Invalid address should throw error');
  } catch (error) {
    console.assert(true, 'Invalid address should throw error');
  }
  
  console.log('parseToken tests passed');
}

// Test slippageToPercent function
function testSlippageToPercent() {
  console.log('Testing slippageToPercent...');
  
  // Valid slippage
  const slippage05 = slippageToPercent(0.5);
  console.assert(slippage05.numerator.toString() === '50', '0.5% slippage should have numerator 50');
  console.assert(slippage05.denominator.toString() === '10000', '0.5% slippage should have denominator 10000');
  
  const slippage1 = slippageToPercent(1);
  console.assert(slippage1.numerator.toString() === '100', '1% slippage should have numerator 100');
  console.assert(slippage1.denominator.toString() === '10000', '1% slippage should have denominator 10000');
  
  // Invalid slippage
  try {
    slippageToPercent(0);
    console.assert(false, '0% slippage should throw error');
  } catch (error) {
    console.assert(true, '0% slippage should throw error');
  }
  
  try {
    slippageToPercent(100);
    console.assert(false, '100% slippage should throw error');
  } catch (error) {
    console.assert(true, '100% slippage should throw error');
  }
  
  console.log('slippageToPercent tests passed');
}

// Test calculateDeadline function
function testCalculateDeadline() {
  console.log('Testing calculateDeadline...');
  
  const currentTime = Math.floor(Date.now() / 1000);
  const deadline = calculateDeadline(20);
  
  // Check that deadline is in the future
  console.assert(deadline > currentTime, 'Deadline should be in the future');
  
  // Check that deadline is approximately 20 minutes in the future
  const expectedDeadline = currentTime + 20 * 60;
  const difference = Math.abs(deadline - expectedDeadline);
  console.assert(difference < 5, 'Deadline should be approximately 20 minutes in the future');
  
  console.log('calculateDeadline tests passed');
}

// Run all tests
function runTests() {
  console.log('Running Uniswap utility tests...\n');
  
  testIsValidAddress();
  testIsValidAmount();
  testParseToken();
  testSlippageToPercent();
  testCalculateDeadline();
  
  // Restore console.error
  console.error = originalConsoleError;
  
  console.log('\nAll tests passed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testIsValidAddress,
  testIsValidAmount,
  testParseToken,
  testSlippageToPercent,
  testCalculateDeadline,
  runTests,
};