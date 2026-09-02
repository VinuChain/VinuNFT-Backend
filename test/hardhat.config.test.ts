import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";

/**
 * Hardhat Verify selects a custom chain by the chain id the RPC reports. If
 * VINUCHAIN_TESTNET_CHAIN_ID moved the network but not the customChains entry,
 * `hardhat verify --network vinuchainTestnet` would fail as an unsupported
 * chain — and only for whoever set the override, so it would not show up here.
 *
 * The override has to be applied in a fresh process: the config is read once at
 * load, so asserting inside this process would compare two values that are
 * equal by default and prove nothing.
 */
describe("hardhat config", function () {
    const probe = "scripts/_chainid_probe.ts";

    const readChainIds = (env: NodeJS.ProcessEnv) => {
        const out = execFileSync(
            "npx",
            ["hardhat", "run", probe, "--network", "hardhat"],
            { encoding: "utf8", env: { ...process.env, ...env } }
        );
        const line = out.split("\n").find((l) => l.startsWith("CHAINIDS "));
        expect(line, `probe printed no result:\n${out}`).to.not.equal(undefined);
        return JSON.parse((line as string).slice("CHAINIDS ".length));
    };

    before(function () {
        writeFileSync(
            probe,
            [
                'import hre from "hardhat";',
                'const net = (hre.config.networks as any).vinuchainTestnet.chainId;',
                'const custom = (hre.config as any).etherscan.customChains.find(',
                '    (c: any) => c.network === "vinuchainTestnet"',
                ").chainId;",
                'console.log("CHAINIDS " + JSON.stringify({ net, custom }));',
                "",
            ].join("\n")
        );
    });

    after(function () {
        rmSync(probe, { force: true });
    });

    it("uses chain 206 for the testnet by default", function () {
        this.timeout(120000);
        const { net, custom } = readChainIds({});
        expect(net).to.equal(206);
        expect(custom).to.equal(206);
    });

    it("moves the verify entry too when the testnet chain id is overridden", function () {
        this.timeout(120000);
        const { net, custom } = readChainIds({
            VINUCHAIN_TESTNET_CHAIN_ID: "999",
        });
        expect(net).to.equal(999);
        expect(
            custom,
            "customChains kept the hardcoded id, so hardhat verify would reject this chain"
        ).to.equal(999);
    });
});
