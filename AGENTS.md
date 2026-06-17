# AGENTS.md — AI agent and developer reference

This file captures the key commands, constraints, and checklists that every
developer or AI agent working on this repository must know before making changes.

## Commands

| Purpose      | Command                          | Notes                                      |
|--------------|----------------------------------|--------------------------------------------|
| Install      | `yarn install --frozen-lockfile` | Required before any other command          |
| Compile      | `yarn compile`                   | Must exit 0; generates typechain-types/    |
| Test         | `yarn test`                      | 167 tests must all pass                    |
| Coverage     | `yarn coverage`                  | Prints coverage table; thresholds enforced |
| Lint         | `yarn lint`                      | solhint over contracts/**/*.sol; warnings OK, errors must be 0 |
| Contract sizes | `yarn size`                    | Informational only                         |

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
The deployer key must remain in controlled custody (preferably a multisig or
timelock). The commission account is a separate address that receives platform
fees and can be rotated via `setCommissionAccount`. Using the same address for
both concentrates risk: a single key compromise drains both deployment authority
and accrued fees.

## Frontend ABI and address sync checklist

After any contract redeployment, the frontend must be updated before it is
usable. Complete every item:

1. Run `yarn compile` to regenerate ABI artifacts under `artifacts/`.
2. Copy the updated ABI JSON files into
   `VinuNFT-Frontend/src/abis/*.json` (one file per contract).
3. Update `VinuNFT-Frontend/src/config.js` with the new contract addresses
   and, if applicable, the deployment block number for event indexing.
4. Rebuild the frontend and smoke-test it against the live deployed addresses
   before announcing the deployment.

See `README.md:72-79` for the canonical prose version of this checklist.

## Explorer verification

Source verification uses `hardhat verify` with the `etherscan`/`customChains`
block in `hardhat.config.ts`. Configure via env vars:

- `VINUCHAIN_EXPLORER_API_URL` — Blockscout-compatible API endpoint
- `VINUCHAIN_EXPLORER_URL` — Browser URL for the explorer
- `VINUCHAIN_EXPLORER_API_KEY` — API key (may be any non-empty string if not enforced)
- `VINUCHAIN_CHAIN_ID` — Defaults to `207` (VinuChain mainnet)

**TODO**: confirm the exact verify API path with the VinuChain explorer team and
update the defaults in `hardhat.config.ts`.
