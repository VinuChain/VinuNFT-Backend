import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const vinuChainRpcUrl = process.env.VINUCHAIN_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const vinuChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");

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
};

export default config;
