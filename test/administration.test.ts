import { expect } from "chai";
import hre from "hardhat";
import { Marketplace } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Every privileged operation on the Marketplace, and every way the privilege
 * itself can move. The suite covered what the owner may do; nothing covered
 * ownership changing hands, or what remains reachable once it is renounced.
 */
describe("Marketplace administration", function () {
    let marketplace: Marketplace;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;
    let bob: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer, alice, bob] = await hre.ethers.getSigners();
        const Factory = await hre.ethers.getContractFactory("Marketplace");
        marketplace = await Factory.deploy(deployer.address);
    });

    it("starts owned by the deployer", async function () {
        expect(await marketplace.owner()).to.equal(deployer.address);
    });

    it("transfers ownership observably, and the privilege moves with it", async function () {
        await expect(marketplace.transferOwnership(alice.address))
            .to.emit(marketplace, "OwnershipTransferred")
            .withArgs(deployer.address, alice.address);

        expect(await marketplace.owner()).to.equal(alice.address);

        // The new owner can act...
        await expect(marketplace.connect(alice).pause())
            .to.emit(marketplace, "Paused")
            .withArgs(alice.address);

        // ...and the previous one cannot.
        await expect(marketplace.connect(deployer).unpause())
            .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
            .withArgs(deployer.address);
    });

    it("refuses ownership transfer from a non-owner and to the zero address", async function () {
        await expect(marketplace.connect(bob).transferOwnership(bob.address))
            .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
            .withArgs(bob.address);

        await expect(
            marketplace.transferOwnership(hre.ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(marketplace, "OwnableInvalidOwner");

        expect(await marketplace.owner()).to.equal(deployer.address);
    });

    it("renouncing ownership permanently disables every privileged operation", async function () {
        await expect(marketplace.renounceOwnership())
            .to.emit(marketplace, "OwnershipTransferred")
            .withArgs(deployer.address, hre.ethers.ZeroAddress);

        expect(await marketplace.owner()).to.equal(hre.ethers.ZeroAddress);

        // Trading keeps working; only administration is gone. Renouncing is
        // therefore irreversible loss of pause and fee control, including the
        // ability to pause during an incident.
        for (const call of [
            () => marketplace.pause(),
            () => marketplace.setCommissionAccount(alice.address),
            () => marketplace.decreasePlatformFeePercentage(100),
            () => marketplace.requestPlatformFeePercentageIncrease(600),
            () => marketplace.transferOwnership(alice.address),
        ]) {
            await expect(call()).to.be.revertedWithCustomError(
                marketplace,
                "OwnableUnauthorizedAccount"
            );
        }
    });

    it("pause and unpause are observable and owner-only", async function () {
        await expect(marketplace.connect(bob).pause()).to.be.revertedWithCustomError(
            marketplace,
            "OwnableUnauthorizedAccount"
        );

        await expect(marketplace.pause()).to.emit(marketplace, "Paused").withArgs(deployer.address);
        expect(await marketplace.paused()).to.equal(true);

        await expect(marketplace.connect(bob).unpause()).to.be.revertedWithCustomError(
            marketplace,
            "OwnableUnauthorizedAccount"
        );

        await expect(marketplace.unpause())
            .to.emit(marketplace, "Unpaused")
            .withArgs(deployer.address);
        expect(await marketplace.paused()).to.equal(false);
    });

    it("pausing twice or unpausing while running is rejected", async function () {
        await marketplace.pause();
        await expect(marketplace.pause()).to.be.revertedWithCustomError(
            marketplace,
            "EnforcedPause"
        );
        await marketplace.unpause();
        await expect(marketplace.unpause()).to.be.revertedWithCustomError(
            marketplace,
            "ExpectedPause"
        );
    });

    it("a decrease abandons any armed fee increase, so it cannot fire without fresh notice", async function () {
        await marketplace.requestPlatformFeePercentageIncrease(900);
        expect(await marketplace.newPlatformFeePercentage()).to.equal(900n);
        expect(await marketplace.lock()).to.not.equal(0n);

        await marketplace.decreasePlatformFeePercentage(100);
        expect(await marketplace.platformFeePercentage()).to.equal(100n);
        expect(await marketplace.newPlatformFeePercentage()).to.equal(0n);
        expect(await marketplace.lock()).to.equal(0n);

        // Without this, a matured request survived the decrease and could jump
        // the fee straight back to 9% with no further notice to users.
        const { time } = await import("@nomicfoundation/hardhat-toolbox/network-helpers");
        await time.setNextBlockTimestamp((await time.latest()) + 3600 * 24 * 7);
        await expect(
            marketplace.applyPlatformFeePercentageIncrease()
        ).to.be.revertedWith("NFTCommissions: platform fee percentage increase must be first requested");
        expect(await marketplace.platformFeePercentage()).to.equal(100n);
    });

    it("commission account changes are owner-only, reject the zero address, and are observable", async function () {
        await expect(
            marketplace.connect(bob).setCommissionAccount(bob.address)
        ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");

        await expect(
            marketplace.setCommissionAccount(hre.ethers.ZeroAddress)
        ).to.be.revertedWith("NFTCommissions: commission account cannot be zero address");

        await expect(marketplace.setCommissionAccount(alice.address))
            .to.emit(marketplace, "CommissionAccountChanged")
            .withArgs(deployer.address, alice.address);

        expect(await marketplace.commissionAccount()).to.equal(alice.address);
    });
});
