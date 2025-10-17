const logger = require('../log');
const axios = require('axios');
const to = require('await-to-js').default;
const { ethers } = require('ethers');
const eth = require('../eth');
const commonUtil = require('../utils');
const { NETWORK_CONFIG, COMMON_TOKENS, FEE_TIERS } = require('./constants');

// RPC URLs for different networks (copied from eth.js)
const rpcUrls = {
  'ETHEREUM-SEPOLIA': [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.gateway.tenderly.co',
  ],
  'ETHEREUM': [
    'https://eth-mainnet.public.blastapi.io',
    'https://eth.llamarpc.com',
    'https://ethereum-rpc.publicnode.com',
  ],
  'ARBITRUM': [
    'https://arbitrum-rpc.publicnode.com',
    'https://arbitrum.llamarpc.com',
    'https://arbitrum-one-rpc.publicnode.com',
  ],
  'ARBITRUM-TESTNET': [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public',
    'https://arbitrum-sepolia.gateway.tenderly.co',
  ],
  'OPTIMISM': [
    'https://optimism-rpc.publicnode.com',
    'https://optimism.llamarpc.com',
    'https://rpc.ankr.com/optimism'
  ],
  'OPTIMISM-TESTNET': [
    'https://api.zan.top/opt-sepolia',
    'https://optimism-sepolia-rpc.publicnode.com',
    'https://optimism-sepolia.drpc.org',
  ],
  'BASE': [
    'https://base.llamarpc.com',
    'https://developer-access-mainnet.base.org',
    'https://base-mainnet.public.blastapi.io',
  ],
  'BASE-TESTNET': [
    'https://base-sepolia-rpc.publicnode.com',
    'https://sepolia.base.org',
    'https://base-sepolia.gateway.tenderly.co',
  ],
  'BNBSMARTCHAIN': [
    'https://bsc-dataseed2.bnbchain.org',
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed2.defibit.io',
  ],
  'BNBSMARTCHAIN-TESTNET': [
    'https://bsc-testnet.public.blastapi.io',
    'https://data-seed-prebsc-2-s2.bnbchain.org:8545',
    'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  ],
};

// ============================================================================
// RPC UTILITY FUNCTIONS
// ============================================================================

/**
 * Get random RPC URL from available URLs
 * @param {Array} urls - Array of RPC URLs
 * @returns {string} Random RPC URL
 */
function getRandomUrl(urls) {
  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex];
}

/**
 * Get RPC URL for a network
 * @param {string} network - Network name
 * @returns {string|null} RPC URL or null if network not supported
 */
function getRpcUrl(network) {
  const urls = rpcUrls[network];
  if (!urls) {
    return null;
  }
  return getRandomUrl(urls);
}

/**
 * Get network configuration for Uniswap contracts
 * @param {string} network - Network name (e.g., 'ETHEREUM', 'ETHEREUM-SEPOLIA')
 * @returns {Object|null} Network configuration object or null if not supported
 */
function getNetworkConfig(network) {
  const config = NETWORK_CONFIG[network.toUpperCase()];
  if (!config) {
    console.error(`Unsupported network for Uniswap: ${network}`);
    return null;
  }
  return config;
}

/**
 * Get common token addresses for a network
 * @param {string} network - Network name
 * @returns {Object} Token addresses object
 */
function getCommonTokens(network) {
  return COMMON_TOKENS[network.toUpperCase()] || {};
}

/**
 * Check if a network supports Uniswap
 * @param {string} network - Network name
 * @returns {boolean} True if network is supported
 */
function isNetworkSupported(network) {
  return !!NETWORK_CONFIG[network.toUpperCase()];
}

/**
 * Get fee tier name from fee amount
 * @param {number} fee - Fee amount in basis points
 * @returns {string} Fee tier name
 */
function getFeeTierName(fee) {
  switch (fee) {
    case FEE_TIERS.LOW:
      return 'LOW';
    case FEE_TIERS.MEDIUM:
      return 'MEDIUM';
    case FEE_TIERS.HIGH:
      return 'HIGH';
    default:
      return 'CUSTOM';
  }
}

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid address format
 */
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate amount string (should be numeric)
 * @param {string} amount - Amount to validate
 * @returns {boolean} True if valid amount
 */
function isValidAmount(amount) {
  try {
    const num = BigInt(amount);
    return num >= 0n;
  } catch {
    return false;
  }
}

/**
 * Validate slippage percentage
 * @param {number} slippage - Slippage percentage
 * @returns {boolean} True if valid slippage
 */
function isValidSlippage(slippage) {
  return typeof slippage === 'number' && slippage >= 0 && slippage <= 50; // Max 50% slippage
}

/**
 * Validate deadline timestamp
 * @param {number} deadline - Unix timestamp
 * @returns {boolean} True if valid deadline
 */
function isValidDeadline(deadline) {
  if (typeof deadline !== 'number' || !Number.isInteger(deadline)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const maxDeadline = now + 3600; // Max 1 hour from now
  const minDeadline = now + 60; // Min 1 minute from now

  return deadline >= minDeadline && deadline <= maxDeadline;
}

module.exports = {
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
};