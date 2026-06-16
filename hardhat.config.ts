import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const vinuChainRpcUrl = process.env.VINUCHAIN_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const vinuChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");

// Explorer verification env vars:
//   VINUCHAIN_EXPLORER_API_URL  — e.g. https://explorer.vinuchain.org/api
//   VINUCHAIN_EXPLORER_URL      — e.g. https://explorer.vinuchain.org
//   VINUCHAIN_EXPLORER_API_KEY  — API key if required (may be any non-empty string)
// TODO: confirm the VinuChain explorer verify API endpoint and update these values.
const vinuChainExplorerApiUrl = process.env.VINUCHAIN_EXPLORER_API_URL || "https://explorer.vinuchain.org/api";
const vinuChainExplorerUrl = process.env.VINUCHAIN_EXPLORER_URL || "https://explorer.vinuchain.org";
const vinuChainExplorerApiKey = process.env.VINUCHAIN_EXPLORER_API_KEY || "placeholder";

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
