const axios = require('axios');
const to = require('await-to-js').default;
const logger = require('./log');

const suiRpcUrls = {
  'SUI': ' https://sui-mainnet-endpoint.blockvision.org',
  'SUI-TESTNET': 'https://fullnode.testnet.sui.io',
};

function getRpcUrl(network) {
  const url = suiRpcUrls[network];
  return url ? url : 'https://fullnode.testnet.sui.io';
}

async function getSuiBalance(network, address) {
  const url = getRpcUrl(network);
  const [err, response] = await to(axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getBalance',
    params: [address, '0x2::sui::SUI'],
  }));
  if (err) {
    logger.error(`Failed to getSuiBalance: ${url} ${address} ${err}`);
    return null;
  }
  return { balance: response.data.result.totalBalance };
}

async function getTokenBalance(network, tokenType, address) {
  const [err, response] = await to(axios.post(getRpcUrl(network), {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getBalance',
    params: [address, tokenType],
  }));
  if (err) {
    logger.error(`Failed to getTokenBalance: ${network} ${address} ${tokenType} ${err}`);
    return null;
  }
  return { balance: response.data.result.totalBalance };
}

async function getCoins(address, tokenType, network) {
  const url = getRpcUrl(network);
  const response = await axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getCoins',
    params: [address, tokenType],
  });
  return response.data.result;
}

async function getTransferSuiMessage(tokenType, address, amount, recipient, network) {
  const suiInfo = await getCoins(address, tokenType, network);
  console.warn('suiInfo:', suiInfo);
  let gasBudget = 0n;
  if (tokenType === '0x2::sui::SUI') {
    gasBudget = 5000000n;
  }
  const coins = suiInfo.data;
  let objIds = [];
  let sum = 0n;
  amount = BigInt(amount);
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    sum += BigInt(coin.balance);
    objIds.push(coin.coinObjectId);
    console.warn('sum:', sum);
    if (sum > amount + gasBudget) {
      break;
    }
  }

  console.warn('amount:', amount, 'gasBudget:', gasBudget, 'sum:', sum);
  if (sum < amount + gasBudget) {
    console.error('Insufficient balance');
    return null;
  }

  let method = 'unsafe_pay';
  if (tokenType === '0x2::sui::SUI') {
    method = 'unsafe_paySui';
  }

  const url = getRpcUrl(network);
  console.warn('objIds:', objIds, 'url', url,);

  const [err, response] = await to(axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      signer: address,
      input_coins: objIds,
      recipients: [recipient],
      amounts: [amount.toString()],
      gas_budget: gasBudget.toString(),
    },
  }));
  if (err) {
    logger.error(`Failed to getTransferSuiMessage: ${network} ${address} ${tokenType} ${amount} ${recipient} ${err}`);
    return null;
  }
  console.warn('response:', response.data);
  return response.data.result;
}

async function getMetadata(tokenType, network) {
  const url = getRpcUrl(network);
  const response = await axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getCoinMetadata',
    params: [tokenType],
  });
  return response.data.result;
}

async function sendSuiTransaction(txByte, signature, network) {
  const url = getRpcUrl(network);
  const response = await axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_executeTransactionBlock',
    params: [txByte, [signature]],
  });
  console.warn('response:', response.data);
  return response.data.result;
}

module.exports = {
  getSuiBalance,
  getTokenBalance,
  getCoins,
  getTransferSuiMessage,
  getMetadata,
  sendSuiTransaction,
};
