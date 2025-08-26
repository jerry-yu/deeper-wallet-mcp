const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { serverDescription } = require('./instructions');
const { loadAllDb } = require('./deeperWallet/sqlite3.js');
const to = require('await-to-js').default;
const { getBalance, getContractBalance, getContractMeta, transferToken, transferContractToken,addAccount, importHdStore, } = require('./deeperWallet');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');

const NetworkDescribe =
    "The network to perform the operation on. " +
    "On non-mainnet, set as <MAINNET>-<TESTNET>. " +
    "Example: ETHEREUM-SEPOLIA, POLYGON-MUMBAI.";

async function main() {
    // Parse command line for "-m mnemonic"
    let mnemonic = null;
    let needImportMnemonic = true;
    const mIndex = process.argv.indexOf('-m');
    if (mIndex !== -1 && process.argv[mIndex + 1]) {
        mnemonic = process.argv[mIndex + 1];
    } else {
        // Check for json files in ~/.deeperWallet
        const walletDir = path.join(os.homedir(), '.deeperWallet');
        if (fs.existsSync(walletDir)) {
            const files = fs.readdirSync(walletDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                const filePath = path.join(walletDir, file);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (data.id || data.version) {
                        needImportMnemonic = false;
                        break;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
        if (needImportMnemonic || !mnemonic) {
            const envPath = path.resolve(__dirname, '.env');
            if (fs.existsSync(envPath)) {
                dotenv.config({ path: envPath });
            } else {
                console.warn('.env file not found in current directory');
            }
            mnemonic = process.env.MNEMONIC;
            if (!mnemonic) {
                console.warn('MNEMONIC not found in .env file');
                return;
            }
        }
    }

    if (needImportMnemonic && mnemonic) {
        const res = await importHdStore(mnemonic, '', '', 'deeperWallet', true, 'MNEMONIC');
        if (!res) {
            console.error('Failed to import mnemonic and create wallet file.');
            return;
        }
        console.log(`Mnemonic imported and wallet file created successfully ${JSON.stringify(res)}.`);
        
        const addRes = await addAccount('', ['ETHEREUM', 'SOLANA', 'TRON','BITCOIN']);
        if (!addRes) {
            console.error('Failed to add default account.');
            return;
        }
        console.warn(`Default account added successfully ${JSON.stringify(addRes)}.`);
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
        'transferToken',
        'Transfer tokens from one address to another on a specified blockchain network',
        {
            fromAddress: z.string().describe('The sender address'),
            toAddress: z.string().describe('The recipient address'),
            amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ fromAddress, toAddress, amount, network }) => {
            const [err, result] = await to(
                transferToken('', fromAddress, toAddress, amount, network)
            );
            if (err || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to transfer tokens: ${err.message || err}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Transfer successful : ${JSON.stringify(result)}`,
                    }
                ],
            };
        }
    );

    server.tool(
        'transferContractToken',
        'Transfer contract tokens (e.g., ERC20) from one address to another on a specified blockchain network',
        {
            fromAddress: z.string().describe('The sender address'),
            toAddress: z.string().describe('The recipient address'),
            contract: z.string().describe('The token contract address (ERC20/SPL/etc)'),
            amount: z.string().describe('The amount to transfer (as a string, in the smallest unit)'),
            network: z.string().describe(NetworkDescribe),
        },
        async ({ fromAddress, toAddress, contract, amount, network }) => {
            const [err, result] = await to(
                transferContractToken('', fromAddress, toAddress, contract, amount, network)
            );
            if (err || !result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to transfer contract tokens: ${err && err.message ? err.message : err}`,
                        }
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Contract token transfer successful: ${JSON.stringify(result)}`,
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

    const [err5, transferResult2] = await to(transferContractToken('', '7ZS48GH3ndFJyPBkE7KpCKDBq2jDCrhvQyi2ZnPtDU5i', '9bm8vGK4qwJ1C6DrWhtE6Ext1ueDm9EbhdzXYAsWp939', '5kSfsEoPXv4cgKx4Ct2irz9xF6mWcTo1NLFfKfKs11fu', '1500000000', 'SOLANA-DEVNET'));
    if (err5) {
        console.error('Error transferring contract token:', err5);
        return;
    }
    console.warn(`Transfer Contract Token Result: ${JSON.stringify(transferResult2)}`);

}

main().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});
