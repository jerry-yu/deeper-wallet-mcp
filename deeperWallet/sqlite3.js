const sqlite3 = require('sqlite3');
const to = require('await-to-js').default;
const { readFile } = require('node:fs/promises');

const logger = require('./log');

const DB_DIR = '/var/deeper/sqlite3';
const DEFAULT_DB_MODE = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
const SQLITE3_DIR = '/home/atomos-env/gui-backend/sqlite3';
const GET_SYSLOG_LINES_QUERY = 'SELECT Message, ReportedAt FROM SystemEvents ORDER BY ROWID DESC LIMIT ?';
const COUNT_SHARING_SECURITY_QUERY =
  'SELECT COUNT(*) AS TOTAL FROM SystemEvents WHERE ReportedAt BETWEEN ? AND ? AND Message LIKE "%" || ? || "%"';
const GET_SHARING_SECURITY_QUERY =
  'SELECT * FROM SystemEvents WHERE ReportedAt BETWEEN ? AND ? AND Message LIKE "%" || ? || "%" ORDER BY ROWID DESC LIMIT ? OFFSET ?';

const dbMap = {
  syslog: {
    filename: 'syslog.db',
    mode: sqlite3.OPEN_READONLY,
  },
  sharingSecurity: {
    filename: 'sharing_security.db',
    mode: sqlite3.OPEN_READONLY,
  },
  mainnetDailyTraffic: {
    filename: 'mainnet_daily_traffic.db',
    script: 'daily_traffic_db_setup.sql',
  },
  testnetDailyTraffic: {
    filename: 'testnet_daily_traffic.db',
    script: 'daily_traffic_db_setup.sql',
  },
  accessControl: {
    filename: 'access_control.db',
    script: 'access_control_db_setup.sql',
    columns: [
      ['access_control', 'maxBw', 'INTEGER'],
      ['access_control', 'bypass', 'TEXT'],
    ],
  },
  routing: {
    filename: 'routing.db',
    script: 'routing_db_setup.sql',
  },
  sharing: {
    filename: 'sharing.db',
    script: 'sharing_db_setup.sql',
  },
  tunnel: {
    filename: 'tunnel.db',
    script: 'tunnel_db_setup.sql',
  },
  appRelocator: {
    filename: 'app_relocator.db',
    script: 'app_relocator_db_setup.sql',
  },
  wallet: {
    filename: 'wallet.db',
    script: 'wallet_db_setup.sql',
  },
  credential: {
    filename: 'credential.db',
    script: 'credential_db_setup.sql',
  },
  dnsFilter: {
    filename: 'dns_filter.db',
    script: 'dns_filter_db_setup.sql',
  },
  httpsFilter: {
    filename: 'https_filter.db',
    script: 'https_filter_db_setup.sql',
  },
  default: {
    filename: 'default.db',
    script: 'default_db_setup.sql',
  },
  deeperWallet: {
    filename: 'deeper_wallet.db',
    script: 'deeper_wallet_db_setup.sql',
  },
};

exports.DB_DIR = DB_DIR;
exports.dbMap = dbMap;

exports.loadAllDb = async () => {
  for (const key of Object.keys(dbMap)) {
    const path = `${DB_DIR}/${dbMap[key].filename}`;

    const mode = dbMap[key].mode || DEFAULT_DB_MODE;
    dbMap[key].db = await new Promise(resolve => {
      const db = new sqlite3.Database(path, mode, err => {
        if (err) {
          logger.error(`Failed to open DB ${path}: ${err}`);
          resolve(null);
        } else {
          console.warn(`Successfully loaded DB ${path}`);
          resolve(db);
        }
      });
    });

    if (!dbMap[key].db || !dbMap[key].script) {
      continue;
    }

    const [err] = await to(setUpDb(`${SQLITE3_DIR}/${dbMap[key].script}`, dbMap[key].db));
    if (err) {
      logger.error(`Failed to set up DB ${key}: ${err}`);
      continue;
    }

    for (const column of dbMap[key].columns || []) {
      await addColumn(dbMap[key].db, column);
    }
  }
};

async function setUpDb(scriptPath, db) {
  const script = await readFile(scriptPath, { encoding: 'utf8' });

  return new Promise((resolve, reject) => {
    db.exec(script, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function addColumn(db, column) {
  const query = `SELECT 1 FROM pragma_table_info('${column[0]}') WHERE name = '${column[1]}'`;
  const row = await exports.getOne(db, query, []);
  if (row) {
    return;
  }

  const sql = `ALTER TABLE ${column[0]} ADD COLUMN ${column[1]} ${column[2]}`;
  const success = await exports.runSql(db, sql, []);
  if (success) {
    console.warn(`Column ${column[1]} added to table ${column[0]}`);
  }
}

async function getList(db, query, params) {
  if (!db) {
    return [];
  }

  const list = await new Promise(resolve => {
    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error(`Failed to query ${query}: ${err}`);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });

  return list;
}

exports.getSyslogLines = async maxLines => {
  const list = await getList(dbMap.syslog.db, GET_SYSLOG_LINES_QUERY, [maxLines]);

  return list.map(entry => {
    return {
      line: entry.Message || '{}',
      time: entry.ReportedAt,
    };
  });
};

exports.countSharingSecurity = async (start, end, keyword) => {
  const result = await getList(dbMap.sharingSecurity.db, COUNT_SHARING_SECURITY_QUERY, [start, end, keyword]);

  return result.length > 0 ? result[0].TOTAL : 0;
};

exports.getSharingSecurity = async (start, end, keyword, limit, offset) => {
  const list = await getList(dbMap.sharingSecurity.db, GET_SHARING_SECURITY_QUERY, [
    start,
    end,
    keyword,
    limit,
    offset,
  ]);

  return list;
};

exports.getList = getList;

exports.runSql = async (db, sql, args) => {
  if (!db) {
    return false;
  }

  return new Promise(resolve => {
    db.run(sql, args, err => {
      if (err) {
        logger.error(`Failed to run ${sql}: ${err}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

exports.getOne = async (db, query, args) => {
  if (!db) {
    return null;
  }

  return new Promise(resolve => {
    db.get(query, args, (err, row) => {
      if (err) {
        logger.error(`Failed to get ${query}: ${err}`);
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
};

exports.batchRun = async (db, sqlList, argsList, op) => {
  if (!db) {
    return false;
  }
  if (sqlList.length !== argsList.length) {
    logger.error(`Failed to batch run: sqlList.length=${sqlList.length}, argsList.length=${argsList.length}`);
    return false;
  }

  if (db.inTxn) {
    logger.error(`Failed to batch run (${op}): transaction in progress (${db.txnOp})`);
    return false;
  }
  db.inTxn = true;
  db.txnOp = op;

  return new Promise(resolve => {
    db.serialize(async () => {
      db.run('BEGIN TRANSACTION');

      for (let i = 0; i < sqlList.length; i++) {
        const success = await exports.runSql(db, sqlList[i], argsList[i]);
        if (!success) {
          db.run('ROLLBACK');
          db.inTxn = false;
          resolve(false);
          return;
        }
      }

      db.run('COMMIT', err => {
        if (err) {
          logger.error(`Failed to commit batch run: ${err}`);
          db.run('ROLLBACK');
          db.inTxn = false;
          resolve(false);
        } else {
          db.inTxn = false;
          resolve(true);
        }
      });
    });
  });
};

exports.getDailyTraffDb = testnetMode => {
  return testnetMode ? dbMap.testnetDailyTraffic.db : dbMap.mainnetDailyTraffic.db;
};

exports.getAccessControlDb = () => dbMap.accessControl.db;

exports.getRoutingDb = () => dbMap.routing.db;

exports.getSharingDb = () => dbMap.sharing.db;

exports.getTunnelDb = () => dbMap.tunnel.db;

exports.getAppRelocatorDb = () => dbMap.appRelocator.db;

exports.getWalletDb = () => dbMap.wallet.db;

exports.getCredentialDb = () => dbMap.credential.db;

exports.getDnsFilterDb = () => dbMap.dnsFilter.db;

exports.getHttpsFilterDb = () => dbMap.httpsFilter.db;

exports.getDefaultDb = () => dbMap.default.db;

exports.getDeeperWalletDb = () => dbMap.deeperWallet.db;
