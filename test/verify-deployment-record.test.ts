import { expect } from "chai";
import { execFile } from "node:child_process";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";

/**
 * scripts/verify-deployment-record.mjs is a gate against a live chain and a
 * live explorer, so CI never runs it and nothing until now proved it can fail.
 * These cases run the real script against a stub chain + explorer over
 * loopback: a self-consistent record passes, and one perturbed field at a time
 * has to be caught. No network, no key.
 */
describe("verify-deployment-record gate", function () {
    const coder = AbiCoder.defaultAbiCoder();
    const CODE = "0x1234";
    const CODE_HASH = keccak256(CODE);
    const TEXT = "0x8974168eC4c942C6D34161e994A759DC3F19b5a8";
    const MARKET = "0xcA396A95E0EB8B6804e25F9db131780a60564047";
    const COMMISSION = "0x12BD0b15D5010De455DCe7944265Fe1D35a84023";
    // Real 32-byte hashes: ethers rejects a short one before the record is compared.
    const TX_TEXT = `0x${"a1".repeat(32)}`;
    const TX_MARKET = `0x${"b2".repeat(32)}`;
    const TX_ABSENT = `0x${"c3".repeat(32)}`;
    const TEXT_ARGS = [
        "TextNFT",
        "VTXT",
        "Vinu Text NFT",
        "ipfs://QmSteWThyBS3qoknoYeSxAaTFm8TU7q4h8QNFAqHreA3Ce",
        "https://vinunft.org",
    ];

    type Live = {
        readbacks: Record<string, string>;
        receipts: Record<string, { contractAddress: string; blockNumber: number }>;
        optimizationRuns: number;
    };
    let live: Live;
    let server: Server;
    let port: number;
    let dir: string;
    let runCount = 0;

    const selector = (fn: string) => keccak256(toUtf8Bytes(`${fn}()`)).slice(0, 10);

    const freshLive = (): Live => ({
        // Keyed `<address>:<selector>`, already ABI-encoded, exactly what
        // eth_call returns.
        readbacks: {
            [`${TEXT.toLowerCase()}:${selector("name")}`]: coder.encode(["string"], [TEXT_ARGS[0]]),
            [`${TEXT.toLowerCase()}:${selector("symbol")}`]: coder.encode(["string"], [TEXT_ARGS[1]]),
            [`${TEXT.toLowerCase()}:${selector("description")}`]: coder.encode(["string"], [TEXT_ARGS[2]]),
            [`${TEXT.toLowerCase()}:${selector("imageURI")}`]: coder.encode(["string"], [TEXT_ARGS[3]]),
            [`${TEXT.toLowerCase()}:${selector("externalLink")}`]: coder.encode(["string"], [TEXT_ARGS[4]]),
            // Lowercased on purpose: an address readback is the one comparison
            // that must stay case-insensitive.
            [`${MARKET.toLowerCase()}:${selector("commissionAccount")}`]: coder.encode(
                ["address"],
                [COMMISSION.toLowerCase()]
            ),
        },
        receipts: {
            [TX_TEXT]: { contractAddress: TEXT.toLowerCase(), blockNumber: 2234593 },
            [TX_MARKET]: { contractAddress: MARKET.toLowerCase(), blockNumber: 2232125 },
        },
        optimizationRuns: 200,
    });

    const recordFor = (explorerBase: string) => ({
        chainId: 207,
        rpc: `${explorerBase}/rpc`,
        explorer: explorerBase,
        deployer: COMMISSION,
        compiler: {
            version: "0.8.24",
            solcLongVersion: "v0.8.24+commit.e11b9ed9",
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "paris",
        },
        contracts: {
            text: {
                contractName: "TextNFT",
                address: TEXT,
                firstBlock: 2234593,
                creationTx: TX_TEXT,
                runtimeCodeHash: CODE_HASH,
                constructorTypes: ["string", "string", "string", "string", "string"],
                constructorArgs: [...TEXT_ARGS],
            },
            marketplace: {
                contractName: "Marketplace",
                address: MARKET,
                firstBlock: 2232125,
                creationTx: TX_MARKET,
                runtimeCodeHash: CODE_HASH,
                constructorTypes: ["address"],
                constructorArgs: [COMMISSION],
            },
        },
    });

    const rpc = (method: string, params: any[]) => {
        switch (method) {
            case "eth_chainId":
                return "0xcf";
            case "net_version":
                return "207";
            case "eth_blockNumber":
                return "0x300000";
            case "eth_getCode":
                return CODE;
            case "eth_call":
                return live.readbacks[`${params[0].to.toLowerCase()}:${params[0].data}`] ?? "0x";
            case "eth_getTransactionReceipt": {
                const r = live.receipts[params[0]];
                if (r === undefined) return null;
                return {
                    transactionHash: params[0],
                    transactionIndex: "0x0",
                    blockHash: `0x${"11".repeat(32)}`,
                    blockNumber: `0x${r.blockNumber.toString(16)}`,
                    from: COMMISSION.toLowerCase(),
                    to: null,
                    contractAddress: r.contractAddress,
                    cumulativeGasUsed: "0x1",
                    gasUsed: "0x1",
                    effectiveGasPrice: "0x1",
                    logs: [],
                    logsBloom: `0x${"00".repeat(256)}`,
                    status: "0x1",
                    type: "0x0",
                };
            }
            default:
                // Surfaces an unstubbed call as a named failure instead of a hang.
                throw new Error(`unstubbed RPC method ${method}`);
        }
    };

    before(async function () {
        dir = mkdtempSync(join(tmpdir(), "vinunft-record-"));
        server = createServer((req, res) => {
            if (req.method === "POST") {
                let body = "";
                req.on("data", (c) => (body += c));
                req.on("end", () => {
                    const one = (r: any) => {
                        try {
                            return { jsonrpc: "2.0", id: r.id, result: rpc(r.method, r.params ?? []) };
                        } catch (e) {
                            return { jsonrpc: "2.0", id: r.id, error: { code: -32601, message: String(e) } };
                        }
                    };
                    const parsed = JSON.parse(body);
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)));
                });
                return;
            }
            const address = new URL(req.url ?? "", "http://x").searchParams.get("address") ?? "";
            const isText = address.toLowerCase() === TEXT.toLowerCase();
            res.setHeader("content-type", "application/json");
            res.end(
                JSON.stringify({
                    status: "1",
                    message: "OK",
                    result: [
                        {
                            SourceCode: "contract C {}",
                            ContractName: isText ? "TextNFT" : "Marketplace",
                            CompilerVersion: "v0.8.24+commit.e11b9ed9",
                            EVMVersion: "paris",
                            OptimizationUsed: "true",
                            OptimizationRuns: live.optimizationRuns,
                            ConstructorArguments: isText
                                ? coder.encode(
                                      ["string", "string", "string", "string", "string"],
                                      TEXT_ARGS
                                  )
                                : coder.encode(["address"], [COMMISSION]),
                        },
                    ],
                })
            );
        });
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        port = (server.address() as AddressInfo).port;
    });

    after(function () {
        server.close();
        rmSync(dir, { recursive: true, force: true });
    });

    beforeEach(function () {
        live = freshLive();
    });

    // Async on purpose: the stub server lives in this process, so a blocking
    // spawnSync would deadlock — the child's RPC calls could never be answered.
    const run = (mutate: (record: any) => void = () => {}) =>
        new Promise<{ status: number; out: string; path: string }>((resolveRun) => {
            const record = recordFor(`http://127.0.0.1:${port}`);
            mutate(record);
            const path = join(dir, `record-${runCount++}.json`);
            writeFileSync(path, JSON.stringify(record));
            execFile(
                process.execPath,
                ["scripts/verify-deployment-record.mjs", "--record", path],
                { encoding: "utf8", timeout: 60000 },
                (error, stdout, stderr) => {
                    const status = error === null ? 0 : ((error as { code?: number }).code ?? 1);
                    resolveRun({ status, out: `${stdout}${stderr}`, path });
                }
            );
        });

    it("verifies the record named by --record, not the built-in v1 path", async function () {
        const { status, out, path } = await run();
        expect(out, out).to.contain(`http://127.0.0.1:${port}`);
        expect(out, out).to.not.contain("rpc.vinuchain.org");
        expect(out, out).to.contain(path);
        expect(status, out).to.equal(0);
    });

    it("fails when the recorded firstBlock is not the creation transaction's block", async function () {
        // firstBlock is copied into the frontend's activity scan window, so a
        // block later than the real one silently hides early tokens.
        const { status, out } = await run((r) => {
            r.contracts.text.firstBlock = 2234600;
        });
        expect(status, out).to.equal(1);
        expect(out).to.match(/text: creation transaction .* is in block 2234593, record says firstBlock 2234600/);
    });

    it("fails when the creation transaction did not create the recorded address", async function () {
        const { status, out } = await run((r) => {
            r.contracts.text.creationTx = TX_MARKET;
        });
        expect(status, out).to.equal(1);
        expect(out).to.contain("created");
    });

    it("fails when the creation transaction is not on chain", async function () {
        const { status, out } = await run((r) => {
            r.contracts.text.creationTx = TX_ABSENT;
        });
        expect(status, out).to.equal(1);
        expect(out).to.contain(TX_ABSENT);
    });

    it("fails when a recorded string differs from live state only by case", async function () {
        // A mistyped CID case is a different IPFS object; lowercasing both
        // sides would let it through and it would be reused as a real URI.
        const { status, out } = await run((r) => {
            r.contracts.text.constructorArgs[3] =
                "ipfs://qmstewthybs3qoknoyesxaatfm8tu7q4h8qnfaqhrea3ce";
        });
        expect(status, out).to.equal(1);
        expect(out).to.contain("live imageURI() is");
    });

    it("fails when the explorer's optimizer run count is not the recorded one", async function () {
        live.optimizationRuns = 999;
        const { status, out } = await run();
        expect(status, out).to.equal(1);
        expect(out).to.contain("OptimizationRuns is 999");
    });

    it("accepts an address readback that differs only in checksum case", async function () {
        // The one comparison that must stay case-insensitive: the record is
        // checksummed, eth_call returns lowercase.
        const { status, out } = await run();
        expect(status, out).to.equal(0);
    });
});
