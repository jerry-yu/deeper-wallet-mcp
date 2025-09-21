const childProcess = require('child_process');
const to = require('await-to-js').default;

const DEEPER_WALLET_BIN_PATH = 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';

function convertHexToDecimalString(str) {
  if (str.startsWith('0x')) {
    const decimalValue = parseInt(str, 16).toString();
    return decimalValue;
  } else {
    return str;
  }
}

function hexToString(hex) {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }
  const offset = hexToDecimal(hex.slice(0, 64));
  const length = hexToDecimal(hex.slice(64, 128));

  const dataStart = 64 + offset * 2;
  const encodedData = hex.slice(dataStart, dataStart + length * 2);
  const buffer = Buffer.from(encodedData, 'hex');
  return buffer.toString('utf8');
}

function hexToDecimal(hexStr) {
  if (hexStr.startsWith('0x')) {
    hexStr = hexStr.slice(2);
  }
  hexStr = hexStr.replace(/^0+/, '') || '0';
  return parseInt(hexStr, 16);
}

const exec = async (command, options) => {
  const arr = await new Promise(resolve => {
    childProcess.exec(command, options || {}, (error, stdout, stderr) => {
      resolve([error, stdout, stderr]);
    });
  });

  return arr;
};

const jsonParse = async str => {
  return JSON.parse(str);
};

async function getEthPrivateKey(password,fromAddress) {
  const payload = {
      method: 'export_private_key',
      param: {
        chain_type: 'ETHEREUM',
        network: '',
        main_address: fromAddress,
        path:'',
        password: password,
      },
    };
  
    const jsonPayload = JSON.stringify(payload);
    console.error(`------ ${jsonPayload}`);

    const escapedPayload = jsonPayload.replace(/"/g, '\\"');
    const [error, stdout] = await exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
    if (error) {
      console.error(`Failed to get private key: ${error}`);
      return null;
    }
      const [error2, obj] = await to(jsonParse(stdout));
      if (error2 || !obj?.value) {
        console.error(`Invalid export private key: ${stdout}`);
        return null;
      }
    return obj.value;
}

module.exports = {
  convertHexToDecimalString,
  hexToString,
  hexToDecimal,
  exec,
  jsonParse,
  getEthPrivateKey,
  DEEPER_WALLET_BIN_PATH,
};
