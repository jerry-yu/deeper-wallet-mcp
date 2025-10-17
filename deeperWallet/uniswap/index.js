const logger = require('../log');
const axios = require('axios');
const to = require('await-to-js').default;
const Decimal = require('decimal.js');
const { ethers } = require('ethers');
const { Actions, V4Planner, SwapExactInSingle, toAddress } = require('@uniswap/v4-sdk');
const eth = require('../eth');
const commonUtil = require('../utils');
const {
  AllowanceTransfer,
  PERMIT2_ADDRESS,
  MaxAllowanceTransferAmount,
  MaxUint48,
  AllowanceProvider,
  MaxUint256,
} = require("@uniswap/permit2-sdk");

const { CommandType, RoutePlanner, ROUTER_AS_RECIPIENT } = require('@uniswap/universal-router-sdk');
const { getEthPrivateKey } = require('../utils');

// Import all the modularized components
const { 
  UNISWAP_V2_ROUTER, 
  UNISWAP_V2_FACTORY, 
  UNISWAP_V3_ROUTER, 
  UNISWAP_V3_FACTORY, 
  FEE_TIERS, 
  SELECTORS, 
  NETWORK_CONFIG, 
  COMMON_TOKENS, 
  ERROR_CODES 
} = require('./constants');

const { performanceCache } = require('./cache');
const { batchRpcManager, sendRpcRequest, sendCachedRpcRequest, sendMultipleRpcRequests } = require('./rpc');
const { 
  getRpcUrl, 
  getRandomUrl, 
  getNetworkConfig, 
  getCommonTokens, 
  isNetworkSupported, 
  getFeeTierName, 
  isValidAddress, 
  isValidAmount, 
  isValidSlippage, 
  isValidDeadline 
} = require('./utils');

const { 
  validateSwapParams, 
  validatePoolParams, 
  validateAndSanitizeParams 
} = require('./validation');

const { createError, getUserFriendlyErrorMessage, withErrorHandling } = require('./errors');

const { 
  encodeFunctionCall, 
  encodeAddress, 
  encodeUint256, 
  decodeHexToDecimal, 
  decodeAddress 
} = require('./encoding');

const { 
  calculateV2SwapOutput, 
  calculateV2SwapInput, 
  calculatePriceImpact, 
  applySlippage, 
  calculateV2Price, 
  calculateV3Price, 
  analyzePriceImpact, 
  validateLiquidity 
} = require('./calculations');

const { 
  getV2PairAddress, 
  getV3PoolAddress, 
  getV2PoolReserves, 
  getV3PoolData, 
  getPoolInfo, 
  poolExists, 
  getAllPools 
} = require('./pool');

const { getTokenPrice, getSwapQuote, getOptimalRoute, comparePrices } = require('./price');

const { getUniswapSpenderAddress, getApprovalCalldata } = require('./approval');

const { getTokenAllowance, checkTokenApproval } = require('./token');

const { encodeV2SwapData, encodeV3SwapData, selectOptimalRoute } = require('./swap');

Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

// Commonly used addresses From uniswap universal router sdk
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
const E_ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const SENDER_AS_RECIPIENT = '0x0000000000000000000000000000000000000001'

/**
 * Handle token approval with retry logic and validation
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Token owner address
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Required amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.retryDelay=2000] - Delay between retries in ms
 * @returns {Promise<Object>} Approval result with status and transaction details
 */
async function handleTokenApproval(password, fromAddress, tokenAddress, spenderAddress, amount, network, options = {}) {
  try {
    const { maxRetries = 1, retryDelay = 2000 } = options;

    // First check if approval is already sufficient
    const approvalStatus = await checkTokenApproval(network, tokenAddress, fromAddress, spenderAddress, amount);
    if (approvalStatus.error) {
      return {
        success: false,
        error: approvalStatus.error,
        needsApproval: true
      };
    }

    if (approvalStatus.isApproved) {
      return {
        success: true,
        alreadyApproved: true,
        currentAllowance: approvalStatus.currentAllowance,
        requiredAmount: amount,
        needsApproval: false
      };
    }

    // Need to execute approval transaction
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const approvalResult = await executeTokenApproval(
          password,
          fromAddress,
          tokenAddress,
          spenderAddress,
          amount,
          network
        );

        if (approvalResult) {
          // Wait a moment for transaction to be mined
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify approval was successful
          const verificationStatus = await checkTokenApproval(network, tokenAddress, fromAddress, spenderAddress, amount);

          if (verificationStatus.isApproved) {
            return {
              success: true,
              transactionHash: approvalResult.transactionHash,
              approvedAmount: amount,
              gasUsed: approvalResult.gasUsed,
              gasPrice: approvalResult.gasPrice,
              attempt,
              needsApproval: false
            };
          } else {
            lastError = new Error('Approval transaction succeeded but verification failed');
          }
        } else {
          lastError = new Error('Approval transaction failed');
        }
      } catch (error) {
        lastError = error;
        console.error(`Approval attempt ${attempt} failed:`, error.message);
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All approval attempts failed',
      attempts: maxRetries,
      needsApproval: true
    };
  } catch (error) {
    console.error('Error in handleTokenApproval:', error.message);
    return {
      success: false,
      error: error.message,
      needsApproval: true
    };
  }
}

/**
 * Execute token approval transaction
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Token owner address
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (usually router)
 * @param {string} amount - Amount to approve in wei
 * @param {string} network - Network name
 * @returns {Promise<Object|null>} Transaction result or null if error
 */
async function executeTokenApproval(password, fromAddress, tokenAddress, spenderAddress, amount, network) {
  try {
    // Import required modules
    const eth = require('../eth');
    const commonUtil = require('../utils');
    const to = require('await-to-js').default;

    // Validate inputs
    if (!isValidAddress(fromAddress) || !isValidAddress(tokenAddress) || !isValidAddress(spenderAddress)) {
      throw new Error('Invalid address format');
    }

    if (!isValidAmount(amount)) {
      throw new Error('Invalid amount');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Get transaction essentials (nonce, gas price)
    const txEssentials = await eth.get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }

    const { nonce, gas_price: gasPrice } = txEssentials;

    // Generate approval calldata
    const callData = getApprovalCalldata(spenderAddress, MaxUint256.toString());
    console.warn("==== approval callData:", callData);
    // Estimate gas for approval transaction
    const gas = await eth.estimate_gas(network, fromAddress, tokenAddress, 0, callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    // Calculate gas fee with multiplier (using same pattern as transferEthErc20)
    const GAS_PRICE_MULTIPLIER = 1.2; // 20% buffer
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));
    const gasFee = finalGasPrice * BigInt(gas);

    console.warn("==== approval gas:", gas, "gasPrice:", finalGasPrice.toString(), "gasFee (wei):", gasFee.toString());
    // Prepare payload for hardware wallet signing
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: tokenAddress,
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

    // Sign transaction using hardware wallet
    const jsonPayload = JSON.stringify(payload);
    console.warn("==== sign_tx payload:", jsonPayload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');

    // Get binary path (using same pattern as transferEthErc20)
    const DEEPER_WALLET_BIN_PATH = process.env.DEEPER_WALLET_BIN_PATH || 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';

    const [err, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
    if (err) {
      throw new Error('Failed to sign approval transaction');
    }
    console.warn("==== sign_tx output:", stdout);
    const [parseErr, signResult] = await to(commonUtil.jsonParse(stdout));
    if (parseErr || !signResult?.signature) {
      throw new Error(`Invalid sign_tx output: ${stdout}`);
    }

    // Send signed transaction
    const signedTransaction = `0x${signResult.signature.replace(/^"|"$/g, '')}`;
    const txHash = await eth.sendEthRawTransaction(network, signedTransaction);

    if (!txHash) {
      throw new Error('Failed to send approval transaction');
    }

    return {
      transactionHash: txHash
    };
  } catch (error) {
    console.error('Error executing token approval:', error.message);
    return null;
  }
}

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

const universalRouterAbi = [
  {
    "inputs": [
      { "internalType": "bytes", "name": "commands", "type": "bytes" },
      { "internalType": "bytes[]", "name": "inputs", "type": "bytes[]" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

function mapAddress(address, network) {
  if (address.startsWith('0x')) {
    return address.toLowerCase();
  } else {
    const mapped = getCommonTokens(network)[address];
    if (mapped && mapped.startsWith('0x')) {
      return mapped.toLowerCase();
    } else {
      throw new Error(`Address mapping not found for ${address} on ${network}`);
    }
  }
}

// V3 swap input
function v3Input(amountIn, amountOutMin, path, recipient, payerIsUser) {
  return ethers.utils.defaultAbiCoder.encode(
    [
      "address", // recipient
      "uint256", // amountIn
      "uint256", // amountOutMinimum
      "bytes", // path
      "bool" // payerIsUser
    ],
    [
      recipient, // recipient
      amountIn, // amountIn
      amountOutMin, // amountOutMinimum
      path, // path
      payerIsUser // payerIsUser
    ]
  );
}

// V3 path encoding
function v3PathEncode(tokenIn, tokenOut, fee) {
  return ethers.utils.solidityPack(
    ["address", "uint24", "address"],
    [tokenIn, fee, tokenOut]
  );
}

// sweep output
function sweepEncode(tokenOut, toAddress) {
  return ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "uint256"],
    [tokenOut, toAddress, 0]
  );
}

function unwrapEthEncode(toAddress, amoutMin) {
  return ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256"],
    [toAddress, amoutMin]
  );
}

async function permit2Encode(wallet, token, amount, spender) {
  try {
    const allowance = new AllowanceProvider(wallet.provider, PERMIT2_ADDRESS);
    const allowData = await allowance.getAllowanceData(token, wallet.address, spender);
    console.warn(`*********************************: ${token} ${wallet.address} ${spender}`);
    console.warn(`Permit2 allowance data: ${JSON.stringify(allowData)}`);
    if (BigInt(allowData.amount) >= BigInt(amount) && BigInt(allowData.expiration) > BigInt(Math.floor(Date.now() / 1000))) {
      // Sufficient allowance already granted
      return null;
    }

    const chainId = (await wallet.provider.getNetwork()).chainId;
    console.warn(`Using chain ID: ${chainId}`);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const permitSingle = {
      details: {
        token: token,
        amount: MaxAllowanceTransferAmount.toString(),
        expiration: MaxUint48.toString(),
        nonce: allowData.nonce,
      },
      spender: spender,
      sigDeadline: deadline,
    };

    const { domain, types, values } = AllowanceTransfer.getPermitData(
      permitSingle,
      PERMIT2_ADDRESS,
      chainId // chainId
    );

    const signature = await wallet._signTypedData(domain, types, values);

    const permit2PermitInput = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle",
        "bytes signature"
      ],
      [
        [
          [
            permitSingle.details.token,
            permitSingle.details.amount,
            permitSingle.details.expiration,
            permitSingle.details.nonce
          ],
          permitSingle.spender,
          permitSingle.sigDeadline
        ],
        signature
      ]
    );

    return permit2PermitInput;
  } catch (error) {
    console.error('Error signing Permit2 transfer:', error.message);
    throw error;
  }
}

function encodeV2SwapExactIn(recipient, amountIn, amountOutMin, tokenIn, tokenOut, payerIsUser) {
  const types = [
    'address',    // recipient
    'uint256',    // amountIn
    'uint256',    // amountOutMin
    'address[]',  // path
    'bool',       // payerIsUser
  ];

  const values = [
    recipient,
    amountIn,
    amountOutMin,
    [tokenIn, tokenOut],
    payerIsUser,
  ];

  return ethers.utils.defaultAbiCoder.encode(types, values);
}

/**
 * Execute a Uniswap swap transaction
 * @param {string} password - Wallet password
 * @param {string} fromAddress - Sender address
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @param {number} [options.slippage=0.5] - Slippage percentage
 * @param {number} [options.deadline] - Custom deadline (default: 20 minutes from now)
 * @param {string} [options.version] - Force specific version ('V2' or 'V3')
 * @param {number} [options.fee] - Force specific fee tier for V3
 * @returns {Promise<Object|null>} Transaction result or null if error
 */
async function executeSwap(password, fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network, options = {}) {
  try {
    // Import required modules
    network = network.toUpperCase();
    tokenIn = tokenIn.toLowerCase();
    tokenOut = tokenOut.toLowerCase();
    let isNativeIn = false;
    let isNativeOut = false;
    
    if (tokenIn === 'eth' || tokenIn ==='bnb') isNativeIn = true;
    if (tokenOut === 'eth' || tokenOut === 'bnb') isNativeOut = true;

    tokenIn = mapAddress(tokenIn, network);
    tokenOut = mapAddress(tokenOut, network);

    // Validate inputs
    const validation = validateSwapParams({ tokenIn, tokenOut, amountIn, network });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    if (!isValidAddress(fromAddress)) {
      throw new Error('Invalid sender address');
    }

    if (!isValidAmount(amountOutMin)) {
      throw new Error('Invalid minimum output amount');
    }

    if (!isNetworkSupported(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // Set default options
    const {
      slippage = 0.5,
      deadline = Math.floor(Date.now() / 1000) + 3600, // 60 minutes from now
      version = null,
      fee = FEE_TIERS.MEDIUM,
      tickSpacing = 60, // default tick spacing for 0.3% fee tier
    } = options;

    // Validate deadline 
    if (!isValidDeadline(deadline)) {
      throw new Error('Invalid deadline');
    }

    const routerAddress = getNetworkConfig(network).universalRouter;
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl(network));

    const universalRouter = new ethers.Contract(routerAddress, universalRouterAbi, provider);
    const sk = await getEthPrivateKey('', fromAddress);
    if (!sk) {
      throw new Error('Failed to get private key for signing');
    }
    console.warn("sk", sk);

    const signer = new ethers.Wallet(
      sk,
      provider
    );
    console.warn("Using address", signer.address);

    // Get optimal route if version not specified
    let routeInfo;
    if (version) {
      // Use specified version
      const config = getNetworkConfig(network);
      const routerAddress = version === 'V3' ? config.v3Router : config.v2Router;
      routeInfo = {
        version,
        routerAddress,
        fee: fee,
      };
    } else {
      // Find optimal route
      routeInfo = await selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage);
      if (!routeInfo) {
        throw new Error('No available swap route found');
      }
    }

    let callData;
    if (routeInfo.version === 'V2') {
      let commands = '0x';
      let inputs = [];
      let payerIsUser;
      const amountInBigInt = BigInt(amountIn);
      if (isNativeIn) {
        // wrap input
        const wrap = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [ROUTER_AS_RECIPIENT, amountInBigInt]
        );
        commands += '0b';
        inputs.push(wrap);
        payerIsUser = false
      } else {
        const res = await handleTokenApproval('', fromAddress, tokenIn, PERMIT2_ADDRESS, amountIn, network);
        console.warn("Approval result", res)
        payerIsUser = true;
        const permit = await permit2Encode(signer, tokenIn, amountIn, routerAddress);
        if (permit) {
          inputs.push(permit);
          commands += '0a';
        }
      }
      commands += '08'; // swapV2

      const swapV2Data = encodeV2SwapExactIn(ROUTER_AS_RECIPIENT, BigInt(amountIn), BigInt(amountOutMin), tokenIn, tokenOut, payerIsUser);
      inputs.push(swapV2Data);

      if (isNativeOut) {
        commands += '0c'; // unwrap
        //TODO: handle amountOutMin for unwrap
        const unwrap = unwrapEthEncode(fromAddress, 0x100);
        inputs.push(unwrap);
      } else {
        const sweep = sweepEncode(tokenOut, fromAddress);
        commands += '04'; // sweep
        inputs.push(sweep);
      }
      callData = universalRouter.interface.encodeFunctionData("execute", [
        commands,
        inputs,
        deadline
      ]);

    } else if (routeInfo.version === 'V3') {
      // Use Universal Router for V3 swaps
      let commands = '0x';
      let inputs = [];
      let payerIsUser;

      const amountInBigInt = BigInt(amountIn);
      if (isNativeIn) {
        // wrap input
        const wrap = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [ROUTER_AS_RECIPIENT, amountInBigInt]
        );
        commands += '0b';
        inputs.push(wrap);
        payerIsUser = false
      } else {
        const res = await handleTokenApproval('', fromAddress, tokenIn, PERMIT2_ADDRESS, amountIn, network);
        console.warn("Approval result", res)
        payerIsUser = true;
        const permit = await permit2Encode(signer, tokenIn, amountIn, routerAddress);
        if (permit) {
          inputs.push(permit);
          commands += '0a';
        }
      }
      commands += '00'; // swapV3

      const path = v3PathEncode(tokenIn, tokenOut, routeInfo.fee);
      const swapV3Input = v3Input(amountInBigInt, amountOutMin, path, ROUTER_AS_RECIPIENT, payerIsUser);

      inputs.push(swapV3Input);
      if (isNativeOut) {
        commands += '0c'; // unwrap
        //TODO: handle amountOutMin for unwrap
        const unwrap = unwrapEthEncode(fromAddress, 0x100);
        inputs.push(unwrap);
      } else {
        const sweep = sweepEncode(tokenOut, fromAddress);
        commands += '04'; // sweep
        inputs.push(sweep);
      }
      callData = universalRouter.interface.encodeFunctionData("execute", [
        commands,
        inputs,
        deadline
      ]);
    } else if (routeInfo.version === 'V4') {

      const tokenInNorm = isNativeIn ? ZERO_ADDRESS : tokenIn.toLocaleLowerCase();
      const tokenOutNorm = isNativeOut ? ZERO_ADDRESS : tokenOut.toLocaleLowerCase();

      const currency0 = tokenInNorm < tokenOutNorm ? tokenInNorm : tokenOutNorm;
      const currency1 = tokenInNorm < tokenOutNorm ? tokenOutNorm : tokenInNorm;

      const zeroForOne = tokenInNorm === currency0;
      let commands = '0x';
      let inputs = [];

      if (!isNativeIn) {
        const res = await handleTokenApproval('', fromAddress, tokenIn, PERMIT2_ADDRESS, amountIn, network);
        console.warn("Approval result", res)
        payerIsUser = true;
        const permit = await permit2Encode(signer, tokenIn, amountIn, routerAddress);
        if (permit) {
          inputs.push(permit);
          commands += '0a';
        }
      }

      const swapExactInSingle = {
        poolKey: {
          currency0: currency0,
          currency1: currency1,
          fee: fee,
          tickSpacing: tickSpacing,
          hooks: "0x0000000000000000000000000000000000000000",
        },
        zeroForOne: zeroForOne, // The direction of swap is ETH to USDC. Change it to 'false' for the reverse direction
        amountIn: amountIn, // Amount of input token to swap
        amountOutMinimum: amountOutMin, // Minimum amount of output token to receive
        hookData: '0x'
      };

      console.warn("swapExactInSingle", swapExactInSingle)

      const v4Planner = new V4Planner()

      v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapExactInSingle]);
      v4Planner.addAction(Actions.SETTLE_ALL, [tokenInNorm, swapExactInSingle.amountIn]);
      v4Planner.addAction(Actions.TAKE_ALL, [tokenOutNorm, swapExactInSingle.amountOutMinimum]);

      const v4CallData = v4Planner.finalize()
      commands += '10'; // swapV4
      inputs.push(v4CallData);

      console.log("encodedActions", v4CallData)

      const universalRouter2 = new ethers.Contract(
        routerAddress, universalRouterAbi,
        signer
      )

      // Only needed for native ETH as input currency swaps
      const txOptions = {
        value: isNativeIn ? amountIn : 0,
        //gasLimit: 300000n
      }

      const tx = await universalRouter2.execute(
        commands,
        inputs,
        deadline,
        txOptions
      )
      console.warn('Transaction sent! Hash:', tx.hash);

      const receipt = await tx.wait()
      console.warn('Swap completed! Transaction hash:', receipt.transactionHash)
      return {
        transactionHash: receipt.transactionHash,

      };

    } else {
      throw new Error('Unknown Uniswap version');
    }

    const txEssentials = await eth.get_tx_essential_elem(network, fromAddress);
    if (!txEssentials) {
      throw new Error('Failed to get transaction essentials');
    }

    const { nonce, gas_price: gasPrice } = txEssentials;

    // Estimate gas for swap transaction
    const gas = await eth.estimate_gas(network, fromAddress, routerAddress, isNativeIn ? amountIn : 0, callData.startsWith('0x') ? callData : '0x' + callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    //const gas = 30000000n; // Set a high gas limit for complex transactions

    // Calculate gas fee with multiplier
    const GAS_PRICE_MULTIPLIER = 1.2; // 20% buffer
    const finalGasPrice = BigInt(Math.round(gasPrice * GAS_PRICE_MULTIPLIER));

    // Prepare payload for hardware wallet signing
    const payload = {
      method: 'sign_tx',
      param: {
        chain_type: 'ETHEREUM',
        address: fromAddress,
        input: {
          nonce: nonce.toString(),
          to: routerAddress,
          value: isNativeIn ? amountIn.toString() : '0',
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

    // Sign transaction using hardware wallet
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');

    // Get binary path
    const DEEPER_WALLET_BIN_PATH = process.env.DEEPER_WALLET_BIN_PATH || 'D:\\git_resp\\hd-wallet\\target\\release\\hd-wallet.exe';

    const [err, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH} "${escapedPayload}"`);
    if (err) {
      throw new Error('Failed to sign swap transaction');
    }

    const [parseErr, signResult] = await to(commonUtil.jsonParse(stdout));
    if (parseErr || !signResult?.signature) {
      throw new Error(`Invalid sign_tx output: ${stdout}`);
    }

    // Send signed transaction
    const signedTransaction = `0x${signResult.signature.replace(/^"|"`/g, '')}`;
    const txHash = await eth.sendEthRawTransaction(network, signedTransaction);

    if (!txHash) {
      throw new Error('Failed to send swap transaction');
    }

    return {
      transactionHash: txHash,
      version: routeInfo.version,
      routerAddress: routerAddress
    };
  } catch (error) {
    console.error('Error executing swap:', error.message);
    return null;
  }
}

/**
 * Prepare swap transaction data without executing it
 * @param {string} fromAddress - Sender address
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Input amount in wei
 * @param {string} amountOutMin - Minimum output amount in wei
 * @param {string} network - Network name
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object|null>} Transaction preparation result or null if error
 */
async function prepareSwapTransaction(fromAddress, tokenIn, tokenOut, amountIn, amountOutMin, network, options = {}) {
  try {
    // Import required modules
    const eth = require('../eth');

    // Validate inputs
    const validation = validateSwapParams({ tokenIn, tokenOut, amountIn, network });
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    if (!isValidAddress(fromAddress)) {
      throw new Error('Invalid sender address');
    }

    // Set default options
    const {
      slippage = 0.5,
      deadline = Math.floor(Date.now() / 1000) + 1200,
      version = null,
      fee = null
    } = options;

    // Get optimal route
    let routeInfo;
    if (version) {
      const config = getNetworkConfig(network);
      routeInfo = {
        version,
        routerAddress: version === 'V3' ? config.v3Router : config.v2Router,
        fee: fee || FEE_TIERS.MEDIUM
      };
    } else {
      routeInfo = await selectOptimalRoute(network, tokenIn, tokenOut, amountIn, slippage);
      if (!routeInfo) {
        throw new Error('No available swap route found');
      }
    }

    // Check token approval status
    const approvalStatus = await checkTokenApproval(
      network,
      tokenIn,
      fromAddress,
      routeInfo.routerAddress,
      amountIn
    );

    // Generate transaction data
    let callData;
    if (routeInfo.version === 'V2') {
      callData = encodeV2SwapData(tokenIn, tokenOut, amountIn, amountOutMin, fromAddress, deadline);
    } else if (routeInfo.version === 'V3') {
      callData = encodeV3SwapData(tokenIn, tokenOut, routeInfo.fee, amountIn, amountOutMin, fromAddress, deadline);
    } else {
      throw new Error('Unknown Uniswap version');
    }

    // Estimate gas
    const gas = await eth.estimate_gas(network, fromAddress, routeInfo.routerAddress, 0, callData.startsWith('0x') ? callData : '0x' + callData);
    if (!gas) {
      throw new Error('Failed to estimate gas');
    }

    // Get gas price
    const gasPrice = await eth.getEthGasPrice(network);
    if (!gasPrice) {
      throw new Error('Failed to get gas price');
    }

    const finalGasPrice = BigInt(Math.round(gasPrice * 1.2));
    const gasFee = finalGasPrice * BigInt(gas);

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      version: routeInfo.version,
      routerAddress: routeInfo.routerAddress,
      poolAddress: routeInfo.poolAddress,
      fee: routeInfo.fee,
      callData,
      gasEstimate: gas,
      gasPrice: finalGasPrice.toString(),
      gasFee: gasFee.toString(),
      deadline,
      approvalRequired: !approvalStatus.isApproved,
      currentAllowance: approvalStatus.currentAllowance,
      requiredAmount: amountIn,
      priceImpact: routeInfo.priceImpact
    };
  } catch (error) {
    console.error('Error preparing swap transaction:', error.message);
    return null;
  }
}

module.exports = {
  // Constants
  UNISWAP_V2_ROUTER,
  UNISWAP_V2_FACTORY,
  UNISWAP_V3_ROUTER,
  UNISWAP_V3_FACTORY,
  FEE_TIERS,
  SELECTORS,
  NETWORK_CONFIG,
  COMMON_TOKENS,
  ERROR_CODES,

  // Basic utility functions
  getNetworkConfig,
  getCommonTokens,
  isNetworkSupported,
  getFeeTierName,
  isValidAddress,
  isValidAmount,

  // Uniswap calculation utilities
  calculateV2SwapOutput,
  calculateV2SwapInput,
  calculatePriceImpact,
  applySlippage,

  // Hex encoding/decoding utilities
  encodeFunctionCall,
  encodeAddress,
  encodeUint256,
  decodeHexToDecimal,
  decodeAddress,

  // Token approval handling
  getTokenAllowance,
  checkTokenApproval,
  getApprovalCalldata,
  executeTokenApproval,
  handleTokenApproval,
  getUniswapSpenderAddress,

  // Input validation utilities
  validateSwapParams,
  validatePoolParams,
  isValidSlippage,
  isValidDeadline,
  validateAndSanitizeParams,

  // Error handling utilities
  createError,
  getUserFriendlyErrorMessage,
  analyzePriceImpact,
  validateLiquidity,
  withErrorHandling,

  // Pool query functionality
  getV2PairAddress,
  getV3PoolAddress,
  getV2PoolReserves,
  getV3PoolData,
  getPoolInfo,
  poolExists,
  getAllPools,

  // Token price and quote functionality
  calculateV2Price,
  calculateV3Price,
  getTokenPrice,
  getSwapQuote,
  getOptimalRoute,
  comparePrices,

  // Swap transaction functionality
  encodeV2SwapData,
  encodeV3SwapData,
  selectOptimalRoute,
  executeSwap,
  prepareSwapTransaction
};