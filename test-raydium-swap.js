const { raydiumSwap } = require('./deeperWallet/solana');

async function main() {
  // 在 Solana devnet 上测试 Raydium swap
  // 注意：这需要您有一个在 devnet 上有资金的账户
  // 并且需要设置适当的环境变量或配置来获取私钥
  
  const fromAddress = 'YOUR_WALLET_ADDRESS'; // 替换为您的钱包地址
  const inputMint = 'So11111111111111111111111111111111111111112'; // SOL mint address on devnet
  const outputMint = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'; // WSOL mint address on devnet (just an example)
  const amountIn = '1000000000'; // 1 SOL (假设精度为 9)
  const slippage = 0.5; // 0.5% 滑点
  const network = 'SOLANA-DEVNET';
  const password = ''; // 根据您的实现可能需要密码
  
  console.log('Testing Raydium swap on Solana devnet...');
  console.log(`From address: ${fromAddress}`);
  console.log(`Input token: ${inputMint}`);
  console.log(`Output token: ${outputMint}`);
  console.log(`Amount in: ${amountIn}`);
  console.log(`Slippage: ${slippage}%`);
  console.log(`Network: ${network}`);
  
  try {
    const result = await raydiumSwap(password, fromAddress, inputMint, outputMint, amountIn, slippage, network);
    console.log('Swap result:', result);
  } catch (error) {
    console.error('Error during swap:', error);
  }
}

main().catch(console.error);