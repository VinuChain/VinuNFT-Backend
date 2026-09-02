import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const vinuChainRpcUrl = process.env.VINUCHAIN_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const vinuChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");

// VinuChain testnet, chain 206. Coordinates from the official docs
// (https://vinu.gitbook.io/vinuchain/technical-docs/vinuchain-testnet/connect-to-testnet)
// and confirmed live on 2026-09-02: eth_chainId returns 0xce and the explorer
// serves module=contract&action=getsourcecode unauthenticated. This supersedes
// testnet.vinuscan.com, which does not resolve — the reason this repo
// previously recorded that no VinuChain testnet was reachable.
const TESTNET = {
    chainId: 206,
    url: "https://vinufoundation-rpc.com",
    explorerApiUrl: "https://testnet.vinuexplorer.org/api",
    explorerUrl: "https://testnet.vinuexplorer.org",
};

// One value for both the network and its customChains entry. Hardhat Verify
// picks a custom chain by the chain id the RPC reports, so an override that
// moved only the network would fail verification as an unsupported chain.
const vinuChainTestnetId = Number(
    process.env.VINUCHAIN_TESTNET_CHAIN_ID || TESTNET.chainId
);

const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

// Explorer verification env vars:
//   VINUCHAIN_EXPLORER_API_URL  — Blockscout Etherscan-compatible /api endpoint
//   VINUCHAIN_EXPLORER_URL      — browser URL shown in verify output
//   VINUCHAIN_EXPLORER_API_KEY  — Blockscout accepts any non-empty string; no secret required
//
// The defaults below are confirmed, not assumed: mainnet.vinuexplorer.org is
// Blockscout and serves module=contract&action=getsourcecode unauthenticated
// for all three deployed contracts (scripts/verify-deployment-record.mjs runs
// exactly that call). The previous defaults pointed at vinuscan.com, which no
// longer resolves at all. Nor does testnet.vinuscan.com — but the testnet
// itself IS reachable, at the coordinates in TESTNET below.
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
  networks: {
    // `vinuchain` still requires both an RPC and a key: it is the mainnet
    // deploy target, and an entry that exists without a key turns "network
    // doesn't exist" into a TypeError inside a deploy script.
    ...(vinuChainRpcUrl && deployerPrivateKey
      ? { vinuchain: { url: vinuChainRpcUrl, chainId: vinuChainId, accounts } }
      : {}),
    // The testnet entry deliberately does NOT require a key. Gas estimation,
    // chain-id checks and explorer verification are all reads, and gating the
    // whole entry on a key is what made a testnet rehearsal impossible to run
    // without funds. `yarn estimate:deployment` uses exactly this. A DEPLOY
    // here still needs DEPLOYER_PRIVATE_KEY; without it there is no signer.
    vinuchainTestnet: {
      url: process.env.VINUCHAIN_TESTNET_RPC_URL || TESTNET.url,
      chainId: vinuChainTestnetId,
      accounts,
    },
  },
  // Explorer source verification config for `hardhat verify`.
  // Driven entirely by env vars — no secrets are hardcoded here.
  etherscan: {
    apiKey: {
      vinuchain: vinuChainExplorerApiKey,
      vinuchainTestnet: vinuChainExplorerApiKey,
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
      {
        network: "vinuchainTestnet",
        chainId: vinuChainTestnetId,
        urls: {
          apiURL: TESTNET.explorerApiUrl,
          browserURL: TESTNET.explorerUrl,
        },
      },
    ],
  },
};

export default config;
