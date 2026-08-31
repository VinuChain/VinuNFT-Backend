import { expect } from "chai";
import hre from "hardhat";
import { Marketplace, MockERC20, TextNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const encodeTextURI = (text: string) =>
    `data:text/plain;base64,${btoa(text)}`;

/**
 * The marketplace events are the contract's public data interface: the
 * frontend's activity and NFT history are built entirely by decoding them, and
 * any future indexer will be too. Argument order, argument *names*, and which
 * parameters are indexed are therefore part of the contract, not incidental.
 *
 * The rest of the suite exercises behaviour and asserts state. Nothing asserted
 * the emitted arguments, so a reordered or renamed parameter would have passed
 * every existing test while silently breaking every consumer.
 */
describe("Marketplace event contract", function () {
    let nft: TextNFT;
    let marketplace: Marketplace;
    let paymentToken: MockERC20;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;
    let bob: HardhatEthersSigner;

    const PRICE = 1000n;

    beforeEach(async function () {
        [deployer, alice, bob] = await hre.ethers.getSigners();

        const TextNFTFactory = await hre.ethers.getContractFactory("TextNFT");
        nft = await TextNFTFactory.deploy("TextNFT", "ZNG", "d", "i", "e");

        const MarketplaceFactory = await hre.ethers.getContractFactory("Marketplace");
        marketplace = await MarketplaceFactory.deploy(deployer.address);

        const MockERC20Factory = await hre.ethers.getContractFactory("MockERC20");
        paymentToken = await MockERC20Factory.deploy();
    });

    async function mintAndApprove(amount: bigint) {
        await nft
            .connect(alice)
            .mint(encodeTextURI("hi"), "n", "d", amount, 0, alice.address, Buffer.from(""));
        await nft.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
        return nft.lastTokenId();
    }

    async function fundBuyer(amount: bigint) {
        await paymentToken.connect(bob).mint(amount);
        await paymentToken.connect(bob).approve(await marketplace.getAddress(), amount);
    }

    // --- argument order ------------------------------------------------------

    it("TokenListed carries nftAddress, tokenId, seller, listingId, amount, paymentToken, price", async function () {
        const tokenId = await mintAndApprove(10n);

        await expect(
            marketplace
                .connect(alice)
                .listToken(await nft.getAddress(), tokenId, await paymentToken.getAddress(), PRICE, 4n)
        )
            .to.emit(marketplace, "TokenListed")
            .withArgs(
                await nft.getAddress(),
                tokenId,
                alice.address,
                0n,
                4n,
                await paymentToken.getAddress(),
                PRICE
            );
    });

    it("editListing re-emits TokenListed with the same listing id and the new terms", async function () {
        const tokenId = await mintAndApprove(10n);
        await marketplace
            .connect(alice)
            .listToken(await nft.getAddress(), tokenId, await paymentToken.getAddress(), PRICE, 4n);

        // Consumers see an edit as another TokenListed for an existing id, not
        // as a distinct event. History rendering depends on that.
        await expect(
            marketplace
                .connect(alice)
                .editListing(await nft.getAddress(), tokenId, 0n, PRICE * 2n, 2n, -1n)
        )
            .to.emit(marketplace, "TokenListed")
            .withArgs(
                await nft.getAddress(),
                tokenId,
                alice.address,
                0n,
                2n,
                await paymentToken.getAddress(),
                PRICE * 2n
            );
    });

    it("TokenDelisted carries nftAddress, tokenId, seller, listingId", async function () {
        const tokenId = await mintAndApprove(10n);
        await marketplace
            .connect(alice)
            .listToken(await nft.getAddress(), tokenId, await paymentToken.getAddress(), PRICE, 4n);

        await expect(marketplace.connect(alice).delistToken(await nft.getAddress(), tokenId, 0n))
            .to.emit(marketplace, "TokenDelisted")
            .withArgs(await nft.getAddress(), tokenId, alice.address, 0n);
    });

    it("TokenPurchased carries nftAddress, tokenId, seller, buyer, listingId, amount, paymentToken, price", async function () {
        const tokenId = await mintAndApprove(10n);
        await marketplace
            .connect(alice)
            .listToken(await nft.getAddress(), tokenId, await paymentToken.getAddress(), PRICE, 4n);
        await fundBuyer(PRICE * 4n);

        await expect(
            marketplace.connect(bob).buyToken(await nft.getAddress(), tokenId, 0n, 2n, PRICE)
        )
            .to.emit(marketplace, "TokenPurchased")
            .withArgs(
                await nft.getAddress(),
                tokenId,
                alice.address,
                bob.address,
                0n,
                2n,
                await paymentToken.getAddress(),
                PRICE
            );
    });

    it("a purchase that exhausts a listing emits TokenPurchased and TokenDelisted in the same transaction", async function () {
        const tokenId = await mintAndApprove(10n);
        await marketplace
            .connect(alice)
            .listToken(await nft.getAddress(), tokenId, await paymentToken.getAddress(), PRICE, 2n);
        await fundBuyer(PRICE * 2n);

        // Consumers must dedupe these, or one purchase renders as several
        // unrelated activity rows.
        const tx = marketplace
            .connect(bob)
            .buyToken(await nft.getAddress(), tokenId, 0n, 2n, PRICE);
        await expect(tx).to.emit(marketplace, "TokenPurchased");
        await expect(tx).to.emit(marketplace, "TokenDelisted");
        await expect(tx).to.emit(nft, "TransferSingle");
    });

    // --- argument names and indexing ----------------------------------------

    const EXPECTED = {
        TokenListed: [
            ["_nftAddress", true],
            ["_tokenId", true],
            ["_seller", true],
            ["_listingId", false],
            ["amount", false],
            ["_paymentToken", false],
            ["_price", false],
        ],
        TokenDelisted: [
            ["_nftAddress", true],
            ["_tokenId", true],
            ["_seller", true],
            ["_listingId", false],
        ],
        TokenPurchased: [
            ["_nftAddress", true],
            ["_tokenId", true],
            ["_seller", true],
            ["_buyer", false],
            ["_listingId", false],
            ["_amount", false],
            ["_paymentToken", false],
            ["_price", false],
        ],
    } as const;

    for (const [eventName, fields] of Object.entries(EXPECTED)) {
        it(`${eventName} keeps its parameter names and indexing`, async function () {
            const fragment = marketplace.interface.getEvent(eventName as any)!;

            // Consumers read args by name. Note TokenListed uses `amount` while
            // TokenPurchased uses `_amount`; the frontend carries an explicit
            // note about that asymmetry, so renaming either breaks it silently.
            expect(fragment.inputs.map((i) => i.name)).to.deep.equal(
                fields.map(([name]) => name)
            );

            // The first three are indexed so history can filter by contract,
            // token and seller without downloading every log.
            expect(fragment.inputs.map((i) => i.indexed)).to.deep.equal(
                fields.map(([, indexed]) => indexed)
            );
        });
    }

    it("mint, transfer and burn each emit TransferSingle with the zero address on the minting and burning side", async function () {
        const tokenId = await mintAndApprove(10n);

        await expect(
            nft.connect(alice).safeTransferFrom(alice.address, bob.address, tokenId, 3n, "0x")
        )
            .to.emit(nft, "TransferSingle")
            .withArgs(alice.address, alice.address, bob.address, tokenId, 3n);

        await expect(nft.connect(bob).burn(bob.address, tokenId, 1n))
            .to.emit(nft, "TransferSingle")
            .withArgs(bob.address, bob.address, hre.ethers.ZeroAddress, tokenId, 1n);
    });
});
