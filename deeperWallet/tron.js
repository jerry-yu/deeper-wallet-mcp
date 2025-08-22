const axios = require('axios');
const to = require('await-to-js').default;
const { decode } = require('bs58');
const logger = require('./log');
const { hexToString, hexToDecimal } = require('./utils');

const tronRpcUrls = {
  'TRON': 'https://api.trongrid.io',
  'TRON-TESTNET': 'https://api.shasta.trongrid.io',
};

function getRpcUrl(network) {
  const url = tronRpcUrls[network];
  return url ? url : 'https://api.trongrid.io';
}

async function sendJsonRequest(network, endpoint, params) {
  const TRON_RPC_URL = getRpcUrl(network);

  const [error, response] = await to(
    axios.post(`${TRON_RPC_URL}/${endpoint}`, params, {
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
    })
  );
  if (error) {
    logger.error(`Failed to sendJsonRequest: ${TRON_RPC_URL}/${endpoint} ${error}`);
    return null;
  }
  return response.data;
}

async function getTronBalance(network, address) {
  const params = {
    address: address,
    visible: true,
  };

  const res = await sendJsonRequest(network, 'wallet/getaccount', params);
  if (!res) {
    logger.error('Error getting balance:', res);
    return { balance: 0 };
  }
  const balance = res?.balance || 0;
  return { balance: balance };
}

function tronAddressToHex(tronAddress) {
  const decoded = decode(tronAddress);
  const realDecode = decoded.subarray(1, 21);
  const hex = realDecode.toString('hex');
  return hex;
}

async function getTronTokenBalance(network,contractAddress, address) {
  const hexAddress = tronAddressToHex(address);

  const params = {
    owner_address: address,
    contract_address: contractAddress,
    function_selector: 'balanceOf(address)',
    parameter: `000000000000000000000000${hexAddress}`,
    visible: true,
  };

  const result = await sendJsonRequest(network, 'wallet/triggerconstantcontract', params);
  if (!result || !result.constant_result) {
    logger.error('Error getting token balance:', result);
    return { balance: 0 };
  }
  const res = result.constant_result[0];
  return { balance: parseInt(res, 16).toString() };
}

async function getTransferTrxMessage(network, fromAddress, toAddress, amount) {
  const params = {
    to_address: toAddress,
    owner_address: fromAddress,
    amount: parseInt(amount),
    visible: true,
  };

  const [error, result] = await to(sendJsonRequest(network, 'wallet/createtransaction', params));
  if (error || !result || !result.txID) {
    logger.error(`Error transferring TRX:, ${error}`);
    return null;
  }
  return result;
}

async function getTransferTrc20Message(network, fromAddress, toAddress, amountStr, contractAddress) {
  const hexAddress = tronAddressToHex(toAddress);
  const amount = parseInt(amountStr);
  const params = {
    owner_address: fromAddress,
    amount: amount,
    contract_address: contractAddress,
    function_selector: 'transfer(address,uint256)',
    fee_limit: 1000000000,
    call_value: 0,
    parameter: `000000000000000000000000${hexAddress}${amount.toString(16).padStart(64, '0')}`,
    visible: true,
  };
  const res = await sendJsonRequest(network, 'wallet/triggersmartcontract', params);
  if (!res || !res.result?.result) {
    logger.error(`Error transferring TRC20: ${amountStr}`);
    return null;
  }
  return res.transaction;
}

async function broadcastTronTransaction(network, params) {
  const res = await sendJsonRequest(network, 'wallet/broadcasttransaction', params);
  if (!res || !res.result) {
    logger.error(`Error broadcasting TRX transaction: ${res}`);
    return null;
  }
  return res.txid;
}

async function trc20Meta(network, contractAddress, selector) {
  // unused but must supply an address
  const address = 'TSNEe5Tf4rnc9zPMNXfaTF5fZfHDDH8oyW';
  const params = {
    owner_address: address,
    contract_address: contractAddress,
    function_selector: selector,
    visible: true,
  };

  const result = await sendJsonRequest(network, 'wallet/triggerconstantcontract', params);
  if (!result || !result.constant_result) {
    logger.error('Error TRC20 meta:', result);
    return null;
  }
  return result.constant_result[0];
}

async function trc20Name(network, contractAddress) {
  const name = await trc20Meta(network, contractAddress, 'name()');
  return hexToString(name);
}

async function trc20Symbol(network, contractAddress) {
  const symbol = await trc20Meta(network, contractAddress, 'symbol()');
  return hexToString(symbol);
}

async function trc20Decimals(network, contractAddress) {
  const decimals = await trc20Meta(network, contractAddress, 'decimals()');
  return hexToDecimal(decimals);
}

module.exports = {
  getTronBalance,
  getTronTokenBalance,
  getTransferTrxMessage,
  getTransferTrc20Message,
  broadcastTronTransaction,
  trc20Name,
  trc20Decimals,
  trc20Symbol,
};
