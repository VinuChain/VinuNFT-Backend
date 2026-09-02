# VinuNFT Backend

Solidity contracts and Hardhat tooling for VinuNFT on VinuChain. The suite includes:

- `TextNFT`: ERC-1155 text NFTs with on-chain JSON metadata and ERC-2981 royalties.
- `ImageNFT`: ERC-1155 image NFTs with external metadata URIs and ERC-2981 royalties.
- `Marketplace`: ERC-1155 listings, ERC-20 payment settlement, royalties, platform fees, pause controls, and expected-price protection.

## Requirements

- Node.js 22
- Yarn 1.x
- A funded VinuChain deployer key for testnet/mainnet deployment. None exists in
  this repository; `yarn estimate:deployment` establishes what one would need
  without holding one.

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
yarn hardhat run scripts/deploy_image_nft.ts --network vinuchain
yarn hardhat run scripts/deploy_marketplace.ts --network vinuchain
```

The helper scripts reject missing, placeholder, and zero addresses for address inputs. `deploy_marketplace.ts` refuses the deploy outright when `COMMISSION_ACCOUNT` equals the deployer.

`test/deployment.rehearsal.test.ts` runs these three scripts against the Hardhat network on every `yarn test`, with the constructor arguments the live contracts were built with.

### Testnet rehearsal (chain 206)

VinuChain testnet is reachable and wired as the `vinuchainTestnet` Hardhat
network. Its coordinates come from the [official docs](https://vinu.gitbook.io/vinuchain/technical-docs/vinuchain-testnet/connect-to-testnet)
and were confirmed live on 2026-09-02: RPC `https://vinufoundation-rpc.com`,
chain id 206 (`eth_chainId` -> `0xce`), explorer `https://testnet.vinuexplorer.org`,
which serves `module=contract&action=getsourcecode` unauthenticated, so
`hardhat verify --network vinuchainTestnet` needs no API key. This supersedes
`testnet.vinuscan.com`, which does not resolve — the reason this repository
previously recorded that no VinuChain testnet existed.

The network entry deliberately does **not** require `DEPLOYER_PRIVATE_KEY`.
Estimation, chain-id checks and explorer verification are reads; gating the
whole entry on a key made the rehearsal impossible to run without funds.

```bash
yarn estimate:deployment      # hardhat run scripts/estimate_deployment.ts --network vinuchainTestnet
```

It drives the same contract factories and the same constructor-argument
environment variables the deploy scripts use, and asks the live node to
estimate. Measured 2026-09-02 against both chain 206 and chain 207, which
returned the same figures — deployment gas is intrinsic plus code deposit, so it
is not chain-specific. The script targets the testnet because that is the
network entry that works without a key; `--network vinuchain` needs one:

| contract | gas |
| --- | --- |
| ImageNFT | 1,553,932 |
| TextNFT | 2,472,229 |
| Marketplace | 2,097,439 |
| **total** | **6,123,600** |

At the then-current 41.00076 gwei that is **0.2511 VC**; at the then-current
`maxFeePerGas` of 81.00076 gwei, **0.4960 VC**. Gas price moves, so re-run the
script rather than trusting these; fund the deployer for at least the
`maxFeePerGas` figure with headroom.

The deployer address is derived from the key, never stored here. With
`DEPLOYER_PRIVATE_KEY` set, the script prints the address and its balance and
prints nothing else about the key.

What this rehearsal cannot do is sign and broadcast. Two blockers remain, both
external to this repository:

1. **A funded key.** No VinuChain key exists here, for 206 or 207. The
   deployer address is derived from `DEPLOYER_PRIVATE_KEY` at run time
   (`new ethers.Wallet(key).address`, printed by `yarn estimate:deployment`);
   no address is recorded here because no key exists to derive one from.

   **How to fund it is not settled, and this is the honest state of it.** No
   faucet host resolves: `faucet.vinuchain.org`, `vinuchain.org/faucet`,
   `faucet.vinufoundation-rpc.com` and `testnet.vinuexplorer.org/faucet` all
   fail or 404 (checked 2026-09-02). VinuChain's own testnet documentation
   pages carry network settings and **no faucet section at all** — neither the
   testnet index nor `connect-to-testnet` mentions one, and vinuchain.org links
   no faucet. Third-party write-ups from 2023 say testnet VC is handed out in
   VinuChain's Discord via a `/faucet` command; the invite
   <https://discord.gg/vinu> does resolve, to the official "Vita Inu (VINU)"
   guild. **That command was not verified from here** — confirming it needs a
   Discord account and a human. Treat the Discord route as the lead to try,
   not as documented fact, and ask the VinuChain team directly if it fails.
2. **The custody decision.** `deploy_marketplace.ts` refuses a
   `COMMISSION_ACCOUNT` equal to the deployer, which the live v1 Marketplace
   violates. A second address, and access to it, has to be decided before any
   deployment — testnet or mainnet.

### What is already deployed

[`deployments/vinuchain-207.json`](deployments/vinuchain-207.json) records the live generation — addresses, first blocks, creation transactions, runtime bytecode hashes, decoded constructor arguments and compiler settings — read back from chain 207 and the explorer, not from this source, which is newer than what is live. `yarn verify:deployment` re-checks the whole record; it is read-only and needs no key.

### Migrating and rolling back

[`docs/migration-and-rollback.md`](docs/migration-and-rollback.md) is the procedure, including the two faults the live generation carries permanently and the ABI trap that breaks the frontend if you regenerate ABIs by hand.

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
2. From the frontend repository, run `node scripts/sync-deployment.mjs --record <deployments/…json> --artifacts <this repo>/artifacts`. It writes the ABIs, addresses and first blocks together and refuses to reintroduce an overloaded function name that the frontend still calls by bare name — hand-copying the current artifacts breaks the NFT page's edition size.
3. Repin live state in the frontend's `scripts/deployed-invariants.json`.
4. `yarn verify:deployed`, then rebuild and smoke-test the frontend against the deployed addresses.

See `docs/migration-and-rollback.md` for the full procedure and the rollback path.

## Maintenance notes

The NFT contracts import OpenZeppelin Contracts 5 `ERC2981`; the old vendored ERC-2981 implementation was removed to avoid drift. Text NFT metadata is escaped as JSON for quotes, backslashes, control characters, and UTF-8 bytes before Base64 encoding.
