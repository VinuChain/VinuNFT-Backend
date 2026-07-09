# VinuNFT Backend

Solidity contracts and Hardhat tooling for VinuNFT on VinuChain. The suite includes:

- `TextNFT`: ERC-1155 text NFTs with on-chain JSON metadata and ERC-2981 royalties.
- `ImageNFT`: ERC-1155 image NFTs with external metadata URIs and ERC-2981 royalties.
- `Marketplace`: ERC-1155 listings, ERC-20 payment settlement, royalties, platform fees, pause controls, and expected-price protection.

## Requirements

- Node.js 22
- Yarn 1.x
- A funded VinuChain deployer key for testnet/mainnet deployment

## Install and verify

```bash
yarn install --frozen-lockfile
yarn compile
yarn test
```

Coverage is available with:

```bash
yarn coverage
```

## Configuration

Copy `.env.example` to a local `.env` file or export the same variables in your shell. Do not commit real private keys.

Required network variables:

- `VINUCHAIN_RPC_URL`: RPC endpoint, for example `https://rpc.vinuchain.org`.
- `VINUCHAIN_CHAIN_ID`: VinuChain mainnet is `207`.
- `DEPLOYER_PRIVATE_KEY`: deployer private key used by Hardhat.

Explorer source verification uses Hardhat's Etherscan-compatible `customChains`
config for VinuScan/Blockscout:

- `VINUCHAIN_EXPLORER_API_URL`: defaults to `https://vinuscan.com/api`.
- `VINUCHAIN_EXPLORER_URL`: defaults to `https://vinuscan.com`.
- `VINUCHAIN_EXPLORER_API_KEY`: defaults to `vinuscan`; Blockscout-compatible
  explorers may accept any non-empty string when API keys are not enforced.

Before any live deployment or source verification packet, validate the non-live
configuration contract with the deployer key unset:

```bash
yarn verify:config
```

The check loads the Hardhat verification config, refuses `DEPLOYER_PRIVATE_KEY`
or a live `vinuchain` network, and does not contact RPC, VinuScan, or any funded
account. For testnet dry-run config checks, override the chain and explorer URLs:

```bash
VINUCHAIN_CHAIN_ID=206 \
VINUCHAIN_EXPLORER_API_URL=https://testnet.vinuscan.com/api \
VINUCHAIN_EXPLORER_URL=https://testnet.vinuscan.com \
yarn verify:config
```

Marketplace deployment requires:

- `COMMISSION_ACCOUNT`: non-zero address that receives platform fees.

Text NFT deployment requires:

- `TEXT_NFT_NAME`
- `TEXT_NFT_SYMBOL`
- `TEXT_NFT_DESCRIPTION`
- `TEXT_NFT_IMAGE_URI`
- `TEXT_NFT_EXTERNAL_LINK`

## Deployment

Load your environment first, then run the target script:

```bash
set -a
. ./.env
set +a

yarn hardhat run scripts/deploy_text_nft.ts --network vinuchain
yarn hardhat run scripts/deploy_marketplace.ts --network vinuchain
```

The helper scripts reject missing, placeholder, and zero addresses for address inputs. `deploy_marketplace.ts` never silently uses the deployer as the commission account; pass `COMMISSION_ACCOUNT` explicitly.

After an explicitly approved live deployment, verify the deployed source with
the deployed address and exact constructor arguments:

```bash
yarn hardhat verify --network vinuchain <deployed-address> <constructor-args...>
```

## Operations

The marketplace owner can pause/unpause trading and manage platform fees. Fee increases are capped at 10000 basis points and must wait through the 7-day timelock; decreases apply immediately. Commission account changes reject the zero address and emit events for monitoring.

Keep the owner key in controlled custody. A multisig or timelock owner is preferred for production deployments. If a deployment is already live, contract changes require a migration plan and frontend ABI/address sync.

## Frontend ABI and address sync

After contract changes:

1. Run `yarn compile`.
2. Copy the relevant ABI artifacts into the frontend `src/abis` files.
3. Update frontend contract addresses and first-block metadata in `src/config.js`.
4. Rebuild and smoke-test the frontend against the deployed addresses.

## Maintenance notes

The NFT contracts import OpenZeppelin Contracts 5 `ERC2981`; the old vendored ERC-2981 implementation was removed to avoid drift. Text NFT metadata is escaped as JSON for quotes, backslashes, control characters, and UTF-8 bytes before Base64 encoding.
