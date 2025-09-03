const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { serverDescription } = require('./instructions');
const { loadAllDb } = require('./deeperWallet/sqlite3.js');
const to = require('await-to-js').default;
const { deriveAccountList, getBalance, getContractBalance, getContractMeta, transferToken, transferContractToken, addAccount, importHdStore, } = require('./deeperWallet');
const {calculateV2Price, getSwapQuote, executeSwap, getPoolInfo, getTokenPrice, getAllPools, isNetworkSupported } = require('./deeperWallet/uniswap');
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

    // Uniswap Tools
    server.tool(
        'getUniswapSwapQuote',
        'Get a swap quote from Uniswap for trading one token for another',
        {
            network: z.string().describe(NetworkDescribe + ' Must be Ethereum-based network with Uniswap support.'),
            tokenIn: z.string().describe('The input token contract address (use "ETH" for native ETH)'),
            tokenOut: z.string().describe('The output token contract address (use "ETH" for native ETH)'),
            amountIn: z.string().describe('The amount of input tokens to swap (in wei/smallest unit)'),
            slippage: z.number().optional().describe('Slippage tolerance percentage (default: 0.5, max: 50)')
        },
        async ({ network, tokenIn, tokenOut, amountIn, slippage = 0.5 }) => {
            // Check if network supports Uniswap
            if (!isNetworkSupported(network)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Network ${network} does not support Uniswap integration`,
                        }
                    ],
                };
            }

            const [err, quote] = await to(getSwapQuote(network, tokenIn, tokenOut, amountIn, slippage));
            if (err || !quote) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get swap quote: ${err?.message || 'Unknown error'}`,
                        }
                    ],
                };
            }

            if (quote.error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Swap quote error: ${quote.message}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Uniswap swap quote:\n${JSON.stringify(quote, null, 2)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'executeUniswapSwap',
        'Execute a token swap on Uniswap using wallet addresses',
        {
            network: z.string().describe(NetworkDescribe + ' Must be Ethereum-based network with Uniswap support.'),
            tokenIn: z.string().describe('The input token contract address (use "ETH" for native ETH)'),
            tokenOut: z.string().describe('The output token contract address (use "ETH" for native ETH)'),
            amountIn: z.string().describe('The amount of input tokens to swap (in wei/smallest unit)'),
            amountOutMin: z.string().describe('The minimum amount of output tokens to receive (in wei/smallest unit)'),
            slippage: z.number().optional().describe('Slippage tolerance percentage (default: 0.5, max: 50)'),
            deadline: z.number().optional().describe('Transaction deadline in minutes from now (default: 20)')
        },
        async ({ network, tokenIn, tokenOut, amountIn, amountOutMin, slippage = 0.5, deadline = 20 }) => {
            // Check if network supports Uniswap
            if (!isNetworkSupported(network)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Network ${network} does not support Uniswap integration`,
                        }
                    ],
                };
            }

            // Get wallet accounts for the network
            const [accountErr, accountList] = await to(deriveAccountList());
            if (accountErr) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to derive account list: ${accountErr.message || accountErr}`,
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

            // Calculate deadline timestamp
            const deadlineTimestamp = Math.floor(Date.now() / 1000) + (deadline * 60);

            const [err, result] = await to(executeSwap(
                '', // password - empty string as per existing pattern
                fromAddress,
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                network,
                {
                    slippage,
                    deadline: deadlineTimestamp
                }
            ));

            if (err || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to execute swap: ${err?.message || 'Unknown error'}`,
                        }
                    ],
                };
            }

            if (result.error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Swap execution error: ${result.message}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Uniswap swap executed successfully from ${fromAddress}:\n${JSON.stringify(result, null, 2)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getUniswapPoolInfo',
        'Get information about a Uniswap liquidity pool for a token pair',
        {
            network: z.string().describe(NetworkDescribe + ' Must be Ethereum-based network with Uniswap support.'),
            tokenA: z.string().describe('First token contract address (use "ETH" for native ETH)'),
            tokenB: z.string().describe('Second token contract address (use "ETH" for native ETH)'),
            feeLevel: z.string().optional().describe('Fee level for V3 pools: "LOW" (0.05%), "MEDIUM" (0.3%), "HIGH" (1%)')
        },
        async ({ network, tokenA, tokenB, feeLevel }) => {
            // Check if network supports Uniswap
            if (!isNetworkSupported(network)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Network ${network} does not support Uniswap integration`,
                        }
                    ],
                };
            }

            const [err, poolInfo] = await to(getPoolInfo(network, tokenA, tokenB, feeLevel));
            if (err || !poolInfo) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get pool info: ${err?.message || 'Unknown error'}`,
                        }
                    ],
                };
            }

            if (poolInfo.error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Pool info error: ${poolInfo.message}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Uniswap pool information:\n${JSON.stringify(poolInfo, null, 2)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getUniswapTokenPrice',
        'Get the current price of a token from Uniswap pools',
        {
            network: z.string().describe(NetworkDescribe + ' Must be Ethereum-based network with Uniswap support.'),
            tokenAddress: z.string().describe('Token contract address to get price for (use "ETH" for native ETH)'),
            baseToken: z.string().optional().describe('Base token for price quote (default: USDC, use "ETH" for ETH price)')
        },
        async ({ network, tokenAddress, baseToken }) => {
            // Check if network supports Uniswap
            if (!isNetworkSupported(network)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Network ${network} does not support Uniswap integration`,
                        }
                    ],
                };
            }

            const [err, priceInfo] = await to(getTokenPrice(network, tokenAddress, baseToken));
            if (err || !priceInfo) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get token price: ${err?.message || 'Unknown error'}`,
                        }
                    ],
                };
            }

            if (priceInfo.error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Token price error: ${priceInfo.message}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Token price information:\n${JSON.stringify(priceInfo, null, 2)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getAllUniswapPools',
        'Get all available Uniswap pools (V2 and V3) for a token pair',
        {
            network: z.string().describe(NetworkDescribe + ' Must be Ethereum-based network with Uniswap support.'),
            tokenA: z.string().describe('First token contract address (use "ETH" for native ETH)'),
            tokenB: z.string().describe('Second token contract address (use "ETH" for native ETH)')
        },
        async ({ network, tokenA, tokenB }) => {
            // Check if network supports Uniswap
            if (!isNetworkSupported(network)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Network ${network} does not support Uniswap integration`,
                        }
                    ],
                };
            }

            const [err, pools] = await to(getAllPools(network, tokenA, tokenB));
            if (err || !pools) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get pools: ${err?.message || 'Unknown error'}`,
                        }
                    ],
                };
            }

            if (pools.error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Get pools error: ${pools.message}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `All Uniswap pools for token pair:\n${JSON.stringify(pools, null, 2)}`,
                    }
                ],
            };
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

    // const [err9, pools] = await to(getAllPools('ETHEREUM-SEPOLIA', '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'));
    // if (err9) {
    //     console.error('Error getting all pools:', err9);
    //     return;
    // }
    // console.warn(`All Pools: ${JSON.stringify(pools)}`);

    

    //0x2260fac5e5542a773aa44fbcfedf7c193bc2c599
    // const [err10, priceInfo] = await to(getTokenPrice('ETHEREUM', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xdAC17F958D2ee523a2206206994597C13D831ec7'));
    // if (err10) {
    //     console.error('Error getting token price:', err10);
    //     return;
    // }
    // console.warn(`Token Price Info: ${JSON.stringify(priceInfo)}`);

    const [err11, result] = await to(executeSwap(
                '', // password - empty string as per existing pattern
                '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // fromAddress
                "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
                '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
                '10000000000000000',
                2,
                'ETHEREUM-SEPOLIA',
                {
                    version: 'V3',
                }
               
            ));
            
    if (err11) {
        console.error('Error executing swap:', err11);
        return;
    }
    console.warn(`Swap Result: ${JSON.stringify(result)}`);


}

main2().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});
