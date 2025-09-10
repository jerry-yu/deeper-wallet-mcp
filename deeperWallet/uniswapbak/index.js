const { Token, TradeType, CurrencyAmount, Percent } = require('@uniswap/sdk-core');
const { Pool, Route } = require('@uniswap/v3-sdk');
const { AlphaRouter } = require('@uniswap/smart-order-router');
const { ethers } = require('ethers');
const { abi: IUniswapV3PoolABI } = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json');
const { DEEPER_WALLET_BIN_PATH, getNetwork } = require('../index');
const commonUtil = require('../utils');
const to = require('await-to-js').to;

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.infura.io/v3/4f87dbb8dbe84446a43d31e23433a469');

async function getPoolState(poolAddress) {
    const poolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI, provider);
    const [liquidity, slot0] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0(),
    ]);
    return {
        liquidity,
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
    };
}

const getPoolInfo = async (poolAddress, tokenA, tokenB) => {
    const poolState = await getPoolState(poolAddress);
    const pool = new Pool(
        tokenA,
        tokenB,
        3000, // fee
        poolState.sqrtPriceX96.toString(),
        poolState.liquidity.toString(),
        poolState.tick
    );
    return pool;
};

const getPoolList = async () => {
    // For now, returning a hardcoded list of pools for Sepolia
    // In a real application, this would come from a service like the Uniswap subgraph
    return [
        {
            name: "WETH/USDT",
            address: "0x9799b5edc1aa7d3fad350309b08df3f64914e244", // Sepolia WETH/USDT pool
            tokenA: new Token(11155111, '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', 18, 'WETH', 'Wrapped Ether'),
            tokenB: new Token(11155111, '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', 6, 'USDT', 'Tether USD')
        }
    ];
};

const getSwapQuote = async (tokenIn, tokenOut, amountIn) => {
    const route = await getBestRoute(tokenIn, tokenOut, amountIn);
    if (!route) return null;
    return route.quote.toSignificant(6);
};

const getBestRoute = async (tokenIn, tokenOut, amountIn) => {
    const router = new AlphaRouter({ chainId: 11155111, provider: provider });
    const amount = CurrencyAmount.fromRawAmount(tokenIn, amountIn);
    const route = await router.route(
        amount,
        tokenOut,
        TradeType.EXACT_INPUT,
        {
            recipient: '0x0000000000000000000000000000000000000000', // dummy recipient
            slippageTolerance: new Percent(5, 100), // 5% slippage
            deadline: Math.floor(Date.now() / 1000 + 1800) // 30 minutes
        }
    );
    return route;
};

const swapTokens = async (route, fromAddress, password) => {
    const { to: routerAddress, data, value } = route.methodParameters;
    const tx = {
        to: routerAddress,
        data,
        value,
        from: fromAddress,
        chainId: 11155111,
    };

    const nonce = await provider.getTransactionCount(fromAddress);
    const gasPrice = await provider.getGasPrice();
    const gasLimit = await wallet.estimateGas(tx);

    const payload = {
        method: 'sign_tx',
        param: {
            chain_type: 'ETHEREUM',
            address: fromAddress,
            input: {
                nonce: nonce.toString(),
                to: routerAddress,
                value: value.toString(),
                gas_price: gasPrice.toString(),
                gas: gasLimit.toString(),
                data: data,
                network: getNetwork('sepolia'),
            },
            key: {
                Password: password,
            },
        },
    };

    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/"/g, '\\"');
    const [err, stdout] = await commonUtil.exec(`${DEEPER_WALLET_BIN_PATH}  "${escapedPayload}" `);
    if (err) {
        console.error(`Failed to sign transaction`);
        return null;
    }
    const [err2, obj] = await to(commonUtil.jsonParse(stdout));
    if (err2 || !obj?.signature) {
        console.error(`Invalid sign_tx output: ${stdout}`);
        return null;
    }

    const txResponse = await provider.sendTransaction(obj.signature);
    return txResponse;
};

module.exports = {
  getPoolInfo,
  getPoolList,
  getSwapQuote,
  getBestRoute,
  swapTokens,
};