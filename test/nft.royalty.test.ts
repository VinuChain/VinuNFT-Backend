import { expect } from "chai";
import hre from "hardhat";
import { ImageNFT, TextNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ERC2981 denominator is 10_000 (basis points)
const ROYALTY_DENOMINATOR = 10000n;

describe("NFT royalty bounds", function () {
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer, alice] = await hre.ethers.getSigners();
    });

    // ------------------------------------------------------------------ //
    //  TextNFT                                                            //
    // ------------------------------------------------------------------ //

    describe("TextNFT", function () {
        let textNFT: TextNFT;

        beforeEach(async function () {
            const TextNFT = await hre.ethers.getContractFactory("TextNFT");
            textNFT = await TextNFT.deploy(
                "TextNFT",
                "ZNG",
                "test description",
                "test image uri",
                "test external link"
            );
        });

        it("minting with royaltyNumerator_=10001 reverts with ERC2981InvalidTokenRoyalty", async function () {
            await expect(
                textNFT.connect(alice).mint(
                    "data:text/plain;base64,SGVsbG8=",
                    "Test Token",
                    "Test Description",
                    1,
                    10001, // > 10000 denominator
                    alice.address,
                    Buffer.from("")
                )
            ).to.be.revertedWithCustomError(textNFT, "ERC2981InvalidTokenRoyalty");
        });

        it("minting with royaltyNumerator_=10000 (100%) succeeds and royaltyInfo returns the full salePrice as royalty", async function () {
            await textNFT.connect(alice).mint(
                "data:text/plain;base64,SGVsbG8=",
                "Test Token",
                "Test Description",
                1,
                10000, // 100%
                alice.address,
                Buffer.from("")
            );
            const tokenId = await textNFT.lastTokenId();
            const salePrice = 1000n;
            const [receiver, royaltyAmount] = await textNFT.royaltyInfo(tokenId, salePrice);

            expect(receiver).to.equal(alice.address);
            // 100% of salePrice
            expect(royaltyAmount).to.equal(salePrice);
        });

        it("minting with royaltyNumerator_=1000 returns 10% of salePrice from royaltyInfo", async function () {
            await textNFT.connect(alice).mint(
                "data:text/plain;base64,SGVsbG8=",
                "Test Token",
                "Test Description",
                1,
                1000, // 10%
                alice.address,
                Buffer.from("")
            );
            const tokenId = await textNFT.lastTokenId();
            const salePrice = 500n;
            const [receiver, royaltyAmount] = await textNFT.royaltyInfo(tokenId, salePrice);

            expect(receiver).to.equal(alice.address);
            // 10% of salePrice = 50
            expect(royaltyAmount).to.equal((salePrice * 1000n) / ROYALTY_DENOMINATOR);
        });
    });

    // ------------------------------------------------------------------ //
    //  ImageNFT                                                           //
    // ------------------------------------------------------------------ //

    describe("ImageNFT", function () {
        let imageNFT: ImageNFT;

        beforeEach(async function () {
            const ImageNFT = await hre.ethers.getContractFactory("ImageNFT");
            imageNFT = await ImageNFT.deploy();
        });

        it("minting with royaltyNumerator_=10001 reverts with ERC2981InvalidTokenRoyalty", async function () {
            await expect(
                imageNFT.connect(alice).mint(
                    "data:text/plain;base64,SGVsbG8=",
                    1,
                    10001, // > 10000 denominator
                    alice.address,
                    Buffer.from("")
                )
            ).to.be.revertedWithCustomError(imageNFT, "ERC2981InvalidTokenRoyalty");
        });

        it("minting with royaltyNumerator_=10000 (100%) succeeds and royaltyInfo returns the full salePrice as royalty", async function () {
            await imageNFT.connect(alice).mint(
                "data:text/plain;base64,SGVsbG8=",
                1,
                10000, // 100%
                alice.address,
                Buffer.from("")
            );
            const tokenId = await imageNFT.lastTokenId();
            const salePrice = 1000n;
            const [receiver, royaltyAmount] = await imageNFT.royaltyInfo(tokenId, salePrice);

            expect(receiver).to.equal(alice.address);
            // 100% of salePrice
            expect(royaltyAmount).to.equal(salePrice);
        });

        it("minting with royaltyNumerator_=1000 returns 10% of salePrice from royaltyInfo", async function () {
            await imageNFT.connect(alice).mint(
                "data:text/plain;base64,SGVsbG8=",
                1,
                1000, // 10%
                alice.address,
                Buffer.from("")
            );
            const tokenId = await imageNFT.lastTokenId();
            const salePrice = 500n;
            const [receiver, royaltyAmount] = await imageNFT.royaltyInfo(tokenId, salePrice);

            expect(receiver).to.equal(alice.address);
            // 10% of salePrice = 50
            expect(royaltyAmount).to.equal((salePrice * 1000n) / ROYALTY_DENOMINATOR);
        });
    });
});
