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

## Dependency posture

```bash
yarn audit:prod
```

The production dependency tree is a single package, `@openzeppelin/contracts`,
and it carries no advisories — `yarn audit --groups dependencies` reports
`{"info":0,"low":0,"moderate":0,"high":0,"critical":0}` over
`totalDependencies: 1`. The baseline is zero, so there is no ratchet file and no
triage document: any non-zero result is a genuine production-tree regression.
`yarn audit:prod` runs in the `hardhat` CI job before `yarn compile`.

The dev tree's advisory counts are not actionable here. `hardhat`, `solhint`,
`solidity-coverage`, `hardhat-gas-reporter` and `hardhat-verify` run on a
developer machine or a CI runner and never reach a compiled or deployed
artifact, so `--groups dependencies` is the correct scope rather than a
convenient one. The gate is falsifiable: moving `hardhat-gas-reporter` into
`dependencies` makes `yarn audit:prod` exit 30 with 33 advisories over 138
packages, rooted in its `@ethersproject`/`elliptic`/`bn.js` chain.

`@openzeppelin/contracts` resolves to 5.0.2 while `^5.0.2` permits any newer
5.x. Do not bump it here: a different OpenZeppelin version changes the compiled
bytecode of already-deployed contracts, which belongs to the deployment
programme, not to dependency hygiene.

## Configuration

Copy `.env.example` to a local `.env` file or export the same variables in your shell. Do not commit real private keys.

Required network variables:

- `VINUCHAIN_RPC_URL`: RPC endpoint, for example `https://rpc.vinuchain.org`.
- `VINUCHAIN_CHAIN_ID`: VinuChain mainnet is `207`.
- `DEPLOYER_PRIVATE_KEY`: deployer private key used by Hardhat.

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
yarn hardhat run scripts/deploy_image_nft.ts --network vinuchain
yarn hardhat run scripts/deploy_marketplace.ts --network vinuchain
```

The helper scripts reject missing, placeholder, and zero addresses for address inputs. `deploy_marketplace.ts` refuses the deploy outright when `COMMISSION_ACCOUNT` equals the deployer.

`test/deployment.rehearsal.test.ts` runs these three scripts against the Hardhat network on every `yarn test`, with the constructor arguments the live contracts were built with. That is a rehearsal, not a testnet rehearsal: no VinuChain testnet endpoint currently resolves.

### What is already deployed

[`deployments/vinuchain-207.json`](deployments/vinuchain-207.json) records the live generation — addresses, first blocks, creation transactions, runtime bytecode hashes, decoded constructor arguments and compiler settings — read back from chain 207 and the explorer, not from this source, which is newer than what is live. `yarn verify:deployment` re-checks the whole record; it is read-only and needs no key.

### Migrating and rolling back

[`docs/migration-and-rollback.md`](docs/migration-and-rollback.md) is the procedure, including the two faults the live generation carries permanently and the ABI trap that breaks the frontend if you regenerate ABIs by hand.

## Operations

The marketplace owner can pause/unpause trading and manage platform fees. Fee increases are capped at 10000 basis points and must wait through the 7-day timelock; decreases apply immediately. Commission account changes reject the zero address and emit events for monitoring.

Keep the owner key in controlled custody. A multisig or timelock owner is preferred for production deployments. If a deployment is already live, contract changes require a migration plan and frontend ABI/address sync.

## Frontend ABI and address sync

After contract changes:

1. Run `yarn compile`.
2. From the frontend repository, run `node scripts/sync-deployment.mjs --record <deployments/…json> --artifacts <this repo>/artifacts`. It writes the ABIs, addresses and first blocks together and refuses to reintroduce an overloaded function name that the frontend still calls by bare name — hand-copying the current artifacts breaks the NFT page's edition size.
3. Repin live state in the frontend's `scripts/deployed-invariants.json`.
4. `yarn verify:deployed`, then rebuild and smoke-test the frontend against the deployed addresses.

See `docs/migration-and-rollback.md` for the full procedure and the rollback path.

## Maintenance notes

The NFT contracts import OpenZeppelin Contracts 5 `ERC2981`; the old vendored ERC-2981 implementation was removed to avoid drift. Text NFT metadata is escaped as JSON for quotes, backslashes, control characters, and UTF-8 bytes before Base64 encoding.
