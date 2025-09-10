const NodeCache = require('node-cache');
const axios = require('axios');
const to = require('await-to-js').default;
const web3 = require('@solana/web3.js');
const { existsSync } = require('fs');
const { writeFile, rm } = require('fs/promises');

const logger = require('./log');
const commonUtil = require('./utils');
const db = require('./db');
//const cryptoUtil = require('../../../common-js/cryptoUtil');
//const utils = require('../utils');
const eth = require('./eth');
const sol = require('./solana');
const tron = require('./tron');
const sui = require('./sui');
const uniswap = require('./uniswap');
exports.uniswap = uniswap;

const { TokenInvalidInstructionTypeError } = require('@solana/spl-token');

const PROXY_SERVER_ENDPOINT = 'https://proxy-wallet.deepernetworks.org';
//const PROXY_SERVER_ENDPOINT = 'http://192.168.3.55:8080';
const PROXY_REQUEST_TIMEOUT = 1000 * 20; // 20s
const TOKEN_PRICE_TTL = 30; // 30s
const EXCHANGE_RATE_TTL = 3600; // 1h
const DEEPER_WALLET_BIN_PATH = 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';
const GAS_PRICE_MULTIPLIER = 1.1;

const KEYSTORE_PATH = '/var/deeper/deeperWallet';
const BACKUP_FLAG_FILE_PATH = `${KEYSTORE_PATH}/backup`;
const KEYSTORE_FILE = `${KEYSTORE_PATH}/keystore`;

const networkMap = new Map([
  ['BASE', 'ETHEREUM'],
  ['ARBITRUM', 'ETHEREUM'],
  ['OPTIMISM', 'ETHEREUM'],
  ['AVALANCHE', 'ETHEREUM'],
  ['POLYGON', 'ETHEREUM'],
  ['BNBSMARTCHAIN', 'ETHEREUM'],
]);

const tokenPriceCache = new NodeCache();
const exchangeRates = new NodeCache();
const decimalsCache = new NodeCache();

function getCurve(network) {
  if (network.startsWith('SUI')) {
    return 'ED25519';
  }
  return '';
}

//For derive address
function getNetwork(network) {
  switch (true) {
    case network === 'ETHEREUM':
    case network === 'BITCOIN':
    case network.startsWith('SOLANA'):
    case network.startsWith('TRON'):
    case network.startsWith('SUI'):
      return 'MAINNET';
    case network === 'ETHEREUM-SEPOLIA':
      return 'SEPOLIA';
    case network === 'ETHEREUM-HOLESKY':
      return 'HOLESKY';
    case network === 'POLYGON-MUMBAI':
      return 'MUMBAI';
    case network === 'BITCOIN-TESTNET':
      return 'TESTNET';
    default:
      return network;
  }
}

function getCoin(network) {
  const baseNetwork = network.split('-')[0];

  return networkMap.get(baseNetwork) || baseNetwork;
}

function getDerivePath(coin, path) {
  switch (coin) {
    case 'SOLANA':
      return "m/44'/501'/" + path + "'/0'";
    case 'BITCOIN':
      return "m/84'/0'/0'/0/" + path;
    case 'TRON':
      return "m/44'/195'/0'/0/" + path;
    case 'SUI':
      return "m/44'/784'/0'/0'/" + path + "'";
    default:
      return "m/44'/60'/0'/0/" + path;
  }
}

// function getKeystoreParams() {
//   const key = _0xfwgq2a.getKeystoreKey();
//   if (!key) {
//     return null;
//   }

//   return JSON.stringify({ path: KEYSTORE_FILE, key: key.b, iv: key.c });
// }

// function getSignature() {
//   const passphrase = _0xfwgq2a.getDeeperWalletPassphrase();
//   const privateKey = _0xfwgq2a.getDeeperWalletPrivateKey();
//   if (!passphrase || !privateKey) {
//     return {};
//   }

//   const ts = Date.now();
//   const sig = cryptoUtil.privateSign(`${ts}`, { passphrase, privateKey: cryptoUtil._0xnf3qrw(privateKey) });
//   if (!sig) {
//     return {};
//   }

//   return { ts, sig };
// }

function axiosGet(path) {
  return axios.get(`${PROXY_SERVER_ENDPOINT}/${path}`, { timeout: PROXY_REQUEST_TIMEOUT });
}

function axiosPost(path, data) {
  return axios.post(`${PROXY_SERVER_ENDPOINT}/${path}`, data, { timeout: PROXY_REQUEST_TIMEOUT });
}

exports.KEYSTORE_FILE = KEYSTORE_FILE;

exports.getBalance = async (network, address) => {
  network = network.toUpperCase();
  if (network.startsWith('ETHEREUM')) {
    const res = await eth.getEthBalance(network, address);
    return res ? res : null;
  } else if (network.startsWith('SOLANA')) {
    const res = await sol.getSolBalance(network, address);
    return res ? res : null;
  } else if (network.startsWith('TRON')) {
    const res = await tron.getTronBalance(network, address);
    return res ? res : null;
  } else if (network.startsWith('SUI')) {
    const res = await sui.getSuiBalance(network, address);
    return res ? res : null;
  }


  const [error, response] = await to(axiosGet(`get_btc_balance/${address}/${network}`));
  if (error) {
    console.error(`Failed to get balance: ${error}`);
    return null;
  }
  return response.data;
};

exports.getDecimals = (address, network, contractAddress) => {
  return decimalsCache.get(network + address + contractAddress);
};

exports.getContractBalance = async (network, contractAddress, address) => {
  if (network.startsWith('ETHEREUM') || network.startsWith('BNBSMARTCHAIN') || network.startsWith('BASE') ||
    network.startsWith('ARBITRUM') || network.startsWith('OPTIMISM') ||
    network.startsWith('AVALANCHE') || network.startsWith('POLYGON')) {
    const res = await eth.getErc20Balance(network, contractAddress, address);
    return res ? res : null;
  } else if (network.startsWith('SOLANA')) {
    const res = await sol.getSplTokenBalance(network, contractAddress, address);
    return res ? res : null;
  } else if (network.startsWith('TRON')) {
    const res = await tron.getTronTokenBalance(network, contractAddress, address);
    return res ? res : null;
  } else if (network.startsWith('SUI')) {
    const res = await sui.getTokenBalance(network, contractAddress, address);
    return res ? res : null;
  }
};

exports.getPrice = async tokenName => {
  if (tokenPriceCache.has(tokenName)) {
    return tokenPriceCache.get(tokenName);
  }

  const [error, response] = await to(axiosGet(`get_token_price/${tokenName}`));
  if (error) {
    console.error(`Failed to get ${tokenName} price: ${error}`);
    return null;
  }

  tokenPriceCache.set(tokenName, response.data, TOKEN_PRICE_TTL);
  return response.data;
};

exports.getExchangeRate = async currency => {
  if (exchangeRates.has(currency)) {
    return exchangeRates.get(currency);
  }

  const [error, response] = await to(axiosGet(`get_currency_rate/${currency}`));
  if (error) {
    console.error(`Failed to exchange rate: ${error}`);
    return null;
  }

  exchangeRates.set(currency, response.data, EXCHANGE_RATE_TTL);
  return response.data;
};

exports.isBackupNeeded = () => {
  return !existsSync(BACKUP_FLAG_FILE_PATH);
};

exports.markBackupDone = async () => {
  if (existsSync(BACKUP_FLAG_FILE_PATH)) {
    return true;
  }

  const [err] = await to(writeFile(BACKUP_FLAG_FILE_PATH, ''));
  if (err) {
    console.error(`Failed to create file ${BACKUP_FLAG_FILE_PATH}: ${err}`);
    return false;
  }

  return true;
};

exports.createHdStore = async (password, passwordHint, name) => {
  const payload = {
    method: 'hd_store_create',
    param: {
      password: password,
      password_hint: passwordHint,
      name: name,
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to create HD store: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [error1, stdout1] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (error1) {
    console.error(`Failed to create HD store`);
    return null;
  }

  const [error2, obj] = await to(commonUtil.jsonParse(stdout1));
  if (error2 || !obj?.hash) {
    console.error(`Invalid hd_store_create output: ${stdout1}`);
    return null;
  }

  await setNameSource(name, 0, obj.hash);
  return obj;
};

exports.importHdStore = async (mnemonic, password, passwordHint, name, overwrite, source) => {
  // Prepare the payload to be processed by the hardware wallet
  const payload = {
    method: 'hd_store_import',
    param: {
      mnemonic: mnemonic,
      password: password,
      password_hint: passwordHint,
      name: name,
      overwrite: overwrite,
      source: source,
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to import HD store: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [error1, stdout1] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (error1) {
    console.error(`Failed to import HD store`);
    return null;
  }

  const [error2, obj1] = await to(commonUtil.jsonParse(stdout1));
  if (error2 || !obj1?.id) {
    console.error(`Invalid hd_store_import output: ${stdout1}`);
    return null;
  }
  //await setNameSource(name, 1, obj1.hash);
  return obj1;
};

// exports.importKeyStore = async (content, name) => {
//   const key = _0xfwgq2a.getKeystoreKey();
//   if (!key) {
//     console.error(`Failed to import keystore: key missing`);
//     return false;
//   }

//   const [err, obj] = await to(commonUtil.jsonParse(content));
//   if (err || !obj?.keyHash) {
//     console.error(`Failed to parse keystore`);
//     return false;
//   }

//   const [err2, encrypted] = await to(cryptoUtil.encrypt(key.a, key.b, key.c, content));
//   if (err2) {
//     console.error(`Failed to encrypt keystore: ${err2}`);
//     return false;
//   }

//   const [writeErr] = await to(writeFile(KEYSTORE_FILE, Buffer.from(encrypted, 'hex')));
//   if (writeErr) {
//     console.error(`Failed to write keystore file ${KEYSTORE_FILE}: ${writeErr}`);
//     return false;
//   }

//   await setNameSource(name, 2, obj.keyHash);
//   return true;
// };

exports.exportMnemonic = async password => {
  const payload = {
    method: 'export_mnemonic',
    param: {
      password: password,
    },
  };
  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to export mnemonic: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [error1, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (error1) {
    console.error(`Failed to export mnemonic`);
    return null;
  }

  const [error2, obj] = await to(commonUtil.jsonParse(stdout));
  if (error2) {
    console.error(`Invalid exportMnemonic output: ${stdout}`);
    return null;
  }

  const mnemonic = "";// await utils.encryptByChunk(obj.value, _0xfwgq2a.getFeEncKey(), 22, 'mnemonic');
  if (!mnemonic) {
    return null;
  }
  obj.value = mnemonic;
  return obj;
};

exports.exportKeystore = async () => {
  const payload = { method: 'export_keystore', param: {} };
  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to export mnemonic: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [error1, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (error1) {
    console.error(`Failed to export mnemonic`);
    return null;
  }

  return stdout;
};



exports.renameAccount = async (index, newName) => {
  const success = await db.renameAccount(index, newName);
  if (!success) {
    console.error(`Failed to rename account`);
  }
  return success;
};

exports.exportPrivateKey = async (password, network, address) => {
  const chainType = getCoin(network);
  const payload = {
    method: 'export_private_key',
    param: {
      password: password,
      chain_type: chainType,
      network: '',
      main_address: address,
      path: '',
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to export private key: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [error1, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (error1) {
    console.error(`Failed to export private key`);
    return null;
  }

  const [error2, obj] = await to(commonUtil.jsonParse(stdout));
  if (error2) {
    console.error(`Invalid export_private_key output: ${stdout}`);
    return null;
  }

  const privateKey = "";//await utils.encryptByChunk(obj.value, _0xfwgq2a.getFeEncKey(), 22, 'private key');
  if (!privateKey) {
    return null;
  }

  obj.value = privateKey;
  return obj;
};

async function derive_address(password, network, idx) {
  network = network.toUpperCase();
  const coin = getCoin(network);
  let seg_wit = '';
  if (coin == 'BITCOIN') {
    seg_wit = 'P2WPKH';
  }
  const dpath = getDerivePath(coin, idx);

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'keystore_common_derive',
    param: {
      password: password,
      derivations: [
        {
          chain_type: coin,
          path: dpath,
          network: getNetwork(network), // Include token_network only if provided
          seg_wit: seg_wit,
          chain_id: '',
          curve: getCurve(network),
        },
      ],
    },
  };

  const escapedString = JSON.stringify(payload).replace(/"/g, '\\"');
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to add address: keystore params missing`);
  //   return null;
  // }

  console.error(`------ ${escapedString}`);

  const [error1, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedString}" `);
  if (error1) {
    console.error(`Failed to add address`);
    return null;
  }

  const [error2, obj] = await to(commonUtil.jsonParse(stdout));
  if (error2 || !obj?.accounts) {
    console.error(`Invalid keystore_common_derive output: ${stdout}`);
    return null;
  }

  const address = obj.accounts[0].address;
  return address;
}

exports.renameWallet = async name => {
  const success = await db.renameWallet(name);
  if (!success) {
    console.error(`Failed to rename wallet`);
    return false;
  }
  return true;
};

exports.addAccount = async (password, chains) => {
  ///let idx = await db.getMaxIndex();
  let addresses = [];
  for (const chain of chains) {
    const addr = await derive_address(password, chain, 0);
    if (!addr) {
      return false;
    }
    addresses.push(addr);
  }
  const arr = addresses.map((addr, i) => {
    return [chains[i], addr];
  });
  // const success = await db.insertDeriveAddress(arr);
  // if (!success) {
  //   console.error(`Failed to insert address of chains`);
  //   return false;
  // }

  // const inserted = await db.insertAccountName(idx, 'Account' + (idx + 1).toString().padStart(2, '0'));
  // if (!inserted) {
  //   console.error(`Failed to insert account name`);
  //   return false;
  // }
  return arr;
};

exports.getTransactionHistory = async (network, address) => {
  let apiEndpoint;
  if (network.toLowerCase().startsWith('SOLANA')) {
    apiEndpoint = `get_solana_tx_history/${network}/${address}`;
  } else {
    apiEndpoint = `get_tx_history/${network}/${address}`;
  }

  const [error, txHistoryResponse] = await to(axiosGet(apiEndpoint));
  if (error) {
    console.error(`Failed to get transaction history: ${error}`);
    return null;
  }
  return txHistoryResponse.data;
};

exports.getTokenTransactionHistory = async (network, address, contractAddress) => {
  const apiEndpoint = `get_token_tx_history/${network}/${address}/${contractAddress}`;
  const [error, txHistoryResponse] = await to(axiosGet(apiEndpoint));
  if (error) {
    console.error(`Failed to get token transaction history: ${error}`);
    return null;
  }
  return txHistoryResponse.data;
};

exports.getTransactionDetail = async txHash => {
  const apiEndpoint = `get_tx_detail/${txHash}`;
  const [error, txDetailResponse] = await to(axiosGet(apiEndpoint));
  if (error) {
    console.error(`Failed to get transaction detail: ${error}`);
    return null;
  }
  return txDetailResponse.data;
};

exports.getGasPrice = async network => {

  if (network.startsWith('SOLANA') || network.startsWith('TRON') || network.startsWith('SUI')) {
    return { 'gas_price': '1' };
  } else if (network.startsWith('BITCOIN')) {
    const btcFee = await getBtcFee(network);
    if (!btcFee?.halfHourFee) {
      console.error(`Failed to get btc fee ${error}`);
      return null;
    }
    return { gas_price: btcFee.halfHourFee.toString() };
  } else {
    const gas_price = await eth.getEthGasPrice(network);
    if (!gas_price) {
      return null;
    }
    return { gas_price };
  }
};

exports.getContractMeta = async (network, contractAddress) => {
  network = network.toUpperCase();
  const apiName = network.startsWith('SOLANA') ? 'get_spl_meta' : 'get_erc20_meta';
  // tmp code
  if (network.startsWith('ETHEREUM') || network.startsWith('BNBSMARTCHAIN') || network.startsWith('BASE') ||
    network.startsWith('ARBITRUM') || network.startsWith('OPTIMISM') ||
    network.startsWith('AVALANCHE') || network.startsWith('POLYGON')) {
    const name = await eth.erc20Name(network, contractAddress);
    const symbol = await eth.erc20Symbol(network, contractAddress);
    const decimals = await eth.erc20Decimals(network, contractAddress);
    return { name, symbol, decimals };
  } else if (network.startsWith('SOLANA')) {
    const meta = await sol.getTokenMetaplexInfo(network, contractAddress);
    return { name: meta.name, symbol: meta.symbol, decimals: meta.decimals };
  } else if (network.startsWith('TRON')) {
    const name = await tron.trc20Name(network, contractAddress);
    const symbol = await tron.trc20Symbol(network, contractAddress);
    const decimals = await tron.trc20Decimals(network, contractAddress);
    return { name, symbol, decimals };
  } else if (network.startsWith('SUI')) {
    const meta = await sui.getMetadata(contractAddress, network);
    return { name: meta.name, symbol: meta.symbol, decimals: meta.decimals };
  }
  const [err, meta] = await to(axiosGet(`${apiName}/${network}/${contractAddress}`));
  if (err) {
    console.error(`Failed to get ERC20 meta: ${err}`);
    return null;
  }
  return meta.data;
};

exports.transferToken = async (password, fromAddress, toAddress, amount, network) => {
  network = network.toUpperCase();
  if (network.startsWith('SOLANA')) {
    return transferSol(password, fromAddress, toAddress, amount, network);
  } else if (network.startsWith('TRON')) {
    return transferTrx(password, fromAddress, toAddress, amount, network);
  } else if (network.startsWith('BITCOIN')) {
    return transferBtc(password, fromAddress, toAddress, amount, network);
  } else if (network.startsWith('SUI')) {
    return transfersui(password, '0x2::sui::SUI', fromAddress, toAddress, amount, network);
  }
  return transferEth(password, fromAddress, toAddress, amount, network);
};

async function transferBtc(password, fromAddress, toAddress, amount, network) {
  const sn = ""; // utils.getUserId();
  const btcFee = await getBtcFee(network);
  if (!btcFee?.halfHourFee) {
    console.error(`Failed to get btc fee ${error}`);
    return null;
  }

  const [err1, response1] = await to(
    axiosGet(`get_btc_utxo/${fromAddress}/${btcFee.halfHourFee}/${amount}/${network}`)
  );
  if (err1) {
    console.error(`Failed to get_btc_utxo: ${err1}`);
    return null;
  }

  const data = response1.data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const segwitType = getAddressType(data[0].codeType);
  if (segwitType.length === 0) {
    return null;
  }

  let payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'BITCOIN',
      address: fromAddress,
      input: {
        to: toAddress,
        amount: parseInt(amount),
        fee_rate: btcFee.halfHourFee,
        change_address_index: 0,
        change_address: '',
        network: getNetwork(network),
        seg_wit: segwitType,
        unspents: [],
      },
      key: {
        Password: password,
      },
    },
  };

  data.forEach(utxo => {
    const unspent = {
      tx_hash: utxo.txid,
      vout: utxo.vout,
      amount: utxo.satoshi,
      address: utxo.address,
      script_pub_key: utxo.scriptPk,
      derived_path: '',
      sequence: 4294967293,
    };

    payload.param.input.unspents.push(unspent);
  });

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer ETH ERC20: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to sign_tx transfer btc: ${err2}`);
    return null;
  }

  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }
  const signedTransaction = `${obj.signature.replace(/^"|"$/g, '')}`;
  const [err4, proxyResponse] = await to(
    axiosPost(`send_btc_transaction_raw/${network}/${signedTransaction}/${sn}/${ts}`, {})
  );
  if (err4) {
    console.error(`Failed to send_btc_tx_raw: ${err4}`);
    return null;
  }
  const txHash = proxyResponse.data?.transaction_hash;
  if (!txHash) {
    console.error(`Invalid proxy response: ${JSON.stringify(proxyResponse.data)}`);
    return null;
  }
  return proxyResponse.data;
}

function getAddressType(code) {
  const addressTypeMap = {
    5: 'NONE',
    7: 'P2WPKH',
    6: 'P2SHWPKH',
    9: 'P2TR',
  };

  return addressTypeMap[code] || '';
}

async function getBtcFee(network) {

  network = getNetwork(network);
  const [err, response] = await to(axiosGet(`get_btc_fee/${network}`));
  if (err) {
    console.error(`Failed to get_btc_fee: ${err}`);
    return null;
  }
  return response.data;
}

async function transferSol(password, fromAddress, toAddress, amount, network) {
  const tx = await sol.getTransferSolMessage(network, fromAddress, toAddress, amount);
  if (!tx) {
    return null;
  }
  const txBytes = tx.serializeMessage().toString('hex');
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'SOLANA',
      address: fromAddress,
      input: {
        raw_data: txBytes,
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer SOL: keystore params missing`);
  //   return null;
  // }

  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  console.error(`------ ${escapedPayload}`);
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to sign_tx transfer SOL ${err2}`);
    return null;
  }

  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }
  const signedTransaction = `${obj.signature.replace(/^"|"$/g, '')}`;
  const bs = Buffer.from(signedTransaction, 'hex');
  const fromPublicKey = new web3.PublicKey(fromAddress);
  tx.addSignature(fromPublicKey, bs);

  const txBuff = tx.serialize();
  const txHash = await sol.sendRawTransaction(network, txBuff);
  if (!txHash) {
    console.error(`Invalid sendRawTransaction response`);
    return null;
  }
  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   '',
  //   '5000'.toString(),
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }

  return { TransactionHash: txHash };
}

async function transferSplToken(password, fromAddress, mintAddress, toAddress, amount, network) {
  const tx = await sol.getTransferSplMessage(network, fromAddress, toAddress, amount, mintAddress);
  const txBytes = tx.serializeMessage().toString('hex');

  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'SOLANA',
      address: fromAddress,
      input: {
        raw_data: txBytes,
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer SOL token: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to sign_tx transfer SOL token`);
    return null;
  }

  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }
  const signedTransaction = `${obj.signature.replace(/^"|"$/g, '')}`;
  const bs = Buffer.from(signedTransaction, 'hex');
  const fromPublicKey = new web3.PublicKey(fromAddress);
  tx.addSignature(fromPublicKey, bs);
  const txBuff = tx.serialize();

  const txHash = await sol.sendRawTransaction(network, txBuff);
  if (!txHash) {
    console.error(`Invalid sendRawTransaction response`);
    return null;
  }

  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   mintAddress.toString(),
  //   '8000'.toString(),
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }
  return { TransactionHash: txHash };
}

async function transferEth(password, fromAddress, toAddress, amount, network) {
  const res = await eth.get_tx_essential_elem(network, fromAddress);
  console.error(`get_tx_essential_elem ${JSON.stringify(res)}`);
  if (!res) {
    return null;
  }

  const { nonce, gas_price: gasPrice } = res;
  // Calculate the final gas price by multiplying the gas price by the multiplier
  const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));

  const gas = await eth.estimate_gas(network, fromAddress, toAddress, amount, '');
  console.error(`estimate_gas ${gas}`);
  if (!gas) {
    return null;
  }
  const finalGas = BigInt(Math.round(gas * GAS_PRICE_MULTIPLIER));
  //const gasFee = finalGasPrice * finalGas;

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'ETHEREUM',
      address: fromAddress,
      input: {
        nonce: nonce.toString(),
        to: toAddress,
        value: amount.toString(),
        gas_price: finalGasPrice.toString(),
        gas: finalGas.toString(),
        data: '',
        network: getNetwork(network),
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer ETH: keystore params missing`);
  //   return null;
  // }
  console.error(`------ ${jsonPayload}`);
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}"`);
  if (err2) {
    console.error(`Failed to exec hd-wallet ${err2}`);
    return null;
  }

  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }

  const signedTransaction = `0x${obj.signature.replace(/^"|"$/g, '')}`;

  const txHash = await eth.sendEthRawTransaction(network, signedTransaction);
  console.error(`sendEthRawTransaction ${txHash}`);
  if (!txHash) {
    console.error(`Invalid proxy response: ${JSON.stringify(proxyResponse.data)}`);
    return null;
  }

  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   '',
  //   gasFee.toString(),
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }

  return { TransactionHash: txHash };
}

async function transferTrx(password, fromAddress, toAddress, amount, network) {
  const rawTx = await tron.getTransferTrxMessage(network, fromAddress, toAddress, amount);
  console.error(`rawTx ${rawTx}`);
  if (!rawTx) {
    return null;
  }

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'TRON',
      address: fromAddress,
      input: {
        raw_data: rawTx.raw_data_hex,
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  console.error(`------ ${jsonPayload}`);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer ETH: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to sign transfer trx`);
    return null;
  }
  console.error(`transferTrx stdout ${stdout} `);
  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signatures) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }

  rawTx.signature = obj.signatures[0];
  const signedTransaction = JSON.stringify(rawTx);
  const txHash = await tron.broadcastTronTransaction(network, rawTx);
  console.error(`txHash broadcastTronTransaction: ${txHash}`);
  if (!txHash) {
    console.error(`Invalid broadcastTronTransaction: ${signedTransaction}`);
    return null;
  }

  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   '',
  //   '1000',
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }
  return { TransactionHash: txHash };
}

async function transferTrc20(password, fromAddress, contractAddress, toAddress, amount, network) {
  const rawTx = await tron.getTransferTrc20Message(network, fromAddress, toAddress, amount, contractAddress);
  if (!rawTx?.raw_data_hex) {
    console.error(`Failed to getting raw_data_hex`);
    return null;
  }

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'TRON',
      address: fromAddress,
      input: {
        raw_data: rawTx.raw_data_hex,
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer trc20: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to bin sign trc20 transfer`);
    return null;
  }
  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signatures) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }

  rawTx.signature = obj.signatures[0];
  const signedTransaction = JSON.stringify(rawTx);

  const txHash = await tron.broadcastTronTransaction(network, rawTx);
  console.error(`txHash broadcastTronTransaction: ${txHash}`);
  if (!txHash) {
    console.error(`Invalid broadcastTronTransaction: ${signedTransaction}`);
    return null;
  }

  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   contractAddress.toString(),
  //   '1000',
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }
  return { TransactionHash: txHash };
}

async function transfersui(password, tokenType, fromAddress, toAddress, amount, network) {
  const rawTx = await sui.getTransferSuiMessage(tokenType, fromAddress, amount, toAddress, network);
  console.error(`rawTx ${rawTx}`);
  if (!rawTx) {
    return null;
  }

  const txString = rawTx.txBytes;
  const intentBuffer = Buffer.from([0, 0, 0]); // [version, app_id, intent_type]
  const txBuffer = Buffer.from(txString, 'base64');
  const decoded = Buffer.concat([intentBuffer, txBuffer]).toString('hex');

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'SUI',
      address: fromAddress,
      input: {
        raw_data: decoded,
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  console.error(`------ ${jsonPayload}`);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer ETH: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to sign transfer trx`);
    return null;
  }
  console.error(`transferTrx stdout ${stdout} `);
  // Parse the response from the hardware wallet
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }

  const signature = Buffer.from(obj.signature, 'hex').toString('base64');

  const txHash = await sui.sendSuiTransaction(txString, signature);

  console.error(`txHash broadcastTronTransaction: ${txHash}`);
  if (!txHash) {
    console.error(`Invalid broadcastTronTransaction: ${signedTransaction}`);
    return null;
  }

  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   '',
  //   '1000',
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   return null;
  // }
  return { TransactionHash: txHash };
}

exports.transferContractToken = async (password, fromAddress, contractAddress, toAddress, amount, network) => {
  if (network.startsWith('SOLANA')) {
    return transferSplToken(password, fromAddress, contractAddress, toAddress, amount, network);
  } else if (network.startsWith('TRON')) {
    return transferTrc20(password, fromAddress, contractAddress, toAddress, amount, network);
  } else if (network.startsWith('SUI')) {
    return transfersui(password, contractAddress, fromAddress, toAddress, amount, network);
  } else if (network.startsWith('BITCOIN')) {
    console.error(`BTC does not support contract token transfer`);
    return null;
  }
  return transferEthErc20(password, fromAddress, contractAddress, toAddress, amount, network);
};

async function transferEthErc20(password, fromAddress, contractAddress, toAddress, amount, network) {
  const res = await eth.get_tx_essential_elem(network, fromAddress);
  console.error(`get_tx_essential_elem ${res}`);
  if (!res) {
    return null;
  }

  const { nonce, gas_price: gasPrice } = res;
  // Encode the transfer function call using the provided parameters
  const callData = eth.getTransferCalldata(toAddress, amount);
  const gas = await eth.estimate_gas(network, fromAddress, contractAddress, 0, '0x' + callData);
  if (!gas) {
    return null;
  }
  // Calculate the final gas price by multiplying the gas price by the multiplier
  const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));
  //const gasFee = finalGasPrice * BigInt(gas);

  // Prepare the payload to be signed by the hardware wallet
  const payload = {
    method: 'sign_tx',
    param: {
      chain_type: 'ETHEREUM',
      address: fromAddress,
      input: {
        nonce: nonce.toString(),
        to: contractAddress,
        value: '0',
        gas_price: finalGasPrice.toString(),
        gas: gas.toString(),
        data: callData,
        network: getNetwork(network),
      },
      key: {
        Password: password,
      },
    },
  };

  const jsonPayload = JSON.stringify(payload);
  // const keystoreParams = getKeystoreParams();
  // if (!keystoreParams) {
  //   console.error(`Failed to transfer ETH ERC20: keystore params missing`);
  //   return null;
  // }
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');
  const [err2, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
  if (err2) {
    console.error(`Failed to transfer ETH ERC20`);
    return null;
  }
  const [err3, obj] = await to(commonUtil.jsonParse(stdout));
  if (err3 || !obj?.signature) {
    console.error(`Invalid sign_tx output: ${stdout}`);
    return null;
  }

  const signedTransaction = `0x${obj.signature.replace(/^"|"$/g, '')}`;
  const txHash = await eth.sendEthRawTransaction(network, signedTransaction);
  if (!txHash) {
    console.error(`Invalid sendEthRawTransaction response: ${JSON.stringify(proxyResponse.data)}`);
    return null;
  }
  // const success = await db.addTx(
  //   txHash,
  //   fromAddress.toString(),
  //   toAddress.toString(),
  //   contractAddress.toString(),
  //   gasFee.toString(),
  //   0,
  //   network,
  //   'Send',
  //   amount,
  //   Date.now(),
  //   0
  // );
  // if (!success) {
  //   console.error(`Failed to add tx`);
  //   return null;
  // }
  return { TransactionHash: txHash };
}

exports.getAddress = async idx => {
  return db.getAddress(idx);
};

exports.getWalletMeta = async () => {
  return db.getWalletMeta();
};

exports.getWalletInfo = async () => {
  return db.getWalletInfo();
};

exports.updateAddress = async (network, address, name) => {
  return db.updateAddress(network, address, name);
};

exports.deleteAccount = async index => {
  return db.deleteAccount(index);
};

exports.getTx = async txId => {
  return db.getTx(txId);
};

/* tokenArray:[{contract_address:'',decimal:,symbol:'',name:'',status:1} ....] */
async function enrichTokens(network, address, tokenArray) {
  const enrichedTokens = await Promise.all(
    tokenArray.map(async token => {
      const pricePromise = exports.getPrice(token.symbol);

      let balancePromise;
      if (token.contract_address === '') {
        balancePromise = exports.getBalance(address, network);
      } else {
        balancePromise = exports.getErc20Balance(token.contract_address, address, network);
      }

      const [priceObj, balanceObj] = await Promise.all([pricePromise, balancePromise]);
      const price = priceObj?.token_price ?? 0;
      const balance = balanceObj?.balance ?? 0;
      return { ...token, price, balance };
    })
  );

  return enrichedTokens.filter(token => token !== null);
}

exports.getTokenList = async (network, address) => {
  const list = await db.getTokenList(network, address);
  for (item of list) {
    decimalsCache.set(network + address + item.contract_address, item.decimal);
  }
  return enrichTokens(network, address, list);
};

exports.getDefaultTokenList = async (network, address) => {
  const list = await db.getDefaultTokenList(network);
  for (item of list) {
    decimalsCache.set(network + address + item.contract_address, item.decimal);
  }
  return enrichTokens(network, address, list);
};

exports.getTxHistory = async (network, address, contractAddress) => {
  return db.getTxHistory(network, address, contractAddress);
};

exports.addToken = async tokenArray => {
  return db.addToken([...tokenArray]);
};

exports.deleteToken = async tokenArray => {
  return db.deleteToken([...tokenArray]);
};

exports.deleteWallet = async () => {
  await Promise.all([
    rm(KEYSTORE_FILE, { force: true }),
    rm(BACKUP_FLAG_FILE_PATH, { force: true }),
    pruneOldDbRecord(),
  ]);
};

async function setNameSource(name, source, identifier) {
  return db.setWalletInfo(name, source, identifier);
}

async function pruneOldDbRecord() {
  return db.deleteOldAddressToken();
}

/**
 * 从钱包账户数据中提取 chain_type 和 address 字段列表
 * @param {string} walletOutput - DEEPER_WALLET_BIN_PATH 命令的输出字符串
 * @returns {Array<{chain_type: string, address: string}>|null} 提取的账户列表或null（如果解析失败）
 */
const extractAccountList = (walletOutput) => {
  try {
    const data = JSON.parse(walletOutput);

    if (!data.accounts || !Array.isArray(data.accounts)) {
      console.error('Invalid wallet output: missing or invalid accounts array');
      return null;
    }

    return data.accounts.map(account => ({
      chain_type: account.chain_type,
      address: account.address
    }));
  } catch (error) {
    console.error('Failed to parse wallet output:', error);
    return null;
  }
};

/**
 * 获取钱包中所有账户的 chain_type 和 address 列表
 * @returns {Promise<Array<{chain_type: string, address: string}>|null>} 账户列表或null（如果获取失败）
 */
exports.deriveAccountList = async () => {
  const payload = {
    method: 'keystore_common_accounts',
    param: {}
  };

  const jsonPayload = JSON.stringify(payload);
  const escapedPayload = jsonPayload.replace(/"/g, '\\"');

  const [error, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
  if (error) {
    console.error('Failed to get account list:', error);
    return null;
  }

  return extractAccountList(stdout);
};

