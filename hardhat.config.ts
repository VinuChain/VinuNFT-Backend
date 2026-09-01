import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const vinuChainRpcUrl = process.env.VINUCHAIN_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const vinuChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");

// Explorer verification env vars:
//   VINUCHAIN_EXPLORER_API_URL  — Blockscout Etherscan-compatible /api endpoint
//   VINUCHAIN_EXPLORER_URL      — browser URL shown in verify output
//   VINUCHAIN_EXPLORER_API_KEY  — Blockscout accepts any non-empty string; no secret required
//
// The defaults below are confirmed, not assumed: mainnet.vinuexplorer.org is
// Blockscout and serves module=contract&action=getsourcecode unauthenticated
// for all three deployed contracts (scripts/verify-deployment-record.mjs runs
// exactly that call). The previous defaults pointed at vinuscan.com, which no
// longer resolves at all — as does testnet.vinuscan.com, which is why no
// VinuChain testnet is reachable from here.
const vinuChainExplorerApiUrl = process.env.VINUCHAIN_EXPLORER_API_URL || "https://mainnet.vinuexplorer.org/api";
const vinuChainExplorerUrl = process.env.VINUCHAIN_EXPLORER_URL || "https://mainnet.vinuexplorer.org";
const vinuChainExplorerApiKey = process.env.VINUCHAIN_EXPLORER_API_KEY || "vinuchain";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Pinned, not inherited. Hardhat supplies "paris" from an internal
      // default while solc 0.8.24's own default is "shanghai", so a Hardhat
      // bump would silently change the opcode set (PUSH0) of the next
      // deployment. The three deployed contracts are verified as paris —
      // recorded in deployments/vinuchain-207.json.
      evmVersion: "paris",
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
