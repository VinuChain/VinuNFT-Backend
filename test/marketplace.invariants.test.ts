import { expect } from "chai";
import hre from "hardhat";
import {
    Marketplace,
    MockERC20,
    ImageNFT,
    FeeOnTransferERC20,
    ReturnsFalseERC20,
    RevertingERC20,
    ReentrantERC1155Receiver,
    MockRoyaltyNFT,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Settlement math mirrors _handleFunds in Marketplace.sol
function computeLegs(price: bigint, royaltyNumerator: bigint) {
    const platformFee = (price * 500n) / 10000n;
    const remainder = price - platformFee;
    const creatorFee = (remainder * royaltyNumerator) / 10000n;
    const sellerEarnings = remainder - creatorFee;
    return { platformFee, creatorFee, sellerEarnings };
}

describe("Marketplace invariants", function () {
    let nftContract: ImageNFT;
    let marketplace: Marketplace;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;
    let bob: HardhatEthersSigner;
    let charlie: HardhatEthersSigner;
    let paymentToken: MockERC20;

    async function mintNft(
        minter: HardhatEthersSigner,
        amount: number,
        royaltyNumerator: number,
        royaltyRecipient: string
    ): Promise<bigint> {
        await nftContract.connect(minter).mint(
            "data:text/plain;base64,SGVsbG8=",
            amount,
            royaltyNumerator,
            royaltyRecipient,
            Buffer.from("")
        );
        return await nftContract.lastTokenId();
    }

    beforeEach(async function () {
        const [d, a, b, c] = await hre.ethers.getSigners();
        deployer = d;
        alice = a;
        bob = b;
        charlie = c;

        const ImageNFT = await hre.ethers.getContractFactory("ImageNFT");
        nftContract = await ImageNFT.deploy();

        const Marketplace = await hre.ethers.getContractFactory("Marketplace");
        marketplace = await Marketplace.deploy(deployer.address);

        const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
        paymentToken = await MockERC20.deploy();
    });

    // ------------------------------------------------------------------ //
    //  1. Conservation invariant — table-driven                           //
    // ------------------------------------------------------------------ //

    describe("conservation invariant (table-driven)", function () {
        const prices = [1n, 7n, 19n, 100n, 333n];
        const royalties = [0n, 250n, 1000n];

        for (const price of prices) {
            for (const royalty of royalties) {
                it(`price=${price} royalty=${royalty}bps: each leg is correct and legs sum to price`, async function () {
                    const { platformFee, creatorFee, sellerEarnings } = computeLegs(price, royalty);

                    const tokenId = await mintNft(alice, 1, Number(royalty), charlie.address);

                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace
                        .connect(alice)
                        .listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    const buyerBefore = await paymentToken.balanceOf(bob.address);
                    const sellerBefore = await paymentToken.balanceOf(alice.address);
                    const commissionBefore = await paymentToken.balanceOf(deployer.address);
                    const creatorBefore = await paymentToken.balanceOf(charlie.address);

                    await marketplace.connect(bob).buyToken(
                        await nftContract.getAddress(), tokenId, listingId, 1, price
                    );

                    const buyerDelta = buyerBefore - (await paymentToken.balanceOf(bob.address));
                    const sellerDelta = (await paymentToken.balanceOf(alice.address)) - sellerBefore;
                    const commissionDelta = (await paymentToken.balanceOf(deployer.address)) - commissionBefore;
                    const creatorDelta = (await paymentToken.balanceOf(charlie.address)) - creatorBefore;

                    // Buyer paid exactly price
                    expect(buyerDelta).to.equal(price);

                    // Each leg equals computed expectation
                    expect(sellerDelta).to.equal(sellerEarnings, "seller earnings mismatch");
                    expect(commissionDelta).to.equal(platformFee, "platform fee mismatch");
                    expect(creatorDelta).to.equal(creatorFee, "creator fee mismatch");

                    // Conservation: all legs sum to price
                    expect(sellerDelta + commissionDelta + creatorDelta).to.equal(
                        price,
                        "legs do not sum to price"
                    );
                });
            }
        }
    });

    // ------------------------------------------------------------------ //
    //  2. Low-price rounding: price 19, royalty 0, platformFee floors to 0 //
    // ------------------------------------------------------------------ //

    describe("low-price rounding", function () {
        it("price=19, royalty=0: platformFee=0, seller receives full 19, marketplace balance stays 0", async function () {
            const price = 19n;
            const royalty = 0n;
            const { platformFee, sellerEarnings } = computeLegs(price, royalty);

            // Sanity-check the computed expectation matches the plan's claim
            expect(platformFee).to.equal(0n, "expected platformFee=0 for price=19");
            expect(sellerEarnings).to.equal(19n, "expected seller to receive full 19");

            const tokenId = await mintNft(alice, 1, 0, alice.address);
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

            await paymentToken.connect(bob).mint(price);
            await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

            const sellerBefore = await paymentToken.balanceOf(alice.address);
            const commissionBefore = await paymentToken.balanceOf(deployer.address);

            await marketplace.connect(bob).buyToken(
                await nftContract.getAddress(), tokenId, listingId, 1, price
            );

            const sellerDelta = (await paymentToken.balanceOf(alice.address)) - sellerBefore;
            const commissionDelta = (await paymentToken.balanceOf(deployer.address)) - commissionBefore;

            expect(sellerDelta).to.equal(19n, "seller should receive the full 19");
            expect(commissionDelta).to.equal(0n, "commission account should receive 0");

            // No wei stranded in the marketplace
            expect(await paymentToken.balanceOf(await marketplace.getAddress())).to.equal(
                0n,
                "marketplace token balance must stay 0"
            );
        });
    });

    // ------------------------------------------------------------------ //
    //  3. Reentrancy: re-enter buyToken from onERC1155Received            //
    // ------------------------------------------------------------------ //

    describe("reentrancy", function () {
        it("re-entering buyToken from onERC1155Received reverts with ReentrancyGuardReentrantCall", async function () {
            const price = 100n;
            const royalty = 0n;

            // Mint two tokens (two separate NFTs so we have two independent listings)
            const tokenId1 = await mintNft(alice, 2, Number(royalty), alice.address);

            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

            // Listing 0: the outer buy (receiver buys this)
            const listingId0 = await marketplace.listingCount(await nftContract.getAddress(), tokenId1);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId1, await paymentToken.getAddress(), price, 1);

            // Listing 1: the re-entrant buy target
            const listingId1 = await marketplace.listingCount(await nftContract.getAddress(), tokenId1);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId1, await paymentToken.getAddress(), price, 1);

            // Deploy receiver and fund it with enough tokens for both purchases
            const ReentrantReceiver = await hre.ethers.getContractFactory("ReentrantERC1155Receiver");
            const receiver = await ReentrantReceiver.deploy(await marketplace.getAddress());

            // Fund the receiver: it needs price for outer buy + price for re-entrant buy
            // We use paymentToken.mint which mints to msg.sender; we need the receiver's address
            // to hold tokens, so we mint to bob and transfer to receiver.
            await paymentToken.connect(bob).mint(price * 2n);
            await paymentToken.connect(bob).transfer(await receiver.getAddress(), price * 2n);

            // Setup receiver's re-entrant call parameters (listingId1 is the re-entrant target)
            await receiver.setup(
                await nftContract.getAddress(),
                tokenId1,
                listingId1,
                1,
                price,
                await paymentToken.getAddress()
            );
            // Receiver already approved marketplace for max in setup()

            // The outer call: receiver calls buyToken for listingId0
            // This triggers onERC1155Received → re-enter buyToken for listingId1 → nonReentrant reverts
            // The revert propagates up through onERC1155Received → the whole outer tx reverts
            const receiverAddr = await receiver.getAddress();
            const marketplaceAddr = await marketplace.getAddress();

            // Receiver needs to call buyToken — connect as receiver via impersonation
            await hre.network.provider.send("hardhat_impersonateAccount", [receiverAddr]);
            await hre.network.provider.send("hardhat_setBalance", [receiverAddr, "0x56BC75E2D63100000"]);
            const receiverSigner = await hre.ethers.getSigner(receiverAddr);

            // Approve marketplace from receiver (already done in setup, but confirm)
            // The outer buyToken call is made by the receiver itself
            await expect(
                marketplace.connect(receiverSigner).buyToken(
                    await nftContract.getAddress(), tokenId1, listingId0, 1, price
                )
            ).to.be.revertedWithCustomError(marketplace, "ReentrancyGuardReentrantCall");

            await hre.network.provider.send("hardhat_stopImpersonatingAccount", [receiverAddr]);

            // Balances must be unchanged (transaction reverted)
            expect(await paymentToken.balanceOf(receiverAddr)).to.equal(
                price * 2n,
                "receiver balance should be unchanged after revert"
            );
            expect(await paymentToken.balanceOf(alice.address)).to.equal(
                0n,
                "seller balance should be unchanged after revert"
            );
        });
    });

    // ------------------------------------------------------------------ //
    //  4. Approval revoked after listing                                   //
    // ------------------------------------------------------------------ //

    describe("approval revoked after listing", function () {
        it("revoking NFT approval after listing causes buyToken to revert and buyer balance is unchanged", async function () {
            const price = 100n;

            const tokenId = await mintNft(alice, 1, 0, alice.address);
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

            // Revoke approval
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), false);

            await paymentToken.connect(bob).mint(price);
            await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

            const buyerBefore = await paymentToken.balanceOf(bob.address);

            await expect(
                marketplace.connect(bob).buyToken(
                    await nftContract.getAddress(), tokenId, listingId, 1, price
                )
            ).to.be.reverted; // ERC1155: caller is not token owner or approved

            // Buyer's payment-token balance must be unchanged
            expect(await paymentToken.balanceOf(bob.address)).to.equal(
                buyerBefore,
                "buyer balance must be unchanged when buyToken reverts"
            );
        });
    });

    // ------------------------------------------------------------------ //
    //  5. Adversarial tokens                                              //
    // ------------------------------------------------------------------ //

    describe("adversarial tokens", function () {
        it("FeeOnTransferERC20: seller receives less than sellerEarnings (fee-on-transfer, characterization)", async function () {
            // characterization: documents current behavior — SafeERC20 does not detect
            // fee-on-transfer; the marketplace does not validate received amounts.
            const price = 100n;
            const royalty = 0n;
            const { sellerEarnings } = computeLegs(price, royalty);

            const FeeOnTransfer = await hre.ethers.getContractFactory("FeeOnTransferERC20");
            const feeToken = await FeeOnTransfer.deploy();

            const tokenId = await mintNft(alice, 1, 0, alice.address);
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId, await feeToken.getAddress(), price, 1);

            // Fund buyer with enough to pass the allowance check
            // (the allowance check uses the nominal price, but actual transfer delivers less)
            await feeToken.connect(bob).mint(price);
            await feeToken.connect(bob).approve(await marketplace.getAddress(), price);

            const sellerBefore = await feeToken.balanceOf(alice.address);

            await marketplace.connect(bob).buyToken(
                await nftContract.getAddress(), tokenId, listingId, 1, price
            );

            const sellerDelta = (await feeToken.balanceOf(alice.address)) - sellerBefore;

            // characterization: documents current behavior
            // The seller receives less than the nominal sellerEarnings because each
            // safeTransferFrom incurs the 10% fee-on-transfer burn.
            expect(sellerDelta).to.be.lessThan(
                sellerEarnings,
                "seller should receive less than sellerEarnings when payment token charges a transfer fee"
            );
        });

        it("ReturnsFalseERC20: buyToken reverts (SafeERC20 turns false return into revert)", async function () {
            const price = 100n;

            const ReturnsFalse = await hre.ethers.getContractFactory("ReturnsFalseERC20");
            const falseToken = await ReturnsFalse.deploy();

            const tokenId = await mintNft(alice, 1, 0, alice.address);
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId, await falseToken.getAddress(), price, 1);

            await falseToken.connect(bob).mint(price);
            // allowance check in marketplace uses allowance(); ReturnsFalseERC20 inherits
            // the standard allowance() — only transferFrom returns false.
            await falseToken.connect(bob).approve(await marketplace.getAddress(), price);

            await expect(
                marketplace.connect(bob).buyToken(
                    await nftContract.getAddress(), tokenId, listingId, 1, price
                )
            ).to.be.reverted; // SafeERC20: ERC20 operation did not succeed
        });

        it("RevertingERC20 blocking commissionAccount: buyToken reverts", async function () {
            const price = 100n;

            // Block the commission account (deployer)
            const Reverting = await hre.ethers.getContractFactory("RevertingERC20");
            const revertToken = await Reverting.deploy(deployer.address);

            const tokenId = await mintNft(alice, 1, 0, alice.address);
            await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await nftContract.getAddress(), tokenId, await revertToken.getAddress(), price, 1);

            await revertToken.connect(bob).mint(price);
            await revertToken.connect(bob).approve(await marketplace.getAddress(), price);

            await expect(
                marketplace.connect(bob).buyToken(
                    await nftContract.getAddress(), tokenId, listingId, 1, price
                )
            ).to.be.revertedWith("blocked");
        });
    });

    // ------------------------------------------------------------------ //
    //  6. Adversarial royalty NFT (malformed ERC2981 data)               //
    // ------------------------------------------------------------------ //

    describe("adversarial royalty NFT", function () {
        // price=100 → platformFee = 100 * 500 / 10000 = 5, remainder = 95.
        const price = 100n;
        const platformFee = 5n;
        const remainder = price - platformFee; // 95n

        // Mint a MockRoyaltyNFT to `minter`, return its token id.
        async function mintRoyaltyNft(
            nft: MockRoyaltyNFT,
            minter: HardhatEthersSigner,
            amount: number
        ): Promise<bigint> {
            await nft.connect(minter).mint(amount);
            return await nft.lastTokenId();
        }

        let royaltyNft: MockRoyaltyNFT;
        let tokenId: bigint;
        let listingId: bigint;

        beforeEach(async function () {
            const MockRoyaltyNFTFactory = await hre.ethers.getContractFactory("MockRoyaltyNFT");
            royaltyNft = await MockRoyaltyNFTFactory.deploy();

            // alice mints and lists 1 copy for `price`, paid in paymentToken.
            tokenId = await mintRoyaltyNft(royaltyNft, alice, 1);
            await royaltyNft.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
            listingId = await marketplace.listingCount(await royaltyNft.getAddress(), tokenId);
            await marketplace
                .connect(alice)
                .listToken(await royaltyNft.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

            // bob funds and approves the purchase.
            await paymentToken.connect(bob).mint(price);
            await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);
        });

        it("zero-address creator with nonzero fee: sale succeeds, fee stays with the seller, nothing sent to address(0)", async function () {
            // Malformed ERC2981: a nonzero royalty owed to address(0).
            await royaltyNft.setRoyalty(ZERO_ADDRESS, 40n);

            const sellerBefore = await paymentToken.balanceOf(alice.address);
            const commissionBefore = await paymentToken.balanceOf(deployer.address);
            const zeroBefore = await paymentToken.balanceOf(ZERO_ADDRESS);

            // Must NOT revert (a transfer to address(0) would).
            await marketplace.connect(bob).buyToken(
                await royaltyNft.getAddress(), tokenId, listingId, 1, price
            );

            const sellerDelta = (await paymentToken.balanceOf(alice.address)) - sellerBefore;
            const commissionDelta = (await paymentToken.balanceOf(deployer.address)) - commissionBefore;
            const zeroDelta = (await paymentToken.balanceOf(ZERO_ADDRESS)) - zeroBefore;

            // Royalty skipped: seller receives the full remainder, platform fee paid.
            expect(sellerDelta).to.equal(remainder, "seller should receive the full remainder");
            expect(commissionDelta).to.equal(platformFee, "platform fee should be paid");
            // Nothing burned to address(0).
            expect(zeroDelta).to.equal(0n, "no payment should be sent to address(0)");
            // Buyer received the NFT.
            expect(await royaltyNft.balanceOf(bob.address, tokenId)).to.equal(1n);
            // Legs still sum to price.
            expect(sellerDelta + commissionDelta).to.equal(price, "legs should sum to price");
            // No wei stranded in the marketplace.
            expect(await paymentToken.balanceOf(await marketplace.getAddress())).to.equal(0n);
        });

        it("oversized fee: sale succeeds, royalty is clamped to the remainder, seller receives 0", async function () {
            // Malformed ERC2981: an absolute fee larger than the remainder.
            // Without the clamp this underflows (remainder - creatorFee) and reverts every sale.
            const oversized = remainder + 100n; // 195n > 95n
            await royaltyNft.setRoyalty(charlie.address, oversized);

            const sellerBefore = await paymentToken.balanceOf(alice.address);
            const commissionBefore = await paymentToken.balanceOf(deployer.address);
            const creatorBefore = await paymentToken.balanceOf(charlie.address);

            // Must NOT revert (an unclamped underflow would).
            await marketplace.connect(bob).buyToken(
                await royaltyNft.getAddress(), tokenId, listingId, 1, price
            );

            const sellerDelta = (await paymentToken.balanceOf(alice.address)) - sellerBefore;
            const commissionDelta = (await paymentToken.balanceOf(deployer.address)) - commissionBefore;
            const creatorDelta = (await paymentToken.balanceOf(charlie.address)) - creatorBefore;

            // Fee clamped to the remainder; seller gets nothing; platform fee still paid.
            expect(creatorDelta).to.equal(remainder, "creator fee should be clamped to the remainder");
            expect(sellerDelta).to.equal(0n, "seller should receive 0 when the fee consumes the remainder");
            expect(commissionDelta).to.equal(platformFee, "platform fee should be paid");
            // Buyer received the NFT.
            expect(await royaltyNft.balanceOf(bob.address, tokenId)).to.equal(1n);
            // Legs still sum to price.
            expect(sellerDelta + commissionDelta + creatorDelta).to.equal(price, "legs should sum to price");
            // No wei stranded in the marketplace.
            expect(await paymentToken.balanceOf(await marketplace.getAddress())).to.equal(0n);
        });

        it("regression: an in-bounds royalty still splits correctly between creator and seller", async function () {
            // Well-formed: an absolute fee below the remainder.
            const fee = 40n;
            await royaltyNft.setRoyalty(charlie.address, fee);

            const sellerBefore = await paymentToken.balanceOf(alice.address);
            const commissionBefore = await paymentToken.balanceOf(deployer.address);
            const creatorBefore = await paymentToken.balanceOf(charlie.address);

            await marketplace.connect(bob).buyToken(
                await royaltyNft.getAddress(), tokenId, listingId, 1, price
            );

            const sellerDelta = (await paymentToken.balanceOf(alice.address)) - sellerBefore;
            const commissionDelta = (await paymentToken.balanceOf(deployer.address)) - commissionBefore;
            const creatorDelta = (await paymentToken.balanceOf(charlie.address)) - creatorBefore;

            expect(creatorDelta).to.equal(fee, "creator should receive the royalty");
            expect(sellerDelta).to.equal(remainder - fee, "seller should receive remainder minus royalty");
            expect(commissionDelta).to.equal(platformFee, "platform fee should be paid");
            // Legs still sum to price.
            expect(sellerDelta + commissionDelta + creatorDelta).to.equal(price, "legs should sum to price");
            // No wei stranded in the marketplace.
            expect(await paymentToken.balanceOf(await marketplace.getAddress())).to.equal(0n);
        });
    });
});
