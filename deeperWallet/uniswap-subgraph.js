/**
 * Uniswap Subgraph Query Module
 * 支持 V2, V3, V4 版本的 subgraph 查询
 */

const axios = require('axios');

// Uniswap Subgraph 端点
const SUBGRAPH_ENDPOINTS = {
  v2: {
    mainnet: 'https://gateway.thegraph.com/api/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum',
  },
  v3: {
    mainnet: 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    bsc: 'https://gateway.thegraph.com/api/subgraphs/id/Hv1GncLY5docZoGtXjo4kwbTvxm3MAhVZqBZE4sUT9eZ'
  },
  v4: {
    mainnet: 'https://gateway.thegraph.com/api/subgraphs/id/DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G'
  },
};

/**
 * 执行 GraphQL 查询
 */
async function executeQuery(endpoint, query, variables = {}) {
  try {
    const response = await axios({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 538b0e51ce592995bd47d353d9aebb93',
      },
      data: {
        query,
        variables
      },
      timeout: 10000 // 10秒超时
    });

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    console.log("response.data ========", JSON.stringify(response.data) )

    return response.data.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP error! status: ${error.response.status}`);
    }
    throw new Error(`Query execution failed: ${error.message}`);
  }
}

/**
 * V2 查询：获取两个token的pool信息
 */
async function getV2PoolInfo(token0Address, token1Address, network = 'mainnet') {
  const endpoint = SUBGRAPH_ENDPOINTS.v2[network];
  if (!endpoint) {
    throw new Error(`Unsupported network for V2: ${network}`);
  }

  const query = `
    query GetV2Pool($token0: String!, $token1: String!) {
      pairs(
        where: {
          or: [
            { token0: $token0 ,token1: $token1 },
            { token0: $token1 ,token1: $token0 }
          ]
        }
        orderBy: reserveUSD
        orderDirection: desc
        first: 5
      ) {
        id
        token0 {
          id
          symbol
          name
          decimals
        }
        token1 {
          id
          symbol
          name
          decimals
        }
        reserve0
        reserve1
        reserveUSD
        totalSupply
        volumeUSD
        txCount
        createdAtTimestamp
        createdAtBlockNumber
      }
    }
  `;

  return executeQuery(endpoint, query, {
    token0: token0Address.toLowerCase(),
    token1: token1Address.toLowerCase()
  });
}

/**
 * V3 查询：获取两个token的pool信息
 */
async function getV3PoolInfo(token0Address, token1Address, network = 'mainnet') {
  const endpoint = SUBGRAPH_ENDPOINTS.v3[network];
  if (!endpoint) {
    throw new Error(`Unsupported network for V3: ${network}`);
  }

  const query = `
    query GetV3Pool($token0: String!, $token1: String!) {
      pools(
        where: {
          or: [
            { and: [{ token0: $token0 }, { token1: $token1 }] }
            { and: [{ token0: $token1 }, { token1: $token0 }] }
          ]
        }
        orderBy: totalValueLockedUSD
        orderDirection: desc
        first: 10
      ) {
        id
        token0 {
          id
          symbol
          name
          decimals
        }
        token1 {
          id
          symbol
          name
          decimals
        }
        feeTier
        liquidity
        sqrtPrice
        tick
        token0Price
        token1Price
        volumeUSD
        txCount
        totalValueLockedToken0
        totalValueLockedToken1
        totalValueLockedUSD
        createdAtTimestamp
        createdAtBlockNumber
      }
    }
  `;

  return executeQuery(endpoint, query, {
    token0: token0Address.toLowerCase(),
    token1: token1Address.toLowerCase()
  });
}

/**
 * V4 查询：获取两个token的pool信息
 */
async function getV4PoolInfo(token0Address, token1Address, network = 'mainnet') {
  const endpoint = SUBGRAPH_ENDPOINTS.v4[network];
  if (!endpoint) {
    throw new Error(`Unsupported network for V4: ${network}`);
  }

  const query = `
    query GetV4Pool($token0: String!, $token1: String!) {
      pools(
        where: {
          or: [
            { and: [{ token0: $token0 }, { token1: $token1 }] }
            { and: [{ token0: $token1 }, { token1: $token0 }] }
          ]
        }
        orderBy: totalValueLockedUSD
        orderDirection: desc
        first: 10
      ) {
        id
        token0 {
          id
          symbol
          name
          decimals
        }
        token1 {
          id
          symbol
          name
          decimals
        }
        feeTier
        tickSpacing
        liquidity
        sqrtPrice
        tick
        totalValueLockedToken0
        totalValueLockedToken1
        totalValueLockedUSD
        volumeUSD
        txCount
        createdAtTimestamp
        createdAtBlockNumber
      }
    }
  `;

  return executeQuery(endpoint, query, {
    token0: token0Address.toLowerCase(),
    token1: token1Address.toLowerCase()
  });
}

/**
 * 获取token信息
 */
async function getTokenInfo(tokenAddress, version = 'v3', network = 'mainnet') {
  const endpoint = SUBGRAPH_ENDPOINTS[version][network];
  if (!endpoint) {
    throw new Error(`Unsupported network for ${version}: ${network}`);
  }

  const query = `
    query GetToken($tokenAddress: String!) {
      token(id: $tokenAddress) {
        id
        symbol
        name
        decimals
        totalSupply
        volume
        volumeUSD
        txCount
        totalValueLocked
        totalValueLockedUSD
        derivedETH
      }
    }
  `;

  return executeQuery(endpoint, query, {
    tokenAddress: tokenAddress.toLowerCase()
  });
}

/**
 * 获取热门pools
 */
async function getTopPools(version = 'v3', network = 'mainnet', limit = 10) {
  const endpoint = SUBGRAPH_ENDPOINTS[version][network];
  if (!endpoint) {
    throw new Error(`Unsupported network for ${version}: ${network}`);
  }

  let query;
  if (version === 'v2') {
    query = `
      query GetTopPools($limit: Int!) {
        pairs(
          orderBy: reserveUSD
          orderDirection: desc
          first: $limit
        ) {
          id
          token0 {
            id
            symbol
            name
          }
          token1 {
            id
            symbol
            name
          }
          reserve0
          reserve1
          reserveUSD
          volumeUSD
          txCount
        }
      }
    `;
  } else {
    query = `
      query GetTopPools($limit: Int!) {
        pools(
          orderBy: totalValueLockedUSD
          orderDirection: desc
          first: $limit
        ) {
          id
          token0 {
            id
            symbol
            name
          }
          token1 {
            id
            symbol
            name
          }
          feeTier
          liquidity
          totalValueLockedUSD
          volumeUSD
          txCount
        }
      }
    `;
  }
  return executeQuery(endpoint, query, { limit });
}

/**
 * 搜索pools by token symbol
 */
async function searchPoolsBySymbol(symbol, version = 'v3', network = 'mainnet', limit = 10) {
  const endpoint = SUBGRAPH_ENDPOINTS[version][network];
  if (!endpoint) {
    throw new Error(`Unsupported network for ${version}: ${network}`);
  }

  let query;
  if (version === 'v2') {
    query = `
      query SearchPools($symbol: String!, $limit: Int!) {
        pairs(
          where: {
            or: [
              { token0_: { symbol_contains_nocase: $symbol } }
              { token1_: { symbol_contains_nocase: $symbol } }
            ]
          }
          orderBy: reserveUSD
          orderDirection: desc
          first: $limit
        ) {
          id
          token0 {
            id
            symbol
            name
          }
          token1 {
            id
            symbol
            name
          }
          reserve0
          reserve1
          reserveUSD
          volumeUSD
        }
      }
    `;
  } else {
    query = `
      query SearchPools($symbol: String!, $limit: Int!) {
        pools(
          where: {
            or: [
              { token0_: { symbol_contains_nocase: $symbol } }
              { token1_: { symbol_contains_nocase: $symbol } }
            ]
          }
          orderBy: totalValueLockedUSD
          orderDirection: desc
          first: $limit
        ) {
          id
          token0 {
            id
            symbol
            name
          }
          token1 {
            id
            symbol
            name
          }
          feeTier
          totalValueLockedUSD
          volumeUSD
        }
      }
    `;
  }

  return executeQuery(endpoint, query, { symbol, limit });
}

module.exports = {
  getV2PoolInfo,
  getV3PoolInfo,
  getV4PoolInfo,
  getTokenInfo,
  getTopPools,
  searchPoolsBySymbol,
  SUBGRAPH_ENDPOINTS
};