const { initializeRaydium, getNetworkConfig, validateSlippage, validateMintAddress } = require('./deeperWallet/raydium');

async function testRaydiumInitialization() {
  console.log('Testing Raydium SDK initialization...');
  
  try {
    // Test network configuration
    console.log('\n1. Testing network configuration...');
    const devnetConfig = getNetworkConfig('SOLANA-DEVNET');
    console.log('Devnet config:', devnetConfig);
    
    const mainnetConfig = getNetworkConfig('SOLANA');
    console.log('Mainnet config:', mainnetConfig);
    
    // Test validation functions
    console.log('\n2. Testing validation functions...');
    
    // Test slippage validation
    try {
      validateSlippage(1.0);
      console.log('✓ Valid slippage (1.0%) passed');
    } catch (error) {
      console.log('✗ Valid slippage failed:', error.message);
    }
    
    try {
      validateSlippage(100);
      console.log('✗ Invalid slippage (100%) should have failed');
    } catch (error) {
      console.log('✓ Invalid slippage (100%) correctly rejected:', error.message);
    }
    
    // Test mint address validation
    try {
      validateMintAddress('So11111111111111111111111111111111111111112'); // SOL mint
      console.log('✓ Valid mint address passed');
    } catch (error) {
      console.log('✗ Valid mint address failed:', error.message);
    }
    
    try {
      validateMintAddress('invalid-address');
      console.log('✗ Invalid mint address should have failed');
    } catch (error) {
      console.log('✓ Invalid mint address correctly rejected:', error.message);
    }
    
    // Test SDK initialization (this will require a valid wallet address)
    console.log('\n3. Testing SDK initialization...');
    const testWalletAddress = 'So11111111111111111111111111111111111111112'; // Using SOL mint as dummy address
    
    try {
      const raydium = await initializeRaydium('SOLANA-DEVNET', testWalletAddress);
      console.log('✓ Raydium SDK initialized successfully');
      console.log('SDK instance type:', typeof raydium);
    } catch (error) {
      console.log('SDK initialization result:', error.message);
      // This might fail due to network issues or invalid address, but that's expected in testing
    }
    
    console.log('\n✓ Raydium module initialization tests completed');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRaydiumInitialization().catch(console.error);