const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { serverDescription } = require('./instructions');
const { loadAllDb } = require('./deeperWallet/sqlite3.js');
const to = require('await-to-js').default;
const { deriveAccountList, getBalance, getContractBalance, getContractMeta, transferToken, transferContractToken, addAccount, importHdStore, } = require('./deeperWallet');
const uniswap = require('./deeperWallet/uniswap');
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

    server.tool(
        'swapTokens',
        'Execute a token swap on Uniswap with automatic wallet address detection',
        {
            tokenIn: z.string().describe('Input token contract address (use ETH for native Ethereum)'),
            tokenOut: z.string().describe('Output token contract address (use ETH for native Ethereum)'),
            amountIn: z.string().describe('Input amount in token units (e.g., "1000000" for 1 USDC with 6 decimals)'),
            network: z.string().describe(NetworkDescribe),
            slippageTolerance: z.number().optional().default(0.5).describe('Slippage tolerance percentage (default: 0.5%)'),
            deadline: z.number().optional().describe('Transaction deadline timestamp (default: 30 minutes from now)'),
        },
        async ({ tokenIn, tokenOut, amountIn, network, slippageTolerance, deadline }) => {
            // Get wallet accounts to determine recipient address
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

            // Use the first matching account as recipient
            const recipient = filteredAccounts[0].address;

            // Set default deadline if not provided (30 minutes from now)
            const finalDeadline = deadline || Math.floor(Date.now() / 1000) + 1800;

            const swapParams = {
                tokenIn,
                tokenOut,
                amountIn,
                slippageTolerance,
                deadline: finalDeadline,
                recipient,
                network
            };

            const [err, result] = await to(uniswap.swapTokens(swapParams, ''));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown swap error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Token swap failed: ${errorMsg}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Token swap successful!\n` +
                            `Transaction Hash: ${result.transactionHash}\n` +
                            `Gas Used: ${result.gasUsed || 'N/A'}\n` +
                            `Gas Fee: ${result.gasFee || 'N/A'}\n` +
                            `From: ${recipient}\n` +
                            `Swapped: ${amountIn} ${tokenIn} → ${tokenOut}\n` +
                            `Network: ${network}\n` +
                            `Slippage Tolerance: ${slippageTolerance}%`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getSwapQuote',
        'Get a price quote for a token swap on Uniswap without executing the trade',
        {
            tokenIn: z.string().describe('Input token contract address (use ETH for native Ethereum)'),
            tokenOut: z.string().describe('Output token contract address (use ETH for native Ethereum)'),
            amountIn: z.string().describe('Input amount in token units (e.g., "1000000" for 1 USDC with 6 decimals)'),
            network: z.string().describe(NetworkDescribe),
            slippageTolerance: z.number().optional().default(0.5).describe('Slippage tolerance percentage (default: 0.5%)'),
        },
        async ({ tokenIn, tokenOut, amountIn, network, slippageTolerance }) => {
            const quoteParams = {
                tokenIn,
                tokenOut,
                amountIn,
                network,
                slippageTolerance
            };

            const [err, result] = await to(uniswap.getSwapQuote(quoteParams));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown quote error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get swap quote: ${errorMsg}`,
                        }
                    ],
                };
            }

            const quote = result.quote;
            const priceImpactWarning = quote.priceImpact > 5 ?
                `\n⚠️  HIGH PRICE IMPACT WARNING: ${quote.priceImpact.toFixed(2)}% - Consider smaller trade size` :
                quote.priceImpact > 1 ?
                    `\n⚠️  Moderate price impact: ${quote.priceImpact.toFixed(2)}%` : '';

            return {
                content: [
                    {
                        type: 'text',
                        text: `Swap Quote:\n` +
                            `Input: ${amountIn} ${quote.tokenIn?.symbol || tokenIn}\n` +
                            `Output: ${quote.amountOut} ${quote.tokenOut?.symbol || tokenOut}\n` +
                            `Minimum Output (with slippage): ${quote.amountOutMin}\n` +
                            `Price Impact: ${quote.priceImpact.toFixed(4)}%\n` +
                            `Estimated Gas: ${quote.gasEstimate || 'N/A'}\n` +
                            `Execution Price: ${quote.executionPrice || 'N/A'}\n` +
                            `Network: ${network}\n` +
                            `Slippage Tolerance: ${slippageTolerance || 0.5}%` +
                            priceImpactWarning,
                    }
                ],
            };
        }
    );

    server.tool(
        'getPoolInfo',
        'Get detailed information about a specific Uniswap pool',
        {
            token0: z.string().describe('First token contract address in the pair'),
            token1: z.string().describe('Second token contract address in the pair'),
            fee: z.number().describe('Pool fee tier (e.g., 500 for 0.05%, 3000 for 0.3%, 10000 for 1%)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ token0, token1, fee, network }) => {
            const poolParams = {
                token0,
                token1,
                fee,
                network
            };

            const [err, result] = await to(uniswap.getPoolInfo(poolParams));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown pool info error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get pool information: ${errorMsg}`,
                        }
                    ],
                };
            }

            const pool = result.pool;

            if (!pool.exists) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Pool not found for ${token0}/${token1} with ${fee / 10000}% fee on ${network}`,
                        }
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Pool Information:\n` +
                            `Address: ${pool.address}\n` +
                            `Token 0: ${pool.token0?.symbol || token0} (${pool.token0?.name || 'Unknown'})\n` +
                            `Token 1: ${pool.token1?.symbol || token1} (${pool.token1?.name || 'Unknown'})\n` +
                            `Fee Tier: ${fee / 10000}% (${fee})\n` +
                            `Current Liquidity: ${pool.liquidity || 'N/A'}\n` +
                            `Current Price: ${pool.sqrtPriceX96 || 'N/A'}\n` +
                            `Current Tick: ${pool.tick || 'N/A'}\n` +
                            `24h Volume: ${pool.volume24h || 'N/A'}\n` +
                            `Total Value Locked: ${pool.tvl || 'N/A'}\n` +
                            `Network: ${network}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'getPoolList',
        'Get all available pools for a token pair across different fee tiers',
        {
            token0: z.string().describe('First token contract address in the pair'),
            token1: z.string().describe('Second token contract address in the pair'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ token0, token1, network }) => {
            const poolParams = {
                token0,
                token1,
                network
            };

            const [err, result] = await to(uniswap.getPoolList(poolParams));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown pool list error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get pool list: ${errorMsg}`,
                        }
                    ],
                };
            }

            const poolList = result.pools;

            if (!poolList.pools || poolList.pools.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No pools found for ${token0}/${token1} on ${network}`,
                        }
                    ],
                };
            }

            let poolsText = `Found ${poolList.totalPools} pools for ${token0}/${token1} on ${network}:\n\n`;

            poolList.pools.forEach((pool, index) => {
                poolsText += `Pool ${index + 1}:\n` +
                    `  Address: ${pool.address}\n` +
                    `  Fee Tier: ${pool.fee / 10000}% (${pool.fee})\n` +
                    `  Liquidity: ${pool.liquidity || 'N/A'}\n` +
                    `  24h Volume: ${pool.volume24h || 'N/A'}\n` +
                    `  TVL: ${pool.tvl || 'N/A'}\n\n`;
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: poolsText,
                    }
                ],
            };
        }
    );

    server.tool(
        'getSupportedTokens',
        'Get list of commonly supported tokens for a specific network on Uniswap',
        {
            network: z.string().describe(NetworkDescribe),
        },
        async ({ network }) => {
            const [err, result] = await to(uniswap.getSupportedTokens(network));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown supported tokens error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get supported tokens: ${errorMsg}`,
                        }
                    ],
                };
            }

            const { tokens, count } = result;

            if (!tokens || tokens.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No supported tokens found for network: ${network}`,
                        }
                    ],
                };
            }

            let tokensText = `Found ${count} commonly supported tokens on ${network}:\n\n`;

            tokens.forEach((token, index) => {
                tokensText += `${index + 1}. ${token.symbol} (${token.name})\n` +
                    `   Address: ${token.address}\n` +
                    `   Decimals: ${token.decimals}\n\n`;
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: tokensText,
                    }
                ],
            };
        }
    );

    server.tool(
        'getBestRoute',
        'Find the most optimal trading route for a token swap with detailed analysis',
        {
            tokenIn: z.string().describe('Input token contract address (use ETH for native Ethereum)'),
            tokenOut: z.string().describe('Output token contract address (use ETH for native Ethereum)'),
            amountIn: z.string().describe('Input amount in token units (e.g., "1000000" for 1 USDC with 6 decimals)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ tokenIn, tokenOut, amountIn, network }) => {
            const routeParams = {
                tokenIn,
                tokenOut,
                amountIn,
                network,
                options: {
                    maxHops: 3,
                    maxSplits: 4
                }
            };

            const [err, result] = await to(uniswap.getBestRoute(routeParams));

            if (err || !result.success) {
                const errorMsg = err?.message || result?.error?.message || 'Unknown best route error';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to find best route: ${errorMsg}`,
                        }
                    ],
                };
            }

            const route = result.route;

            return {
                content: [
                    {
                        type: 'text',
                        text: `Best Route Analysis:\n` +
                            `Input: ${amountIn} ${route.tokenIn?.symbol || tokenIn}\n` +
                            `Output: ${route.amountOut} ${route.tokenOut?.symbol || tokenOut}\n` +
                            `Price Impact: ${route.priceImpact?.toFixed(4)}%\n` +
                            `Gas Estimate: ${route.gasEstimate || 'N/A'}\n` +
                            `Route Efficiency: ${route.optimization?.routeEfficiency || 'N/A'}\n` +
                            `Optimization Score: ${route.optimization?.optimizationScore || 'N/A'}\n` +
                            `Quotes Evaluated: ${route.optimization?.quotesEvaluated || 'N/A'}\n` +
                            `Route Path: ${route.path ? route.path.join(' → ') : 'Direct'}\n` +
                            `Network: ${network}\n\n` +
                            `💡 This route has been optimized for the best price with minimal slippage.`,
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

    // const poolParams = {
    //             token0:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    //             token1:'0xdAC17F958D2ee523a2206206994597C13D831ec7',
    //             network:'ETHEREUM'
    //         };

    // const [err9, result] = await to(uniswap.getPoolList(poolParams));
    // if (err9 || !result.success) {
    //     const errorMsg = err9?.message || result?.error?.message || 'Unknown pool list error';
    //     console.error(`Failed to get pool list: ${errorMsg}`);
    //     return;
    // }
    // console.warn(`Pool List Result: ${JSON.stringify(result)}`);

    // const quoteParams = {
    //     tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    //     tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    //     amountIn: '1000000000000000000',
    //     network: 'ETHEREUM',
    //     slippageTolerance: 0.5
    // };

    // const [err10, result] = await to(uniswap.getSwapQuote(quoteParams));

    // if (err10 || !result.success) {
    //     console.error(`Failed to get swap quote: ${err10?.message || result?.error?.message || 'Unknown quote error'}`);
    //     return;
    // }
    // console.warn(`Swap Quote Result: ${JSON.stringify(result)}`);

}

main2().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});
