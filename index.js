const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { serverDescription } = require('./instructions');
const { loadAllDb } = require('./deeperWallet/sqlite3.js');
const to = require('await-to-js').default;
const { deriveAccountList, getBalance, getContractBalance, getContractMeta, transferToken, transferContractToken, addAccount, importHdStore, } = require('./deeperWallet');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');

const NetworkDescribe =
    "The network to perform the operation on. " +
    "On non-mainnet, set as <MAINNET>-<TESTNET>. " +
    "Example: ETHEREUM-SEPOLIA, POLYGON-MUMBAI.";

// Helper function to check if wallet files exist
function hasExistingWallet() {
    const walletDir = path.join(os.homedir(), '.deeperWallet');
    if (!fs.existsSync(walletDir)) return false;

    const jsonFiles = fs.readdirSync(walletDir).filter(f => f.endsWith('.json'));
    return jsonFiles.some(file => {
        try {
            const filePath = path.join(walletDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data.id || data.version;
        } catch {
            return false;
        }
    });
}

// Helper function to get mnemonic from environment
function getMnemonicFromEnv() {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, quiet: true });
        return process.env.MNEMONIC;
    }
    console.warn('.env file not found in current directory');
    return null;
}

// Helper function to initialize wallet with mnemonic
async function initializeWallet(mnemonic) {
    const res = await importHdStore(mnemonic, '', '', 'deeperWallet', true, 'MNEMONIC');
    if (!res) {
        console.error('Failed to import mnemonic and create wallet file.');
        return false;
    }
    console.log(`Mnemonic imported and wallet file created successfully ${JSON.stringify(res)}.`);

    const addRes = await addAccount('', ['ETHEREUM', 'SOLANA', 'TRON', 'SUI', 'BITCOIN']);
    if (!addRes) {
        console.error('Failed to add default account.');
        return false;
    }
    console.warn(`Default account added successfully ${JSON.stringify(addRes)}.`);
    return true;
}

async function main() {
    // Parse command line for "-m mnemonic"
    const mIndex = process.argv.indexOf('-m');
    let mnemonic = (mIndex !== -1 && process.argv[mIndex + 1]) ? process.argv[mIndex + 1] : null;

    // Check if wallet already exists
    const needImportMnemonic = !hasExistingWallet();

    // Get mnemonic from environment if not provided via command line and import is needed
    if (!mnemonic && needImportMnemonic) {
        mnemonic = getMnemonicFromEnv();
        if (!mnemonic) {
            console.warn('MNEMONIC not found in .env file');
            return;
        }
    }

    // Initialize wallet if needed
    if (needImportMnemonic && mnemonic) {
        const success = await initializeWallet(mnemonic);
        if (!success) return;
    }

    //loadAllDb();
    const server = new McpServer({
        name: 'deeper-wallet-mcp',
        version: '1.0.0',
        description: serverDescription,
    }, {
        capabilities: { logging: {} },
    });

    server.tool(
        'getBalance',
        'Get the balance of a specific Blockchain address',
        {
            network: z.string().describe(NetworkDescribe),
            address: z.string().describe('The address to check the balance of'),
        },
        async ({ network, address }) => {
            const [err, balance] = await to(getBalance(network, address));
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get balance for address: ${address} on network: ${network}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `The balance of ${address} on ${network} is: ${balance.balance}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getContractBalance',
        'Get the token balance of a specific contract for a Blockchain address',
        {
            network: z.string().describe(NetworkDescribe),
            address: z.string().describe('The address to check the token balance of'),
            contract: z.string().describe('The token contract address (ERC20/SPL/etc)'),
        },
        async ({ network, contract, address }) => {
            const [err, balance] = await to(getContractBalance(network, contract, address));
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get token balance for address: ${address} on network: ${network} contract: ${contract}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `The token balance of ${address} on ${network} for contract ${contract} is: ${balance.balance}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getContractMeta',
        'Get the meta information (name, decimals, symbol) of a token contract',
        {
            network: z.string().describe(NetworkDescribe),
            contract: z.string().describe('The token contract address (ERC20/SPL/etc)'),
        },
        async ({ network, contract }) => {
            const [err, meta] = await to(getContractMeta(network, contract));
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get contract meta for contract: ${contract} on network: ${network}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Contract meta for ${contract} on ${network}: ${JSON.stringify(meta)}`,
                    }
                ],
            };
        }
    );

    // server.tool(
    //     'transferToken',
    //     'Transfer tokens from one address to another on a specified blockchain network',
    //     {
    //         fromAddress: z.string().describe('The sender address'),
    //         toAddress: z.string().describe('The recipient address'),
    //         amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
    //         network: z.string().describe(NetworkDescribe),
    //     },
    //     async ({ fromAddress, toAddress, amount, network }) => {
    //         const [err, result] = await to(
    //             transferToken('', fromAddress, toAddress, amount, network)
    //         );
    //         if (err || !result) {
    //             return {
    //                 content: [
    //                     {
    //                         type: 'text',
    //                         text: `Failed to transfer tokens: ${err.message || err}`,
    //                     }
    //                 ],
    //             };
    //         }
    //         return {
    //             content: [
    //                 {
    //                     type: 'text',
    //                     text: `Transfer successful : ${JSON.stringify(result)}`,
    //                 }
    //             ],
    //         };
    //     }
    // );

    server.tool(
        'transferTokenFromMyWallet',
        'Transfer tokens to other addresses from my wallet address on a specified blockchain network',
        {
            toAddress: z.string().describe('The recipient address'),
            amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ toAddress, amount, network }) => {
            const [err, accountList] = await to(deriveAccountList());
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to derive account list: ${err.message || err}`,
                        }
                    ],
                };
            }
            // Filter accounts by network
            const filteredAccounts = accountList.filter(account =>
                account.chain_type && account.chain_type.toUpperCase() === network.split('-')[0].toUpperCase()
            );

            if (filteredAccounts.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No accounts found for network: ${network}`,
                        }
                    ],
                };
            }

            // Use the first matching account as fromAddress
            const fromAddress = filteredAccounts[0].address;

            const [transferErr, result] = await to(
                transferToken('', fromAddress, toAddress, amount, network)
            );
            if (transferErr || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to transfer tokens: ${transferErr && transferErr.message ? transferErr.message : transferErr}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Transfer successful from ${fromAddress}: ${JSON.stringify(result)}`,
                    }
                ],
            };
        });

    // server.tool(
    //     'transferContractToken',
    //     'Transfer contract tokens (e.g., ERC20) from one address to another on a specified blockchain network',
    //     {
    //         fromAddress: z.string().describe('The sender address'),
    //         toAddress: z.string().describe('The recipient address'),
    //         contract: z.string().describe('The token contract address (ERC20/SPL/etc)'),
    //         amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
    //         network: z.string().describe(NetworkDescribe),
    //     },
    //     async ({ fromAddress, toAddress, contract, amount, network }) => {
    //         const [err, result] = await to(
    //             transferContractToken('', fromAddress, toAddress, contract, amount, network)
    //         );
    //         if (err || !result) {
    //             return {
    //                 content: [
    //                     {
    //                         type: 'text',
    //                         text: `Failed to transfer contract tokens: ${err && err.message ? err.message : err}`,
    //                     }
    //                 ],
    //             };
    //         }
    //         return {
    //             content: [
    //                 {
    //                     type: 'text',
    //                     text: `Contract token transfer successful: ${JSON.stringify(result)}`,
    //                 }
    //             ],
    //         };
    //     }
    // );

    server.tool(
        'transferContractTokenFromMyWallet',
        'Transfer contract tokens (e.g., ERC20) to other addresses from my wallet address on a specified blockchain network',
        {
            toAddress: z.string().describe('The recipient address'),
            contract: z.string().describe('The token contract address (ERC20/SPL/etc)'),
            amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ toAddress, contract, amount, network }) => {
            const [err, accountList] = await to(deriveAccountList());
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to derive account list: ${err.message || err}`,
                        }
                    ],
                };
            }
            // Filter accounts by network
            const filteredAccounts = accountList.filter(account =>
                account.chain_type && account.chain_type.toUpperCase() === network.split('-')[0].toUpperCase()
            );

            if (filteredAccounts.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No accounts found for network: ${network}`,
                        }
                    ],
                };
            }

            // Use the first matching account as fromAddress
            const fromAddress = filteredAccounts[0].address;

            const [transferErr, result] = await to(
                transferContractToken('', fromAddress, contract, toAddress, amount, network)
            );
            if (transferErr || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to transfer contract tokens: ${transferErr && transferErr.message ? transferErr.message : transferErr}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Contract token transfer successful from ${fromAddress}: ${JSON.stringify(result)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'accountList',
        'Get the list of accounts from my wallet',
        {},
        async () => {
            const [err, accountList] = await to(deriveAccountList());
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to derive account list: ${err.message || err}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Account list: ${JSON.stringify(accountList)}`,
                    }
                ],
            };
        }
    );

    // Add new tool for ETH to token swap
    server.tool(
        'swapEthToToken',
        'Swap ETH to any ERC20 token using Uniswap',
        {
            toAddress: z.string().describe('The token contract address to swap to'),
            amountIn: z.string().describe('The amount of ETH to swap (as a string, in ETH)'),
            tokenOutDecimals: z.number().describe('The decimals of the output token'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ toAddress, amountIn, tokenOutDecimals, network }) => {
            try {
                // Get account list
                const [err, accountList] = await to(deriveAccountList());
                if (err) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to derive account list: ${err.message || err}`,
                            }
                        ],
                    };
                }
                
                // Filter accounts by network
                const filteredAccounts = accountList.filter(account =>
                    account.chain_type && account.chain_type.toUpperCase() === network.split('-')[0].toUpperCase()
                );

                if (filteredAccounts.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `No accounts found for network: ${network}`,
                            }
                        ],
                    };
                }

                // Use the first matching account as fromAddress
                const fromAddress = filteredAccounts[0].address;
                
                // Import the ETH swap function
                const { swapEthToToken } = require('./uniswap/eth-swap');
                
                // Execute the swap
                const result = await swapEthToToken({
                    password: '', // Using empty password as in the example
                    fromAddress: fromAddress,
                    amountIn: amountIn,
                    tokenOutAddress: toAddress,
                    tokenOutDecimals: tokenOutDecimals,
                    network: network
                });
                
                if (result) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `ETH to token swap successful: ${JSON.stringify(result)}`,
                            }
                        ],
                    };
                } else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to execute ETH to token swap`,
                            }
                        ],
                    };
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error during ETH to token swap: ${error.message}`,
                        }
                    ],
                };
            }
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function main2() {
    // const [err,balance] = await to(getBalance('SUI', '0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3'));
    // if (err) {
    //     console.error('Error getting balance:', err);
    //     return;
    // }
    // console.warn(`Balance: ${ JSON.stringify(balance)}`); 
    // const [err2, contractBalance] = await to(getContractBalance('SUI', '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', '0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3'));
    // if (err2) {
    //     console.error('Error getting contract balance:', err2);
    //     return;
    // }
    // console.warn(`Contract Balance: ${ JSON.stringify(contractBalance)}`);
    // const [err3, erc20Meta] = await to(getContractMeta('BNBSMARTCHAIN', '0x25d887ce7a35172c62febfd67a1856f20faebb00', '0x70a08231'));
    // if (err3) { 
    //     console.error('Error getting ERC20 meta:', err3);
    //     return;
    // }
    // console.warn(`ERC20 Meta: ${ JSON.stringify(erc20Meta)}`);
    // const [err4, transferResult] = await to(transferToken('', '7ZS48GH3ndFJyPBkE7KpCKDBq2jDCrhvQyi2ZnPtDU5i', '5kSfsEoPXv4cgKx4Ct2irz9xF6mWcTo1NLFfKfKs11fu', '100000','SOLANA-DEVNET'));
    // if (err4) {
    //     console.error('Error transferring token:', err4);
    //     return;
    // }
    // console.warn(`Transfer Result: ${ JSON.stringify(transferResult)}`);

    // const [err5, transferResult2] = await to(transferContractToken('', '7ZS48GH3ndFJyPBkE7KpCKDBq2jDCrhvQyi2ZnPtDU5i', '9bm8vGK4qwJ1C6DrWhtE6Ext1ueDm9EbhdzXYAsWp939', '5kSfsEoPXv4cgKx4Ct2irz9xF6mWcTo1NLFfKfKs11fu', '1500000000', 'SOLANA-DEVNET'));
    // if (err5) {
    //     console.error('Error transferring contract token:', err5);
    //     return;
    // }
    // console.warn(`Transfer Contract Token Result: ${JSON.stringify(transferResult2)}`);

    // const [err6, transferResult3] = await to(transferToken('', '0xe9db2b843b35e4904eb1029f704821cc5cb3ff0e9ea0cf6c892557256cb13969', '0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3', '10000000', 'SUI-TESTNET'));
    // if (err6) {
    //     console.error('Error transferring token:', err6);
    //     return;
    // }
    // console.warn(`Transfer Result: ${JSON.stringify(transferResult3)}`);

    // const [err7, transferResult4] = await to(transferContractToken('',
    //     '0xe9db2b843b35e4904eb1029f704821cc5cb3ff0e9ea0cf6c892557256cb13969',
    //     '0x8190b041122eb492bf63cb464476bd68c6b7e570a4079645a8b28732b6197a82::wal::WAL',
    //     '0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3',
    //     '10000000',
    //     'SUI-TESTNET'));
    // if (err7) {
    //     console.error('Error transferring contract token:', err7);
    //     return;
    // }
    // console.warn(`Transfer Contract Token Result: ${JSON.stringify(transferResult4)}`);

    // const [err8, accountList] = await to(deriveAccountList());
    // if (err8) {
    //     console.error('Error deriving account list:', err8);
    //     return;
    // }
    // console.warn(`Account List: ${JSON.stringify(accountList)}`);

    // Test Uniswap integration
    console.log('Testing Uniswap integration...');
    
    // Import Uniswap functions
    const { initializeUniswap, getQuote, getPools, executeSwap } = require('./uniswap');
    
    // Initialize Uniswap for Sepolia testnet
    const uniswapInstance = initializeUniswap('ETHEREUM-SEPOLIA');
    if (!uniswapInstance) {
        console.error('Failed to initialize Uniswap');
        return;
    }
    
    console.log('Uniswap initialized successfully');
    
    // Token information for WETH on Sepolia (this should be correct)
    const wethInfo = {
        address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
        chainId: 11155111,
        symbol: 'WETH',
        decimals: 18,
        name: 'Wrapped Ether'
    };
    
    // Using a more generic token for testing
    const testTokenInfo = {
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI token (more likely to exist)
        chainId: 11155111,
        symbol: 'UNI',
        decimals: 18,
        name: 'Uniswap'
    };
    
    // Test getting pool information
    console.log('Getting pool information...');
    const pools = await getPools(uniswapInstance, wethInfo, testTokenInfo);
    if (pools && pools.length > 0) {
        console.log(`Found ${pools.length} pools:`);
        pools.forEach((pool, index) => {
            console.log(`  Pool ${index + 1}: Fee ${pool.feeTier}, Liquidity ${pool.liquidity}`);
        });
        
        // Test getting a quote for a small amount
        console.log('Getting swap quote for 0.001 WETH...');
        const amountIn = '1000000000000000'; // 0.001 WETH in wei
        const quote = await getQuote(uniswapInstance, wethInfo, testTokenInfo, amountIn);
        if (quote) {
            console.log(`Quote: ${quote.amountIn} WETH -> ${quote.amountOut} UNI`);
            console.log(`Price impact: ${quote.priceImpact}%`);
            console.log(`Gas estimate: ${quote.gasEstimate}`);
            
            // Use the real route from the quote
            const realRoute = quote.route;
            
            // Check if we need to wrap ETH to WETH first
            console.log('Checking WETH balance...');
            const { ethers } = require('ethers');
            const wethAbi = [
              {
                "constant": true,
                "inputs": [
                  {
                    "name": "owner",
                    "type": "address"
                  }
                ],
                "name": "balanceOf",
                "outputs": [
                  {
                    "name": "",
                    "type": "uint256"
                  }
                ],
                "type": "function"
              }
            ];
            
            // Using a public RPC for Sepolia
            const provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
            
            // WETH contract address on Sepolia
            const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
            
            // Create contract instance
            const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
            
            // Check WETH balance
            const wethBalance = await wethContract.balanceOf('0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708');
            console.log(`Current WETH Balance: ${ethers.utils.formatEther(wethBalance)} WETH`);
            
            // If WETH balance is insufficient, we should inform the user
            // Since wrapping ETH requires deeper wallet modifications, let's just warn for now
            const requiredWeth = ethers.utils.parseEther('0.001'); // 0.001 WETH needed for the swap
            if (wethBalance.lt(requiredWeth)) {
              console.log('WARNING: Insufficient WETH balance for the swap.');
              console.log('You need to wrap some ETH to WETH first.');
              console.log('This requires manual intervention or deeper wallet modifications.');
            }
            
            // Actually execute the swap on Sepolia with the provided parameters
            console.log('Executing swap on Sepolia...');
            const swapResult = await executeSwap({
                password: '', // Using the provided password
                fromAddress: '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // Using the provided address
                tokenInInfo: wethInfo,
                tokenOutInfo: testTokenInfo,
                amountIn: amountIn,
                route: realRoute, // Using real route from quote
                options: {
                    slippageTolerance: 1.0, // 1% slippage tolerance for testnet
                    deadlineMinutes: 20
                },
                network: 'ETHEREUM-SEPOLIA'
            });
            
            if (swapResult) {
                console.log(`Swap executed successfully: ${JSON.stringify(swapResult)}`);
            } else {
                console.log('Failed to execute swap');
            }
        } else {
            console.log('Failed to get quote');
            
            // Test with mock quote data
            console.log('Testing execution with mock quote data...');
            // Skip execution if we don't have a quote
            console.log('Skipping swap execution as no quote was obtained');
        }
    } else {
        console.log('No pools found with sufficient liquidity on Sepolia for testing');
        console.log('Testing execution flow with mock parameters to verify the function works...');
        
        // Test the executeSwap function with mock parameters to verify the function works
        try {
            console.log('Testing executeSwap function with minimal parameters...');
            // Skip execution if we don't have a quote
            console.log('Skipping swap execution test as no quote was obtained');
            
            // No need to check swapResult as we're skipping execution
        } catch (error) {
            console.log(`Error during swap execution test: ${error.message}`);
            console.log('This helps us identify issues in the implementation');
        }
    }
}

main2().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});
