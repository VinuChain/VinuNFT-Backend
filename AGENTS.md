# AGENTS.md — AI agent and developer reference

This file captures the key commands, constraints, and checklists that every
developer or AI agent working on this repository must know before making changes.

## Commands

| Purpose      | Command                          | Notes                                      |
|--------------|----------------------------------|--------------------------------------------|
| Install      | `yarn install --frozen-lockfile` | Required before any other command          |
| Compile      | `yarn compile`                   | Must exit 0; generates typechain-types/    |
| Test         | `yarn test`                      | All tests must pass; includes the Hardhat-network deployment rehearsal |
| Coverage     | `yarn coverage`                  | Prints coverage table; thresholds enforced |
| Lint         | `yarn lint`                      | solhint over contracts/**/*.sol; warnings OK, errors must be 0 |
| Contract sizes | `yarn size`                    | Informational only                         |
| Deployment record | `yarn verify:deployment`      | Read-only; checks deployments/vinuchain-207.json against chain 207 and the explorer |

All commands require Node.js 22 (`nvm use 22` or `cat .nvmrc`). The CI workflow
uses `ubuntu-latest` with `node-version: 22`.

## Pinned Solidity compiler

`hardhat.config.ts` pins the compiler to **`0.8.24`** with the Paris EVM target
and `optimizer { enabled: true, runs: 200 }`. All first-party contracts declare
`pragma solidity ^0.8.20;` to match the OpenZeppelin 5.0.2 requirement. Do not
change the compiler version without updating all pragmas and re-running
`yarn compile && yarn test`.

## Static analysis (Slither)

CI runs Slither as a **blocking gate** (`.github/workflows/test.yml`, `slither` job)
that fails the build on **Medium or High** severity findings. Configuration lives in
`slither.config.json` (scopes out `contracts/test/` helpers, excludes dependencies,
`fail_on: medium`). The current baseline is clean at Medium+; remaining output is
Low/Informational (naming style, benign reentrancy in OZ-standard mint/burn, etc.).

Four production false-positives are suppressed inline with `// slither-disable-next-line`
plus a rationale comment:
- `MetadataUtils.sol` Base64 encode/decode `divide-before-multiply` — standard Base64
  length math; the integer rounding is intentional.
- `Marketplace._handleFunds` `uninitialized-local` (creator, creatorFee) — intentional
  default-zero, guarded by the `if (creatorFee > 0)` / ERC2981 branch.

The CI job pins the analyzer to **`slither-version: 0.11.4`** — the highest version
installable in the `crytic/slither-action@v0.4.1` Python<3.10 container, and the version
the clean baseline was verified against. When bumping the version, re-run the full local
check and re-triage any new findings before raising the pin; do not bump it silently.

Run locally: `nvm use 22 && yarn install --frozen-lockfile && yarn compile &&
slither . --config-file slither.config.json`. It must exit 0. When you add a new
Medium+ finding, fix it or annotate it with justification — do not lower the threshold.

## Production deployment rule

**Never use the deployer key as the commission account.**
Enforced at deploy time by `scripts/deploy_marketplace.ts`, which aborts when
`COMMISSION_ACCOUNT` equals the deployer. It is deliberately not a constructor
`require`: this is custody policy, not a contract invariant, and the test suite
legitimately deploys with the deployer as the commission account. **The deployed
v1 Marketplace violates this rule** — creator, `owner()` and `commissionAccount`
are all `0x12BD0b15D5010De455DCe7944265Fe1D35a84023`. It is immutable except via
an owner-only `setCommissionAccount` call, which needs key custody nobody here
has.

The deployer key must remain in controlled custody (preferably a multisig or
timelock). The commission account is a separate address that receives platform
fees and can be rotated via `setCommissionAccount`. Using the same address for
both concentrates risk: a single key compromise drains both deployment authority
and accrued fees.

## Frontend ABI and address sync checklist

After any contract redeployment, the frontend must be updated before it is
usable. Complete every item:

1. Run `yarn compile` to regenerate ABI artifacts under `artifacts/`.
2. **Do not hand-copy the ABIs.** Run
   `node scripts/sync-deployment.mjs --record <deployments/…json> --artifacts
   <this repo>/artifacts` from the frontend repository — adding
   `--generation v2` for a new generation, whose `v2:` block must already exist
   in `src/config.js`, or the old addresses are overwritten and the product's
   history goes with them. It writes
   `src/abis/*.json` and the addresses and first blocks in `src/config.js`
   together, and refuses the write when an ABI would reintroduce an overloaded
   function name that `src/` still calls by bare name.
   Copying the current artifacts by hand adds OpenZeppelin 5's zero-argument
   `totalSupply()` next to `totalSupply(uint256)`, which makes
   the frontend's `nftContract.totalSupply(id)` call ambiguous under ethers v5 and blanks the edition
   size on every NFT page. See `docs/migration-and-rollback.md` for the
   three-step change that lands a v2 ABI safely.
3. Repin live state in `VinuNFT-Frontend/scripts/deployed-invariants.json` —
   new addresses mean a new bytecode hash and new pinned view values.
4. `yarn verify:deployed`, then `yarn test`, then rebuild and smoke-test against
   the live deployed addresses before announcing the deployment.

See `README.md` for the prose version and `docs/migration-and-rollback.md` for
the full migration and rollback procedure.

## Explorer verification

Source verification uses `hardhat verify` with the `etherscan`/`customChains`
block in `hardhat.config.ts`. Configure via env vars:

- `VINUCHAIN_EXPLORER_API_URL` — Blockscout-compatible API endpoint
- `VINUCHAIN_EXPLORER_URL` — Browser URL for the explorer
- `VINUCHAIN_EXPLORER_API_KEY` — API key (may be any non-empty string if not enforced)
- `VINUCHAIN_CHAIN_ID` — Defaults to `207` (VinuChain mainnet)

The defaults are `https://mainnet.vinuexplorer.org/api` and
`https://mainnet.vinuexplorer.org`, confirmed rather than assumed: that host is
Blockscout and serves `module=contract&action=getsourcecode` unauthenticated for
all three deployed contracts, which are already verified. **No API key is
required.** The previous defaults pointed at `vinuscan.com`, which no longer
resolves.

`yarn verify:deployment` re-checks that verification, the deployed bytecode
hashes and the recorded constructor arguments against chain 207. It is read-only
and needs no key.

Two things still block a real `hardhat verify` run: `networks` is `{}` unless
both `VINUCHAIN_RPC_URL` and `DEPLOYER_PRIVATE_KEY` are set, and the POST
submission path has never been exercised — only the read side has.
