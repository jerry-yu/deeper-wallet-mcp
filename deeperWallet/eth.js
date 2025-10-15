const axios = require('axios');
const to = require('await-to-js').default;
const logger = require('./log');
const { convertHexToDecimalString, hexToString, hexToDecimal } = require('./utils');

const TRANSFER_SELECTOR = 'a9059cbb';
const BALANCEOF_SELECTOR = '0x70a08231';
const NAME_SELECTOR = '0x06fdde03';
const SYMBOL_SELECTOR = '0x95d89b41';
const DECIMALS_SELECTOR = '0x313ce567';

const rpcUrls = {
  'ETHEREUM-SEPOLIA': [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.gateway.tenderly.co',
  ],
  'ETHEREUM': [
    'https://eth-mainnet.public.blastapi.io',
    'https://eth.llamarpc.com',
    'https://ethereum-rpc.publicnode.com',
  ],
  'ARBITRUM': [
    'https://arbitrum-rpc.publicnode.com',
    'https://arbitrum.llamarpc.com',
    'https://arbitrum-one-rpc.publicnode.com',
  ],
  'ARBITRUM-TESTNET': [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public',
    'https://arbitrum-sepolia.gateway.tenderly.co',
  ],

  'OPTIMISM': ['https://optimism-rpc.publicnode.com',
    'https://optimism.llamarpc.com',
    'https://rpc.ankr.com/optimism'],
  'OPTIMISM-TESTNET': [
    'https://api.zan.top/opt-sepolia',
    'https://optimism-sepolia-rpc.publicnode.com',
    'https://optimism-sepolia.drpc.org',
  ],
  'BASE': [
    'https://base.llamarpc.com',
    'https://developer-access-mainnet.base.org',
    'https://base-mainnet.public.blastapi.io',
  ],

  'BASE-TESTNET': [
    'https://base-sepolia-rpc.publicnode.com',
    'https://sepolia.base.org',
    'https://base-sepolia.gateway.tenderly.co',
  ],
  'BNBSMARTCHAIN': [
    'https://bsc-dataseed2.bnbchain.org',
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed2.defibit.io',
  ],
  'BNBSMARTCHAIN-TESTNET': [
    'https://bsc-testnet-dataseed.bnbchain.org',
    'https://bsc-testnet.bnbchain.org',
    'https://bsc-prebsc-dataseed.bnbchain.org'
  ],
};

function convertDecimalToHexString(decimalStr) {
  const decimalNum = BigInt(decimalStr);
  const hexStr = '0x' + decimalNum.toString(16);
  return hexStr;
}

function getRandomUrl(urls) {
  const randomIndex = Math.floor(Math.random() * urls.length);
  console.warn(`Using RPC URL: ${urls[randomIndex]}`);
  return urls[randomIndex];
}

function getRpcUrl(network) {
  const urls = rpcUrls[network];
  if (!urls) {
    return null;
  }
  return getRandomUrl(urls);
}

async function sendRpcRequest(rpcUrl, method, params = []) {
  console.warn(`sendRpcRequest: ${rpcUrl} ${method} ${JSON.stringify(params)}`);
  if (!rpcUrl) {
    return null;
  }
  const [error, response] = await to(
    axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  );
  if (error) {
    console.error(`Failed to sendRpcRequest: ${rpcUrl} ${method} ${error}`);
    return null;
  }
  console.warn(`RPC Response: ${JSON.stringify(response.data)}`);
  return response.data.result ? response.data.result : null;
}

async function estimate_gas(network, fromAddress, toAddress, amount, data) {
  let body = { from: fromAddress, to: toAddress };
  if (amount > 0) {
    body.value = convertDecimalToHexString(amount);
  }
  if (data) {
    body.data = data;
  }
  console.warn(`estimate_gas body: ${JSON.stringify(body)}`);
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_estimateGas', [body]);
  if (!res) {
    return null;
  }
  console.warn(`estimate_gas body: ${JSON.stringify(res)}`);
  const gas = convertHexToDecimalString(res);
  return parseInt(gas);
}

async function sendEthRawTransaction(network, data) {
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_sendRawTransaction', [data]);
  if (!res) {
    return null;
  }
  return res;
}

async function getEthBalance(network, address) {
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_getBalance', [address, 'latest']);
  if (!res) {
    return null;
  } else {
    const val = convertHexToDecimalString(res);
    return { balance: val };
  }
}

async function getErc20Balance(network, contractAddress, address) {
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_call', [
    {
      to: contractAddress,
      data: BALANCEOF_SELECTOR + address.slice(2).padStart(64, '0'),
    },
    'latest',
  ]);
  if (!res) {
    return null;
  } else {
    const val = convertHexToDecimalString(res);
    return { balance: val };
  }
}

async function getEthGasPrice(network) {
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_gasPrice', []);
  if (!res) {
    return null;
  } else {
    return convertHexToDecimalString(res);
  }
}

async function getNonce(network, address) {
  const res = await sendRpcRequest(getRpcUrl(network), 'eth_getTransactionCount', [address, 'latest']);
  if (!res) {
    return null;
  }
  return parseInt(res, 16);
}

async function get_tx_essential_elem(network, address) {
  console.warn(`get_tx_essential_elem: ${network} ${address}`);
  const nonce = await getNonce(network, address);
  if (nonce === null) {
    return null;
  }
  const gas_price = await getEthGasPrice(network);
  if (gas_price === null) {
    return null;
  }
  return { nonce, gas_price };
}

async function erc20Meta(network, contractAddress, selector) {
  const url = getRpcUrl(network);
  const res = await sendRpcRequest(url, 'eth_call', [{ to: contractAddress, data: selector }, 'latest']);
  if (!res) {
    return null;
  }
  return res;
}

async function erc20Name(network, contractAddress) {
  const res = await erc20Meta(network, contractAddress, NAME_SELECTOR);
  if (!res) {
    return null;
  }
  return hexToString(res);
}

async function erc20Symbol(network, contractAddress) {
  const res = await erc20Meta(network, contractAddress, SYMBOL_SELECTOR);
  if (!res) {
    return null;
  }
  console.warn('erc20Symbol res:', res);
  return hexToString(res);
}

async function erc20Decimals(network, contractAddress) {
  const res = await erc20Meta(network, contractAddress, DECIMALS_SELECTOR);
  if (!res) {
    return null;
  }
  return hexToDecimal(res);
}

function getTransferCalldata(toAddress, amount) {
  toAddress = toAddress.toLowerCase();
  toAddress = toAddress.startsWith('0x') ? toAddress.slice(2) : toAddress;
  toAddress = toAddress.padStart(64, '0');
  amount = BigInt(amount).toString(16).padStart(64, '0');
  return `${TRANSFER_SELECTOR}${toAddress}${amount}`;
}

module.exports = {
  estimate_gas,
  sendEthRawTransaction,
  getEthBalance,
  getErc20Balance,
  getEthGasPrice,
  getNonce,
  get_tx_essential_elem,
  erc20Name,
  erc20Symbol,
  erc20Decimals,
  getTransferCalldata,
};
