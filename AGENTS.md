# VinuNFT Backend

Hardhat contracts for VinuNFT (`TextNFT`, `ImageNFT`, `Marketplace`). The frontend is the sibling `VinuNFT-Frontend`.

## Commands

Node 22 (`.nvmrc`), Yarn 1: `yarn install --frozen-lockfile` first.

- CI gate (`hardhat` job): `yarn audit:prod`, `yarn compile`, `yarn lint` (solhint; warnings OK, errors 0), `yarn test` (includes the Hardhat-network deployment rehearsal), `yarn coverage` (CI enforces minimums in `.github/workflows/test.yml`).
- Slither (required `slither` check, fails on Medium+): `yarn compile && slither . --config-file slither.config.json` must exit 0.
- `yarn verify:deployment`: read-only; checks `deployments/vinuchain-207.json` against chain 207 and the explorer. Pass `--record deployments/<file>.json` for a new generation.
- `yarn size` is informational.

## Rules

- Compiler is pinned in `hardhat.config.ts` (0.8.24, `paris`, optimizer 200 runs) to match the deployed bytecode. Do not change it without updating all pragmas and rerunning compile and test.
- Slither: a new Medium+ finding is fixed or annotated inline (`// slither-disable-next-line` plus rationale). Never lower `fail_on`. Do not raise the pinned `slither-version` without re-running the full local check and triaging new findings.
- Do not bump `@openzeppelin/contracts`: it changes the bytecode of deployed contracts (see README "Dependency posture").
- Never hand-copy ABIs to the frontend. Use the frontend's `scripts/sync-deployment.mjs`, with `--generation v2` for a new generation (without it the v1 addresses are overwritten). The full checklist is README "Frontend ABI and address sync" and `docs/migration-and-rollback.md`.

## Production deployment rule

**Never use the deployer key as the commission account.**
Enforced at deploy time by `scripts/deploy_marketplace.ts`, which aborts when
`COMMISSION_ACCOUNT` equals the deployer. It is deliberately not a constructor
`require`: this is custody policy, not a contract invariant, and the test suite
legitimately deploys with the deployer as the commission account. **The deployed
v1 Marketplace violates this rule**: creator, `owner()` and `commissionAccount`
are all `0x12BD0b15D5010De455DCe7944265Fe1D35a84023`. It is fixable only via
an owner-only `setCommissionAccount` call, which needs key custody nobody here
has.

Keep the deployer key in controlled custody (preferably a multisig or timelock);
the commission account is a separate, rotatable fee address.

## Explorer verification

Defaults (`hardhat.config.ts`, `.env.example`) point at Blockscout on `mainnet.vinuexplorer.org`; no API key is needed. The mainnet `vinuchain` network exists only when both `VINUCHAIN_RPC_URL` and `DEPLOYER_PRIVATE_KEY` are set; `vinuchainTestnet` is always configured (default RPC, no signer needed to verify). The POST submission path of `hardhat verify` has never been exercised; only the read side has.

## Autonomy

Deployments, owner calls, and anything needing a funded key require explicit owner approval. None exists in this repo.
