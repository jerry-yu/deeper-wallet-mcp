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
const uniswap = require('./deeperWallet/uniswap.js');

const NetworkDescribe =
    "The network to perform the operation on. " +
    "On non-mainnet, set as <MAINNET>-<TESTNET>. " +
    "Example: ETHEREUM-SEPOLIA, POLYGON-MUMBAI.";

// Helper function to check if wallet files exist
function hasExistingWallet() {
    const walletDir = path.join(os.homedir(), '.deeperWallet');
    console.warn(`Checking wallet directory: ${walletDir}`);
    if (!fs.existsSync(walletDir)) return false;
    console.warn(`Wallet directory exists: ${walletDir}`);

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
    console.log(`Wallet exists: ${!needImportMnemonic}`);

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

    server.tool(
        'swapTokens',
        'Swap tokens using Uniswap on a specified blockchain network',
        {
            fromAddress: z.string().describe('The sender address'),
            fromToken: z.string().describe('The symbol or address of the token to swap from (e.g., "eth" or ERC20 address)'),
            toToken: z.string().describe('The symbol or address of the token to swap to (e.g., "usdc" or ERC20 address)'),
            amountIn: z.string().describe('The amount to swap (as a string, in the smallest unit)'),
            amoutoutMin: z.string().describe('The minimum amount to receive (as a string, in the smallest unit)').optional().default('0'),
            network: z.string().describe(NetworkDescribe),
            options: z.object({
                version: z.string().optional().describe('Uniswap version, e.g., "V3"'),
            }).optional().describe('Additional swap options'),
        },
        async ({ fromAddress, fromToken, toToken, amountIn, amoutoutMin, network, options }) => {
            const [err, result] = await to(
                uniswap.executeSwap(
                    '', // password, empty string as per pattern
                    fromAddress,
                    fromToken,
                    toToken,
                    amountIn,
                    amoutoutMin,
                    network,
                    options || {}
                )
            );
            if (err || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to execute swap: ${err && err.message ? err.message : err}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Swap executed successfully: ${JSON.stringify(result)}`,
                    }
                ],
            };
        }
    );

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

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function main2() {
    // const [err9, pools] = await to(uniswap.getAllPools('ETHEREUM-SEPOLIA', '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'));
    // if (err9) {
    //     console.error('Error getting all pools:', err9);
    //     return;
    // }
    // console.warn(`All Pools: ${JSON.stringify(pools)}`);

    // const [err10, priceInfo] = await to(uniswap.getTokenPrice('ETHEREUM-SEPOLIA', '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'));
    // if (err10) {
    //     console.error('Error getting token price:', err10);
    //     return;
    // }
    // console.warn(`Token Price Info: ${JSON.stringify(priceInfo)}`);

    const [err11, result] = await to(uniswap.executeSwap(
        '', // password - empty string as per existing pattern
        '0x90dF5A3EDE13Ee1D090573460e13B0BFD8aa9708', // fromAddress
        '0x6727002ad781e0fB768ba11E404965ABA89aFfca',
        "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        
        '100000000000',
        0,
        'ETHEREUM-SEPOLIA',
        {
            version: 'V2',
        }

    ));

    if (err11) {
        console.error('Error executing swap:', err11);
        return;
    }
    console.warn(`Swap Result: ${JSON.stringify(result)}`);
}

async function main5() {
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

}

main2().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});
