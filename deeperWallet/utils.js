const childProcess = require('child_process');


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

module.exports = {
  convertHexToDecimalString,
  hexToString,
  hexToDecimal,
  exec,
  jsonParse,
};
