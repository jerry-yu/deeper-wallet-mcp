const sqlite3 = require('./sqlite3');

const GET_TX_HISTORY =
  "SELECT type,amount,tx_id, timestamp,block_number FROM tx_history WHERE network = ? and address = ? AND contract_address= ? And timestamp > strftime('%s', 'now', '-3 days') ORDER BY timestamp DESC limit 100";
const GET_TX = 'SELECT from_address,to_address, fee,status FROM tx WHERE tx_id= ?';
const GET_TOKEN_LIST =
  'SELECT contract_address,decimal, symbol,name,status FROM token_list WHERE network = ? and (address = ? or address = "")';
// const GET_DEFAULT_TOKEN_LIST = `SELECT contract_address,name,decimal, symbol FROM default_token_list WHERE network = ?
//   union
//   SELECT contract_address,name,decimal, symbol FROM token_list WHERE network = ? and address = ? and status = 1
//   `;
const GET_DEFAULT_TOKEN_LIST = `SELECT contract_address,name,decimal, symbol FROM default_token_list WHERE network = ?`;

const INSERT_TOKEN =
  'INSERT OR REPLACE INTO token_list (network,address,contract_address,symbol,decimal,name,status) VALUES (?,?,?,?,?,?,1)';
const DELETE_TOKEN = 'UPDATE token_list SET status = 0 WHERE network = ? and address = ? and contract_address= ?';
const INSERT_TX = `INSERT or REPLACE INTO tx (tx_id, from_address, to_address, fee, status,timestamp) VALUES (?, ?, ?, ?, ?,?)`;
const INSERT_TX_HISTORY = `INSERT or REPLACE INTO tx_history (tx_id,network,address,contract_address,type,amount,timestamp,block_number) values(?,?,?,?,?,?,?,?)`;
const DELETE_OLD_TX = `DELETE FROM tx where timestamp < strftime('%s', 'now', '-3 months')`;
const DELETE_OLD_TX_HISTORY = `DELETE FROM tx_history where timestamp < strftime('%s', 'now', '-3 months')`;
const DELETE_FROM_WALLET = `DELETE FROM wallet`;
const DELETE_FROM_ADDRESSES = `DELETE FROM addresses`;
const DELETE_FROM_TOKENLIST = `DELETE FROM token_list where address != "" or contract_address != ""`;

const INSERT_DERIVE_ADDRESS = `INSERT or REPLACE INTO addresses (idx,network, address,status) VALUES (?, ?,?,1)`;
const INSERT_ACCOUNT_NAME = ` INSERT or REPLACE INTO accounts (idx,name) VALUES (?,?)`;
const DELET_ACCOUNT_NAME = `DELETE FROM accounts WHERE idx = ?; `;
const DELET_ACCOUNT = `UPDATE addresses set status = 0 WHERE idx=?`;
const GET_ADDRESS = `SELECT network,address FROM addresses WHERE idx = ? and status = 1`;
const GET_WALLET_META = `SELECT name,source,identifier FROM wallet where id = 1`;
const RENAME_WALLET = `INSERT OR REPLACE INTO wallet (id,name) values(1,?)`;
const SET_WALLET_INFO = `INSERT OR REPLACE INTO wallet (id,name,source,identifier) values(1,?,?,?)`;
const RENAME_ACCOUNT = `UPDATE accounts SET name = ? WHERE idx = ?`;
const GET_WALLET_ALL = `SELECT addresses.idx, accounts.name, addresses.network 
      FROM addresses 
      INNER JOIN accounts ON addresses.idx = accounts.idx 
      WHERE addresses.status=1
      ORDER BY addresses.idx ASC;`;

const GET_MAX_INDEX = `SELECT MAX(idx) AS max_idx FROM addresses`;

exports.getAddress = async idx => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_ADDRESS, [idx]);
  return list;
};

exports.getWalletMeta = async () => {
  const row = await sqlite3.getOne(sqlite3.getDeeperWalletDb(), GET_WALLET_META, []);
  return row;
};

exports.getMaxIndex = async () => {
  const row = await sqlite3.getOne(sqlite3.getDeeperWalletDb(), GET_MAX_INDEX, []);
  const maxIdx = row.max_idx !== null ? row.max_idx + 1 : 0;
  return maxIdx;
};

exports.getWalletInfo = async () => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_WALLET_ALL, []);
  return list;
};

exports.getTxHistory = async (network, address, contractAddress) => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_TX_HISTORY, [network, address, contractAddress]);
  return list;
};

exports.getTx = async txId => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_TX, [txId]);
  return list;
};

exports.getDefaultTokenList = async network => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_DEFAULT_TOKEN_LIST, [network]);
  return list;
};

exports.getTokenList = async (network, address) => {
  const list = await sqlite3.getList(sqlite3.getDeeperWalletDb(), GET_TOKEN_LIST, [network, address]);
  return list;
};

exports.deleteOldAddressToken = async () =>
  sqlite3.batchRun(
    sqlite3.getDeeperWalletDb(),
    [DELETE_FROM_WALLET, DELETE_FROM_ADDRESSES, DELETE_FROM_TOKENLIST],
    [[], [], []]
  );

async function insertTx(txHash, fromAddress, toAddress, fee, status, timestamp) {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), INSERT_TX, [
    txHash,
    fromAddress,
    toAddress,
    fee,
    status,
    timestamp,
  ]);
}

exports.deleteOldTx = async () =>
  sqlite3.batchRun(sqlite3.getDeeperWalletDb(), [DELETE_OLD_TX, DELETE_OLD_TX_HISTORY], [[], []]);

exports.insertDeriveAddress = async addressArray => {
  const sqls = new Array(addressArray.length).fill(INSERT_DERIVE_ADDRESS);
  return sqlite3.batchRun(sqlite3.getDeeperWalletDb(), sqls, addressArray);
};

exports.renameWallet = async name => {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), RENAME_WALLET, [name]);
};

exports.setWalletInfo = async (name, source, identifier) => {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), SET_WALLET_INFO, [name, source, identifier]);
};

exports.renameAccount = async (index, newName) => {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), RENAME_ACCOUNT, [newName, index]);
};

exports.insertAccountName = async (idx, name) => {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), INSERT_ACCOUNT_NAME, [idx, name]);
};

exports.deleteAccount = async idx => {
  const res = sqlite3.runSql(sqlite3.getDeeperWalletDb(), DELET_ACCOUNT_NAME, [idx]);
  if (res) {
    return sqlite3.runSql(sqlite3.getDeeperWalletDb(), DELET_ACCOUNT, [idx]);
  }
};

exports.updateAddress = async (coin, network, address, name) => {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), UPDATE_ADDRESS, [
    name,
    coin,
    //using the origin format, because of signing requirement
    address,
    network,
  ]);
};

async function insertTxHistory(txHash, network, address, contractAddress, type, amount, timestamp, blockNumber) {
  return sqlite3.runSql(sqlite3.getDeeperWalletDb(), INSERT_TX_HISTORY, [
    txHash,
    network,
    address,
    contractAddress,
    type,
    amount,
    timestamp,
    blockNumber,
  ]);
}

exports.addToken = async tokenArray => {
  const sqls = new Array(tokenArray.length).fill(INSERT_TOKEN);
  const args = tokenArray.map(item => [
    item.network,
    item.address,
    item.contractAddress || '',
    item.symbol,
    item.decimal,
    item.name,
  ]);
  return sqlite3.batchRun(sqlite3.getDeeperWalletDb(), sqls, args);
};

exports.deleteToken = async tokenArray => {
  const sqls = new Array(tokenArray.length).fill(DELETE_TOKEN);
  const args = tokenArray.map(item => [item.network, item.address, item.contractAddress || '']);
  return sqlite3.batchRun(sqlite3.getDeeperWalletDb(), sqls, args);
};

exports.addTx = async (
  txHash,
  fromAddress,
  toAddress,
  contractAddress,
  fee,
  status,
  network,
  type,
  amount,
  timestamp,
  blockNumber
) => {
  const success = await insertTx(txHash, fromAddress, toAddress, fee, status, timestamp);
  if (!success) {
    return false;
  }

  const realAddress = type === 'Receive' ? toAddress : fromAddress;
  return insertTxHistory(txHash, network, realAddress, contractAddress, type, amount, timestamp, blockNumber);
};
