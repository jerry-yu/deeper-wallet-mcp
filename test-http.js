/**
 * 测试HTTP请求到Uniswap subgraph
 */

async function testHttpRequest() {
  try {
    // 使用Node.js内置的fetch (Node 18+) 或者axios
    let fetch;
    try {
      fetch = globalThis.fetch;
    } catch {
      // 如果没有内置fetch，使用axios
      const axios = require('axios');
      fetch = async (url, options) => {
        const response = await axios({
          url,
          method: options.method || 'GET',
          headers: options.headers,
          data: options.body
        });
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.data
        };
      };
    }

    const endpoint = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
    const query = `
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
          totalValueLockedUSD
        }
      }
    `;

    console.log('发送请求到:', endpoint);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { limit: 3 }
      })
    });

    console.log('响应状态:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    console.log('成功获取数据:');
    console.log('池子数量:', data.data.pools.length);
    data.data.pools.forEach((pool, index) => {
      console.log(`${index + 1}. ${pool.token0.symbol}/${pool.token1.symbol} - TVL: $${parseFloat(pool.totalValueLockedUSD).toLocaleString()}`);
    });

  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

testHttpRequest();