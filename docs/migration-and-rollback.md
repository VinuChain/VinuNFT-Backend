# Migration and rollback

How to move VinuNFT from the deployed generation to the next one, and how to get
back. The deployed generation is recorded in
[`deployments/vinuchain-207.json`](../deployments/vinuchain-207.json); read it
first, and re-check it with `yarn verify:deployment` before you rely on it.

**The deployed contracts are immutable.** Nothing in this repository patches
them. "Rollback" here means pointing the frontend back at the old addresses; it
does not mean reverting a contract.

## What is deployed today

| | address | first block | constructor |
|---|---|---|---|
| TextNFT | `0x8974168eC4c942C6D34161e994A759DC3F19b5a8` | 2234593 | `("TextNFT","VTXT","Vinu Text NFT","ipfs://QmSteWThyBS3qoknoYeSxAaTFm8TU7q4h8QNFAqHreA3Ce","https://vinunft.org")` |
| ImageNFT | `0xDE63a95387b89679869591351f5bFD897Dc87DFB` | 2232056 | none |
| Marketplace | `0xcA396A95E0EB8B6804e25F9db131780a60564047` | 2232125 | `(0x12BD0b15D5010De455DCe7944265Fe1D35a84023)` |

solc `0.8.24`, optimizer on at 200 runs, EVM target `paris`. All three are
source-verified on `https://mainnet.vinuexplorer.org`, keylessly readable.

Two faults are carried by that generation and cannot be fixed in it:

- the commission account **is** the deployer and the owner, which
  `AGENTS.md` forbids. Correcting it on the live contract is an owner-only
  `setCommissionAccount` call — an operator action requiring key custody, not a
  source change. `scripts/deploy_marketplace.ts` now refuses this configuration
  for the next generation.
- `buyToken` is `payable` and there is no `receive`, `fallback`, withdraw or
  rescue path, so native VC sent to the Marketplace is unrecoverable by anyone.
  Balance is 0 wei and no product path sends value. The next generation rejects
  value; `test/marketplace.nativevalue.test.ts` holds it there.

## The one trap that will break the frontend

`AGENTS.md`'s sync checklist used to say "copy the updated ABI JSON files into
`VinuNFT-Frontend/src/abis/*.json`". Doing that today breaks the app.

OpenZeppelin 5's `ERC1155Supply` declares a zero-argument `totalSupply()`
alongside `totalSupply(uint256)`. The deployed generation predates it. The
frontend calls `nftContract.totalSupply(id)` at
`VinuNFT-Frontend/src/pages/nft/index.js`, and ethers v5 resolves that **by
name**: with both overloads in the ABI the call is ambiguous and throws, so
every NFT detail page loses its edition size. The guard is
`VinuNFT-Frontend/test/audit-regressions.test.js:125-143`, which asserts the
frontend ABI declares exactly one `totalSupply`.

**How the next deployment avoids it.** In one change, before any ABI is copied:

1. Move the call site to the explicit signature:
   `nftContract["totalSupply(uint256)"](id)`. That form is unambiguous with or
   without the overload, so it is correct against both generations.
2. Replace the guard's assertion in the same change — do not relax or delete it.
   It stops asserting "no overload exists" (which a v2 ABI legitimately
   violates) and starts asserting the property that actually matters: **every
   overloaded function name in a frontend ABI is invoked by explicit signature
   in `src/`**. That is the same check
   `VinuNFT-Frontend/scripts/sync-deployment.mjs` enforces, so the gate and the
   sync tool cannot disagree.
3. Only then run the sync tool. It refuses to write an ABI that reintroduces an
   overload still called by bare name, so step 3 cannot land without step 1.

Nothing here applies to the current generation: while v1 is live the ABI has one
`totalSupply` and the assertion stays green as written.

## Migrating to a new generation

1. **Freeze and announce.** Open a cancel window on the old Marketplace and tell
   sellers to delist. Listings live in the old Marketplace's storage and cannot
   be migrated — a listing left behind keeps its `setApprovalForAll` grant and
   is only reachable through the old contract.
2. **Do not pause the old Marketplace until the cancel window closes.** Checked
   against the *deployed* source, not this repository's: in the verified source
   at `0xcA396A95…`, `listToken`, `editListing` and `buyToken` all carry
   `whenNotPaused` and `delistToken` carries only `nonReentrant`. So a pause
   stops new sales while sellers can still withdraw — but pausing before anyone
   has had time to delist leaves them holding approvals against a contract
   nobody will buy from.
3. **Deploy.** `yarn compile`, then
   `hardhat run scripts/deploy_text_nft.ts --network vinuchain` (likewise
   `deploy_image_nft.ts`, `deploy_marketplace.ts`). Set the constructor
   environment from `.env.example`; `COMMISSION_ACCOUNT` must differ from the
   deployer or the script aborts. `test/deployment.rehearsal.test.ts` runs this
   exact path against the Hardhat network on every `yarn test`.
4. **Verify the source.**
   `hardhat verify --network vinuchain <address> <constructor args…>`.
   `hardhat.config.ts` now defaults to `https://mainnet.vinuexplorer.org/api`;
   the old `vinuscan.com` default no longer resolves. Note that the `vinuchain`
   network only exists when both `VINUCHAIN_RPC_URL` and `DEPLOYER_PRIVATE_KEY`
   are set — without them `networks` is `{}` and there is nothing to verify
   against.
5. **Record it.** Add a `deployments/vinuchain-207-v2.json` in the same shape:
   addresses, first blocks, creation txs, runtime bytecode hashes, decoded
   constructor arguments, compiler settings. Then
   `yarn verify:deployment --record deployments/vinuchain-207-v2.json` — the
   flag is what points the gate at the new generation; without it the gate
   re-checks v1 and reports OK for a record it never opened. A generation that
   is not recorded cannot be verified later, and the previous explorer host has
   already vanished once.
6. **Add the new generation to `src/config.js` by hand, then sync.** The sync
   tool rewrites values that already exist; it does not invent a generation. Add
   a `v2:` block beside `v1:` in both `contractAddresses` and `firstBlocks` —
   any values will do, they are about to be overwritten — then run
   `node scripts/sync-deployment.mjs --record <path> --artifacts
   <backend>/artifacts --generation v2` from the frontend repo. It writes the
   ABIs and the addresses and first blocks together and refuses the write if an
   ABI would reintroduce a bare-name overload. Without `--generation` it targets
   `v1`, which is the right thing when re-syncing the live generation and the
   wrong thing during a cutover: it would overwrite the old addresses and take
   the product's history with them.
7. **Repin live state, before the gates.**
   `VinuNFT-Frontend/scripts/deployed-invariants.json` pins the bytecode hash
   and every zero-argument view of the live contracts. New addresses mean new
   pins: step 6 has already moved the addresses, so `verify:deployed` measures
   the new contracts against the old pins and fails until this file is updated
   in the same change.
8. **Gate order**, all from the frontend repo: `yarn verify:deployed` →
   `yarn test` → `yarn build` → `yarn verify:csp` → `yarn verify:rendered` →
   `yarn verify:readiness`. Run `verify:deployed` first: it is the cheapest and
   it is the one that catches a wrong address or first block, which makes every
   later gate meaningless.

## Rolling back

There is no contract to roll back. Roll back the frontend:

1. Revert `src/config.js` to the v1 addresses and first blocks in the table
   above, revert `src/abis/*.json`, and revert `scripts/deployed-invariants.json`
   to its v1 pins — the same three files the sync tool writes, so a single
   `git revert` of the sync commit does all of it.
2. Redeploy the paired frontend commit. The address registry and the ABIs must
   move together; a build carrying v2 ABIs against v1 addresses fails
   `yarn verify:deployed` and, if shipped anyway, calls selectors that are not
   there.
3. `yarn verify:deployed && yarn verify:readiness` to confirm the reverted build
   agrees with chain 207.
4. If the v2 Marketplace already took listings, unpause the old one only after
   deciding what happens to them — the two marketplaces do not share state, and
   a token can be listed on both at once.

**Keep the old generation configured, do not replace it.** Add a `v2` key
alongside `v1` in `config.contractAddresses` and `config.firstBlocks`. Tokens
minted on the old NFT contracts stay there forever, and the activity index scans
from each contract's first block; dropping `v1` deletes the product's history
rather than migrating it.

## Bytecode reproduction

The deployed bytecode cannot be reproduced from this repository's current
source: the source is newer (it has `MAX_AMOUNT`,
`MAX_PLATFORM_FEE_PERCENTAGE`, a zero-argument `totalSupply()`, and a
non-payable `buyToken`). The explorer's verification is the source-to-bytecode
proof for the deployed generation, and `yarn verify:deployment` asserts that
proof is still present and still names the right contract.

For a future generation, reproducibility needs the compiler settings JSON to
match byte for byte, not just the compiler version: adding `evmVersion` to
`hardhat.config.ts` changed the embedded metadata hash and therefore the full
bytecode, while leaving the executable code identical byte for byte. Record the
settings with the deployment, and verify from that record.
