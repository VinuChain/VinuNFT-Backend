import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const vinuChainRpcUrl = process.env.VINUCHAIN_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const vinuChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");

// Explorer verification env vars (override for testnet, chainId 206, https://testnet.vinuscan.com):
//   VINUCHAIN_EXPLORER_API_URL  — Blockscout Etherscan-compatible /api endpoint
//   VINUCHAIN_EXPLORER_URL      — browser URL shown in verify output
//   VINUCHAIN_EXPLORER_API_KEY  — Blockscout accepts any non-empty string; no secret required
// VinuScan is Blockscout-based; apiURL uses Blockscout's Etherscan-compatible /api route.
// Values sourced from VinuScan-Frontend src/config/networks.js; confirm on first real `hardhat verify`.
const vinuChainExplorerApiUrl = process.env.VINUCHAIN_EXPLORER_API_URL || "https://vinuscan.com/api";
const vinuChainExplorerUrl = process.env.VINUCHAIN_EXPLORER_URL || "https://vinuscan.com";
const vinuChainExplorerApiKey = process.env.VINUCHAIN_EXPLORER_API_KEY || "vinuscan";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: vinuChainRpcUrl && deployerPrivateKey ? {
    vinuchain: {
      url: vinuChainRpcUrl,
      chainId: vinuChainId,
      accounts: [deployerPrivateKey],
    },
  } : {},
  // Explorer source verification config for `hardhat verify`.
  // Driven entirely by env vars — no secrets are hardcoded here.
  etherscan: {
    apiKey: {
      vinuchain: vinuChainExplorerApiKey,
    },
    customChains: [
      {
        network: "vinuchain",
        chainId: vinuChainId,
        urls: {
          apiURL: vinuChainExplorerApiUrl,
          browserURL: vinuChainExplorerUrl,
        },
      },
    ],
  },
};

export default config;
