import { expect } from "chai";
import hre from "hardhat";
import { ImageNFT, TextNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const encodeTextURI = (text: string) => `data:text/plain;base64,${btoa(text)}`;

/**
 * The supply and provenance invariants every consumer relies on.
 *
 * The frontend now reads totalSupply(uint256) directly rather than replaying
 * mint events, and displays creator and royalty as provenance that survives
 * resale. Those are contract guarantees, so they are asserted here.
 */
for (const nftType of ["text", "image"] as const) {
    describe(`${nftType} NFT supply and provenance invariants`, function () {
        let nft: TextNFT | ImageNFT;
        let alice: HardhatEthersSigner;
        let bob: HardhatEthersSigner;
        let carol: HardhatEthersSigner;

        beforeEach(async function () {
            [, alice, bob, carol] = await hre.ethers.getSigners();
            if (nftType === "image") {
                nft = await (await hre.ethers.getContractFactory("ImageNFT")).deploy();
            } else {
                nft = await (
                    await hre.ethers.getContractFactory("TextNFT")
                ).deploy("TextNFT", "ZNG", "d", "i", "e");
            }
        });

        async function mint(
            minter: HardhatEthersSigner,
            amount: bigint,
            fee = 0,
            recipient?: string
        ) {
            const feeRecipient = recipient ?? minter.address;
            if (nftType === "image") {
                await (nft as ImageNFT)
                    .connect(minter)
                    .mint(encodeTextURI("art"), amount, fee, feeRecipient, Buffer.from(""));
            } else {
                await (nft as TextNFT)
                    .connect(minter)
                    .mint(encodeTextURI("art"), "n", "d", amount, fee, feeRecipient, Buffer.from(""));
            }
            return nft.lastTokenId();
        }

        /**
         * The defining ERC-1155 invariant: supply equals the sum of balances.
         *
         * The explicit `totalSupply(uint256)` signature is required because
         * OpenZeppelin 5's ERC1155Supply also declares a zero-argument
         * `totalSupply()`, which makes the bare name ambiguous. The deployed
         * generation predates that overload, which is why the frontend ABI
         * carries only the one-argument form; regenerating those ABIs from
         * these artifacts would reintroduce the ambiguity and break the
         * frontend's `totalSupply(id)` call. VN-DEPLOY-001 must handle that,
         * and the frontend suite asserts the ABI has exactly one overload.
         */
        async function assertSupplyMatchesBalances(id: bigint, holders: string[]) {
            const balances = await Promise.all(holders.map((h) => nft.balanceOf(h, id)));
            const summed = balances.reduce((a, b) => a + b, 0n);
            expect(summed, "sum of balances must equal totalSupply").to.equal(
                await nft["totalSupply(uint256)"](id)
            );
        }

        it("mint sets supply, balance, existence and the next token id", async function () {
            const id = await mint(alice, 100n);

            expect(id).to.equal(1n);
            expect(await nft["totalSupply(uint256)"](id)).to.equal(100n);
            expect(await nft.balanceOf(alice.address, id)).to.equal(100n);
            expect(await nft.exists(id)).to.equal(true);
            await assertSupplyMatchesBalances(id, [alice.address, bob.address, carol.address]);
        });

        it("successive mints get distinct ids that do not share supply", async function () {
            const first = await mint(alice, 10n);
            const second = await mint(bob, 7n);

            expect(second).to.equal(first + 1n);
            expect(await nft["totalSupply(uint256)"](first)).to.equal(10n);
            expect(await nft["totalSupply(uint256)"](second)).to.equal(7n);
            expect(await nft.balanceOf(alice.address, second)).to.equal(0n);
            expect(await nft.balanceOf(bob.address, first)).to.equal(0n);
        });

        it("transfer moves balance and leaves total supply untouched", async function () {
            const id = await mint(alice, 100n);
            const before = await nft["totalSupply(uint256)"](id);

            await nft.connect(alice).safeTransferFrom(alice.address, bob.address, id, 40n, "0x");

            expect(await nft["totalSupply(uint256)"](id)).to.equal(before);
            expect(await nft.balanceOf(alice.address, id)).to.equal(60n);
            expect(await nft.balanceOf(bob.address, id)).to.equal(40n);
            await assertSupplyMatchesBalances(id, [alice.address, bob.address, carol.address]);
        });

        it("a chain of transfers across three holders preserves total supply", async function () {
            const id = await mint(alice, 100n);

            await nft.connect(alice).safeTransferFrom(alice.address, bob.address, id, 50n, "0x");
            await nft.connect(bob).safeTransferFrom(bob.address, carol.address, id, 20n, "0x");
            await nft.connect(carol).safeTransferFrom(carol.address, alice.address, id, 5n, "0x");

            expect(await nft["totalSupply(uint256)"](id)).to.equal(100n);
            await assertSupplyMatchesBalances(id, [alice.address, bob.address, carol.address]);
        });

        it("burn reduces supply and balance by exactly the burned amount", async function () {
            const id = await mint(alice, 100n);

            await nft.connect(alice).burn(alice.address, id, 30n);

            expect(await nft["totalSupply(uint256)"](id)).to.equal(70n);
            expect(await nft.balanceOf(alice.address, id)).to.equal(70n);
            await assertSupplyMatchesBalances(id, [alice.address, bob.address, carol.address]);
        });

        it("burning every copy zeroes supply and the token stops existing", async function () {
            const id = await mint(alice, 5n);

            await nft.connect(alice).burn(alice.address, id, 5n);

            expect(await nft["totalSupply(uint256)"](id)).to.equal(0n);
            expect(await nft.exists(id)).to.equal(false);
            await assertSupplyMatchesBalances(id, [alice.address]);
        });

        it("a partial burn by one holder does not affect another holder's balance", async function () {
            const id = await mint(alice, 100n);
            await nft.connect(alice).safeTransferFrom(alice.address, bob.address, id, 40n, "0x");

            await nft.connect(bob).burn(bob.address, id, 10n);

            expect(await nft.balanceOf(alice.address, id)).to.equal(60n);
            expect(await nft.balanceOf(bob.address, id)).to.equal(30n);
            expect(await nft["totalSupply(uint256)"](id)).to.equal(90n);
            await assertSupplyMatchesBalances(id, [alice.address, bob.address, carol.address]);
        });

        it("supply cannot go negative: burning more than held reverts and changes nothing", async function () {
            const id = await mint(alice, 10n);

            await expect(nft.connect(alice).burn(alice.address, id, 11n)).to.be.reverted;

            expect(await nft["totalSupply(uint256)"](id)).to.equal(10n);
            expect(await nft.balanceOf(alice.address, id)).to.equal(10n);
        });

        it("creator and royalty survive transfer and partial burn", async function () {
            // Provenance is displayed as an immutable claim about the creator,
            // so it must not follow the current holder.
            const id = await mint(alice, 100n, 1000, alice.address);
            const [creatorBefore, feeBefore] = await nft.royaltyInfo(id, 10_000n);
            expect(creatorBefore).to.equal(alice.address);
            expect(feeBefore).to.equal(1000n);
            expect(await nft.authorOf(id)).to.equal(alice.address);

            await nft.connect(alice).safeTransferFrom(alice.address, bob.address, id, 100n, "0x");
            await nft.connect(bob).burn(bob.address, id, 1n);

            const [creatorAfter, feeAfter] = await nft.royaltyInfo(id, 10_000n);
            expect(creatorAfter).to.equal(alice.address);
            expect(feeAfter).to.equal(1000n);
            expect(await nft.authorOf(id)).to.equal(alice.address);
            expect(await nft.balanceOf(alice.address, id)).to.equal(0n);
        });

        it("royalty may be directed to someone other than the minter", async function () {
            const id = await mint(alice, 1n, 500, carol.address);

            const [recipient, fee] = await nft.royaltyInfo(id, 10_000n);
            expect(recipient).to.equal(carol.address);
            expect(fee).to.equal(500n);
            expect(await nft.authorOf(id)).to.equal(alice.address);
        });
    });
}
