import hre from "hardhat";

type CustomChain = {
  network: string;
  chainId: number;
  urls: {
    apiURL: string;
    browserURL: string;
  };
};

const networkName = "vinuchain";
const expectedChainId = Number(process.env.VINUCHAIN_CHAIN_ID || "207");
// vinuscan.com does not resolve — curl returns HTTP 000 for both the site and
// testnet.vinuscan.com. The live Blockscout for chain 207 is
// mainnet.vinuexplorer.org, which serves module=contract&action=getsourcecode
// unauthenticated for all three deployed contracts. These defaults must stay in
// step with hardhat.config.ts, which is the whole point of this check.
const expectedApiUrl =
  process.env.VINUCHAIN_EXPLORER_API_URL || "https://mainnet.vinuexplorer.org/api";
const expectedBrowserUrl =
  process.env.VINUCHAIN_EXPLORER_URL || "https://mainnet.vinuexplorer.org";
const expectedApiKey = process.env.VINUCHAIN_EXPLORER_API_KEY || "vinuchain";

const hardhatConfig = hre.config as typeof hre.config & {
  etherscan?: {
    apiKey?: string | Record<string, string>;
    customChains?: CustomChain[];
  };
};

const etherscan = hardhatConfig.etherscan as {
  apiKey?: string | Record<string, string>;
  customChains?: CustomChain[];
} | undefined;

const apiKey =
  typeof etherscan?.apiKey === "string"
    ? etherscan.apiKey
    : etherscan?.apiKey?.[networkName];
const customChain = etherscan?.customChains?.find(chain => chain.network === networkName);
const liveNetwork = hre.config.networks[networkName];

const failures: string[] = [];

if (!Number.isInteger(expectedChainId) || expectedChainId <= 0) {
  failures.push(`VINUCHAIN_CHAIN_ID must resolve to a positive integer; got ${process.env.VINUCHAIN_CHAIN_ID}`);
}

if (process.env.DEPLOYER_PRIVATE_KEY) {
  failures.push("DEPLOYER_PRIVATE_KEY must be unset for this non-live readiness check.");
}

if (process.env.HARDHAT_NETWORK === networkName) {
  failures.push("HARDHAT_NETWORK=vinuchain would select a live network; use the default hardhat network.");
}

if (liveNetwork) {
  failures.push("Hardhat live vinuchain network is configured; unset VINUCHAIN_RPC_URL and DEPLOYER_PRIVATE_KEY.");
}

if (!etherscan) {
  failures.push("Missing etherscan verification config.");
}

if (apiKey !== expectedApiKey) {
  failures.push(`etherscan.apiKey.${networkName} must match VINUCHAIN_EXPLORER_API_KEY/default.`);
}

if (!customChain) {
  failures.push(`Missing etherscan.customChains entry for ${networkName}.`);
} else {
  if (customChain.chainId !== expectedChainId) {
    failures.push(`customChains.${networkName}.chainId expected ${expectedChainId}, got ${customChain.chainId}.`);
  }
  if (customChain.urls.apiURL !== expectedApiUrl) {
    failures.push(`customChains.${networkName}.urls.apiURL expected ${expectedApiUrl}, got ${customChain.urls.apiURL}.`);
  }
  if (customChain.urls.browserURL !== expectedBrowserUrl) {
    failures.push(`customChains.${networkName}.urls.browserURL expected ${expectedBrowserUrl}, got ${customChain.urls.browserURL}.`);
  }
}

if (failures.length > 0) {
  console.error("VinuNFT explorer verification config is not offline-ready:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "ok",
    check: "vinunft-explorer-verify-config",
    network: networkName,
    hardhatNetwork: hre.network.name,
    chainId: expectedChainId,
    apiURL: expectedApiUrl,
    browserURL: expectedBrowserUrl,
    apiKeyConfigured: Boolean(apiKey),
    liveNetworkConfigured: false,
  }, null, 2));
}
