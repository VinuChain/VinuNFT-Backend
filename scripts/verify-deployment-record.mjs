#!/usr/bin/env node
/**
 * Deployment record gate: does deployments/vinuchain-207.json still describe
 * what is actually deployed?
 *
 * The record is the only place the deployed generation's constructor arguments
 * exist inside this repository — they were read out of a third-party explorer,
 * and the previous explorer host (vinuscan.com) has already disappeared. A
 * transcription nobody re-checks is a guess, so this checks it:
 *
 *   1. bytecode — keccak256(eth_getCode(address)) equals runtimeCodeHash. This
 *      is the identity of the deployed generation; local recompilation cannot
 *      reproduce it, because this repository's source is strictly newer.
 *   2. constructor arguments — the recorded values, ABI-encoded with the
 *      recorded types, equal the ConstructorArguments the explorer verified the
 *      bytecode against. Re-encoding rather than storing the hex means a typo
 *      in a recorded string cannot survive.
 *   3. the same arguments read back off chain where the contract exposes them
 *      (TextNFT name/symbol/description/imageURI/externalLink, Marketplace
 *      commissionAccount), so the record is anchored to state and not only to
 *      the explorer's copy of the creation calldata.
 *   4. source verification is still present and is the contract we think it is
 *      — ContractName, compiler long version, optimizer, runs, EVM version.
 *
 * Outcome split, deliberately: a definite wrong answer fails; a transport
 * error or non-200 from the explorer is a note. Blockscout rate-limits in a way
 * rpc.vinuchain.org does not, and an unconditional failure here would make this
 * flaky-red rather than useful. Chain reads have no such excuse and always fail.
 *
 * Read-only, no key, no explorer API key. Usage: node scripts/verify-deployment-record.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AbiCoder, JsonRpcProvider, keccak256 } from "ethers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(
    readFileSync(resolve(root, "deployments/vinuchain-207.json"), "utf8")
);

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const coder = AbiCoder.defaultAbiCoder();

const provider = new JsonRpcProvider(record.rpc, record.chainId);
const net = await provider.getNetwork();
if (Number(net.chainId) !== record.chainId) {
    fail(`chain id: record says ${record.chainId}, ${record.rpc} reports ${net.chainId}`);
}

// Read-back selectors per contract. Keyed by the recorded constructor argument
// index they must equal, so adding an argument to the record without an anchor
// is visible rather than silently unverified.
const READBACK = {
    text: { name: 0, symbol: 1, description: 2, imageURI: 3, externalLink: 4 },
    marketplace: { commissionAccount: 0 },
    image: {},
};

const explorerJson = async (address) => {
    const url = `${record.explorer}/api?module=contract&action=getsourcecode&address=${address}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status !== "1") throw new Error(`explorer status ${body.status}: ${body.message}`);
    return body.result[0];
};

for (const [key, c] of Object.entries(record.contracts)) {
    const code = await provider.getCode(c.address);
    if (code === "0x") {
        fail(`${key}: no contract code at ${c.address} on chain ${record.chainId}`);
        continue;
    }
    const codeHash = keccak256(code);
    if (codeHash !== c.runtimeCodeHash) {
        fail(`${key}: runtime bytecode hash is ${codeHash}, record says ${c.runtimeCodeHash}`);
    }

    const encoded = coder
        .encode(c.constructorTypes, c.constructorArgs)
        .replace(/^0x/, "");

    for (const [fn, argIndex] of Object.entries(READBACK[key] ?? {})) {
        const expected = c.constructorArgs[argIndex];
        const outputType = c.constructorTypes[argIndex];
        const selector = keccak256(Buffer.from(`${fn}()`)).slice(0, 10);
        try {
            const raw = await provider.call({ to: c.address, data: selector });
            const [got] = coder.decode([outputType], raw);
            if (String(got).toLowerCase() !== String(expected).toLowerCase()) {
                fail(`${key}: live ${fn}() is ${JSON.stringify(got)}, record says ${JSON.stringify(expected)}`);
            }
        } catch (e) {
            fail(`${key}: could not read ${fn}() from ${c.address}: ${e.shortMessage || e.message}`);
        }
    }

    let source;
    try {
        source = await explorerJson(c.address);
    } catch (e) {
        notes.push(`${key}: could not check explorer verification (${e.message})`);
        continue;
    }

    if (!source.SourceCode || source.SourceCode.length === 0) {
        fail(`${key}: ${c.address} is no longer source-verified on ${record.explorer}`);
        continue;
    }
    if (source.ContractName !== c.contractName) {
        fail(`${key}: explorer ContractName is ${source.ContractName}, expected ${c.contractName}`);
    }
    if (source.CompilerVersion !== record.compiler.solcLongVersion) {
        fail(`${key}: explorer CompilerVersion is ${source.CompilerVersion}, record says ${record.compiler.solcLongVersion}`);
    }
    if (source.EVMVersion !== record.compiler.evmVersion) {
        fail(`${key}: explorer EVMVersion is ${source.EVMVersion}, record says ${record.compiler.evmVersion}`);
    }
    if (String(source.OptimizationUsed) !== String(record.compiler.optimizer.enabled)) {
        fail(`${key}: explorer OptimizationUsed is ${source.OptimizationUsed}, record says ${record.compiler.optimizer.enabled}`);
    }

    const onExplorer = (source.ConstructorArguments || "").replace(/^0x/, "").toLowerCase();
    if (onExplorer !== encoded.toLowerCase()) {
        fail(
            `${key}: recorded constructor arguments ${JSON.stringify(c.constructorArgs)} ` +
                `encode to 0x${encoded || "(empty)"}, but the deployment was verified against 0x${onExplorer || "(empty)"}`
        );
    }
}

console.log(`chain ${record.chainId} via ${record.rpc}, explorer ${record.explorer}`);
for (const [key, c] of Object.entries(record.contracts)) {
    console.log(
        `checked ${key} (${c.contractName}) at ${c.address}: bytecode hash, ` +
            `${c.constructorTypes.length} constructor argument(s), source verification`
    );
}
for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
    console.error(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
console.log(
    `\nOK: deployments/vinuchain-207.json matches chain ${record.chainId} and ${record.explorer}.\n` +
        "NOT checked here: that this repository's source compiles to the deployed bytecode — it does not, " +
        "and is not meant to. The deployed generation is older; the explorer's verification is the " +
        "source-to-bytecode proof for it."
);
