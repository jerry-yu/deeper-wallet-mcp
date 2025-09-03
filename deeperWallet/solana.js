const { Connection, PublicKey, Transaction, sendAndConfirmRawTransaction, SystemProgram } = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  transfer,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const to = require('await-to-js').default;
const logger = require('./log');

const METAPLEX_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

const rpcUrls = {
  'SOLANA': 'https://api.mainnet-beta.solana.com',
  'SOLANA-TESTNET': 'https://api.testnet.solana.com',
  'SOLANA-DEVNET': 'https://api.devnet.solana.com',
};

function getRpcUrl(network) {
  const url = rpcUrls[network];
  return url ? url : 'https://mainnet.helius-rpc.com/?api-key=cdf696d9-6af1-4b7d-a0bd-1e63b3701559';
}

function decodeMetaplexMetadata(data) {
  const buffer = Buffer.from(data);

  //skip key,updateAuthority,mint
  let offset = 1 + 32 + 32;
  const nameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const name = buffer
    .subarray(offset, offset + nameLength)
    .toString('utf-8')
    .replace(/\0/g, '');
  offset += nameLength;

  const symbolLength = buffer.readUInt32LE(offset);
  offset += 4;
  const symbol = buffer
    .subarray(offset, offset + symbolLength)
    .toString('utf-8')
    .replace(/\0/g, '');
  offset += symbolLength;

  return {
    name: name.trim(),
    symbol: symbol.trim(),
  };
}

// Function to get Solana balance
async function getSolBalance(network, address) {
  const url = getRpcUrl(network);
  const connection = new Connection(url);

  const publicKey = new PublicKey(address);
  console.warn('publicKey:', publicKey);
  console.warn('connection   :', connection.rpcEndpoint);
  const [error, balance] = await to(connection.getBalance(publicKey));
  if (error) {
    console.warn('Error getting balance:', error);
    return { balance: 0 };
  }
  return { balance: balance };
}

// Function to get SPL token balance
async function getSplTokenBalance(network,tokenMintAddress, address ) {
  const url = getRpcUrl(network);
  const connection = new Connection(url);
  const publicKey = new PublicKey(address);
  const mint = new PublicKey(tokenMintAddress);
  const tokenAccount = await getAssociatedTokenAddress(mint, publicKey);
  const [error, account] = await to(getAccount(connection, tokenAccount));
  if (error) {
    console.error(`Error getting account: ${error}`);
    return { balance: 0 };
  }
  console.error(`-- getting account: ${account.address} ${account.amount}`);
  return { balance: account.amount.toString() };
}

// Function to get token Metaplex info
async function getTokenMetaplexInfo(network, tokenMintAddress) {
  const url = getRpcUrl(network);
  const connection = new Connection(url);
  const pid = new PublicKey(METAPLEX_METADATA_PROGRAM_ID);
  const mintPublicKey = new PublicKey(tokenMintAddress);

  const [metadataAddress, _seed] = await PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), pid.toBuffer(), mintPublicKey.toBuffer()],
    pid
  );
  console.warn('------------ ', metadataAddress);
  const [error, accountInfo] = await to(connection.getAccountInfo(metadataAddress));
  if (error) {
    console.error(`Metadata account not found! ${error}`);
    return null;
  }
  const data = accountInfo.data;
  let metadata = decodeMetaplexMetadata(data);

  const [err, mintAccountInfo] = await to(connection.getParsedAccountInfo(mintPublicKey));
  if (err) {
    console.error(`Error getting mint account info: ${err}`);
    return metadata;
  }
  if (mintAccountInfo && mintAccountInfo.value) {
    metadata.decimals = mintAccountInfo.value.data.parsed.info.decimals;
  }
  return metadata;
}

// Function to send raw transaction
async function sendRawTransaction(network, rawTransaction) {
  const url = getRpcUrl(network);
  const connection = new Connection(url);
  const [error, signature] = await to(sendAndConfirmRawTransaction(connection, rawTransaction));
  if (error) {
    console.error(`Error sending raw transaction: ${error}`);
    return null;
  }
  return signature;
}

async function getTransferSolMessage(network, sender, receiver, amount) {
  const url = getRpcUrl(network);
  const connection = new Connection(url);
  console.warn('getTransferSolMessage:', url, sender, receiver, amount);
  const [error, blockhash] = await to(connection.getLatestBlockhash());
  if (error) {
    console.error(`Error getting blockhash: ${error}`);
    return null;
  }
  const fromPubkey = new PublicKey(sender);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: new PublicKey(receiver),
      lamports: amount,
    })
  );
  transaction.recentBlockhash = blockhash.blockhash;
  transaction.feePayer = fromPubkey;
  console.warn('transaction:', transaction);
  return transaction;
}

async function getTransferSplMessage(network, fromAddress, toAddress, amount, mintAddress) {
  console.warn(`getTransferSplMessage, ${mintAddress} ${fromAddress} ${toAddress} ${amount}`);
  const url = getRpcUrl(network);
  const connection = new Connection(url);
  const mint = new PublicKey(mintAddress);
  const fromPublicKey = new PublicKey(fromAddress);
  const toPublicKey = new PublicKey(toAddress);

  const fromTokenAccount = await getAssociatedTokenAddress(mint, fromPublicKey);
  const toTokenAccount = await getAssociatedTokenAddress(mint, toPublicKey);

  const [error, accountInfo] = await to(connection.getAccountInfo(toTokenAccount));
  if (error) {
    console.error(`Error getting account info: ${error}`);
    return null;
  }
  const instructions = [];

  if (!accountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        fromPublicKey, // Fee Payer
        toTokenAccount, // Associated Token Account
        toPublicKey, // Owner
        mint // Mint Address
      )
    );
  }

  instructions.push(
    createTransferInstruction(fromTokenAccount, toTokenAccount, fromPublicKey, amount, [], TOKEN_PROGRAM_ID)
  );

  const transaction = new Transaction().add(...instructions);

  const [err, latestBlockhash] = await to(connection.getLatestBlockhash());
  if (err) {
    console.error(`Error getting latest blockhash: ${err}`);
    return null;
  }
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.feePayer = fromPublicKey;

  return transaction;
}

module.exports = {
  getSolBalance,
  getSplTokenBalance,
  getTokenMetaplexInfo,
  sendRawTransaction,
  getTransferSolMessage,
  getTransferSplMessage,
};
