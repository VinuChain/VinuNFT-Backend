import { expect } from "chai";
import hre from "hardhat";

/**
 * The Marketplace settles exclusively in ERC-20. It never reads `msg.value`,
 * and no contract in the set declares `receive`, `fallback`, or any withdraw
 * or rescue path. Native VC that reaches this contract is therefore
 * unrecoverable by anyone, including the owner.
 *
 * The deployed generation at 0xcA396A95E0EB8B6804e25F9db131780a60564047 marks
 * buyToken `payable`, so it silently accepts and traps native VC. Its balance
 * is currently 0 wei, so nothing is stranded. This is immutable there; these
 * tests hold the next generation to rejecting value instead.
 */
describe("Marketplace native value safety", function () {
    async function deployMarketplace() {
        const [deployer] = await hre.ethers.getSigners();
        const Marketplace = await hre.ethers.getContractFactory("Marketplace");
        const marketplace = await Marketplace.deploy(deployer.address);
        await marketplace.waitForDeployment();
        return { marketplace, deployer };
    }

    it("has no payable function in its ABI", async function () {
        const { marketplace } = await deployMarketplace();

        const payable = marketplace.interface.fragments.filter(
            (f: any) => f.type === "function" && f.stateMutability === "payable"
        );

        expect(
            payable.map((f: any) => f.name),
            "no function may accept native VC the contract cannot pay out"
        ).to.deep.equal([]);
    });

    it("declares no receive or fallback function", async function () {
        const { marketplace } = await deployMarketplace();

        const catchAll = marketplace.interface.fragments.filter((f: any) =>
            ["receive", "fallback"].includes(f.type)
        );

        expect(catchAll).to.deep.equal([]);
    });

    it("rejects a plain native VC transfer", async function () {
        const { marketplace, deployer } = await deployMarketplace();

        await expect(
            deployer.sendTransaction({
                to: await marketplace.getAddress(),
                value: hre.ethers.parseEther("1"),
            })
        ).to.be.reverted;

        expect(
            await hre.ethers.provider.getBalance(await marketplace.getAddress())
        ).to.equal(0n);
    });

    it("rejects a buyToken call that carries native VC", async function () {
        const { marketplace, deployer } = await deployMarketplace();
        const address = await marketplace.getAddress();

        // Encode the call by hand: a non-payable function cannot be sent value
        // through the typed interface, so the trap must be probed at the
        // transaction level, exactly as a mistaken wallet would hit it.
        const data = marketplace.interface.encodeFunctionData("buyToken", [
            address,
            1n,
            0n,
            1n,
            1n,
        ]);

        await expect(
            deployer.sendTransaction({
                to: address,
                data,
                value: hre.ethers.parseEther("1"),
            })
        ).to.be.reverted;

        expect(await hre.ethers.provider.getBalance(address)).to.equal(0n);
    });
});
