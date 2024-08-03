import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { Marketplace, MockERC20, ZangNFT, ZangNFT__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTING_AMOUNT = BigInt(2) ** BigInt(255) - BigInt(1);

const toBase64 = (data: string) => Buffer.from(data).toString("base64");
const base64ToBytes = (data: string) => Buffer.from(data, "base64");

function parseContractURI(contractURI: string) {
    expect(contractURI).to.match(/^data:application\/json;base64,/);
    const data = contractURI.split(",")[1];
    
    return JSON.parse(atob(data));
}

function encodeContractURI(data: any) {
    return `data:application/json;base64,${btoa(JSON.stringify(data))}`;
}

function parseTextURI(textURI: string) {
    expect(textURI).to.match(/^data:text\/plain;base64,/);
    const data = textURI.split(",")[1];
    return atob(data);
}

function encodeTextURI(text: string) {
    return `data:text/plain;base64,${btoa(text)}`;
}


describe("Marketplace", function () {
    describe("deployment", function () {
        it("deploys Marketplace", async function () {
            const [deployer] = await hre.ethers.getSigners();

            const Marketplace = await hre.ethers.getContractFactory("Marketplace");
            const marketplace = await Marketplace.deploy(
                deployer.address
            );

            expect(await marketplace.commissionAccount()).to.equal(deployer.address);
        });
    })
    describe("execution", function () {
        let zangNFT: ZangNFT;
        let marketplace : Marketplace;
        let deployer : HardhatEthersSigner;
        let alice: HardhatEthersSigner;
        let bob: HardhatEthersSigner;
        let paymentToken: MockERC20;

        beforeEach(async function () {
            const [d, a, b] = await hre.ethers.getSigners();
            deployer = d;
            alice = a;
            bob = b;

            const ZangNFT = await hre.ethers.getContractFactory("ZangNFT");
            zangNFT = await ZangNFT.deploy(
                "ZangNFT",
                "ZNG",
                "zang description",
                "zang image uri",
                "zang external link"
            );

            const Marketplace = await hre.ethers.getContractFactory("Marketplace");
            marketplace = await Marketplace.deploy(
                deployer.address
            );

            const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
            paymentToken = await MockERC20.deploy();
        });

        async function mintStandardNft(minter: HardhatEthersSigner,
            { amount, feeRecipient, fee } : { amount?: BigNumberish, feeRecipient?: string, fee?: number }
        ) {
            if (amount === undefined) {
                amount = 1;
            }
            if (feeRecipient === undefined) {
                feeRecipient = minter.address;
            }
            if (fee === undefined) {
                fee = 0;
            }
            await zangNFT.connect(minter).mint(
                encodeTextURI("Hello Bob"),
                "Zang Test",
                "Zang Description",
                amount,
                fee,
                feeRecipient,
                Buffer.from("")
            );
            const tokenId = await zangNFT.lastTokenId();
            return tokenId;
        }

        describe('listToken', function () {
            it('lists a token', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);
                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price);
                expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                expect(listing.amount).to.equal(1);
            });

            it('fails to list a token that does not exist', async function () {
                const tokenId = 1;
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                ).to.be.rejectedWith('Marketplace: not enough tokens to list');
            });

            it('fails to list a token not owned by the user', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await zangNFT.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(bob).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                ).to.be.rejectedWith('Marketplace: not enough tokens to list');
            });

            it('fails to list a token without approving', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 100;
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                ).to.be.rejectedWith('Marketplace: Marketplace contract is not approved');
            });

            it('fails to list more tokens that the user owns', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 2)
                ).to.be.rejectedWith('Marketplace: not enough tokens to list');
            });

            it('fails to list zero tokens', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 0)
                ).to.be.rejectedWith('Marketplace: amount must be greater than 0');
            });

            it('fails to list more then MAX_AMOUNT tokens', async function () {
                const amount = MAX_LISTING_AMOUNT + BigInt(1);
                const tokenId = await mintStandardNft(alice, { amount});
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, amount)
                ).to.be.rejectedWith('Marketplace: amount must be less than or equal to MAX_AMOUNT');
            });

            it('fails to list for free', async function () {
                const tokenId = await mintStandardNft(alice, {});
                const price = 0;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                ).to.be.rejectedWith('Marketplace: price must be greater than 0');
            });
        });

        describe('editListing', function () {
            it('edits a listing', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, 1);

                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price + 1);
                expect(listing.paymentToken).to.equal(await alternativeToken.getAddress());
                expect(listing.amount).to.equal(2);
            });

            it('edits a listing keeping the same amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, -1, 1);

                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price + 1);
                expect(listing.paymentToken).to.equal(await alternativeToken.getAddress());
                expect(listing.amount).to.equal(1);
            });

            it('edits a listing ignoring the expected amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, -1);

                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price + 1);
                expect(listing.paymentToken).to.equal(await alternativeToken.getAddress());
                expect(listing.amount).to.equal(2);
            });

            it('edits a listing ignoring both the amount and the expected amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, -1, -1);

                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price + 1);
                expect(listing.paymentToken).to.equal(await alternativeToken.getAddress());
                expect(listing.amount).to.equal(1);
            });

            it('fails to edit a listing that does not exist', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(bob).editListing(await zangNFT.getAddress(), tokenId, 1, await alternativeToken.getAddress(), price + 1, 2, 1)
                ).to.be.rejectedWith('Marketplace: can only edit own listings');
            });

            it('fails to edit a listing that the user does not own', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await zangNFT.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(bob).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, 1)
                ).to.be.rejectedWith('Marketplace: can only edit own listings');
            });

            it('fails to edit a listing after revoking approval', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), false);

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, 1)
                ).to.be.rejectedWith('Marketplace: Marketplace contract is not approved');
            });

            it('fails to edit a listing with an incorrect expected amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, 0)
                ).to.be.rejectedWith('Marketplace: expected amount does not match');
            });

            it('fails to edit a listing with a < -1 amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, -2, 1)
                ).to.be.rejectedWith('Marketplace: amount must be greater than 0 or equal to -1 for no change');
            });

            it('fails to edit a listing with a zero amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 0, 1)
                ).to.be.rejectedWith('Marketplace: amount must be greater than 0 or equal to -1 for no change');
            });

            it('fails to edit a listing with a zero price', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), 0, 2, 1)
                ).to.be.rejectedWith('Marketplace: price must be greater than 0');
            });

            it('fails to edit a listing with a < -1 expected amount', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 2 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                await expect(
                    marketplace.connect(alice).editListing(await zangNFT.getAddress(), tokenId, listingId, await alternativeToken.getAddress(), price + 1, 2, -2)
                ).to.be.rejectedWith('Marketplace: expected amount must be greater than or equal to 0, or -1 for no check');
            });
        });
        describe('delistToken', function () {
            it('delists a token', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 1 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                const listingId = await marketplace.listingCount(await zangNFT.getAddress(), tokenId);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                await marketplace.connect(alice).delistToken(await zangNFT.getAddress(), tokenId, listingId);
                
                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(ZERO_ADDRESS);
                expect(listing.price).to.equal(0);
                expect(listing.paymentToken).to.equal(ZERO_ADDRESS);
                expect(listing.amount).to.equal(0);
            });

            it('fails to delist a token that does not exist', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 1 });
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await expect(
                    marketplace.connect(alice).delistToken(await zangNFT.getAddress(), tokenId, 1)
                ).to.be.rejectedWith('Marketplace: can only delist own listings');
            });

            it('fails to delist a token not owned by the user', async function () {
                const tokenId = await mintStandardNft(alice, { amount : 1 });
                const price = 100;
                await zangNFT.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                await expect(
                    marketplace.connect(bob).delistToken(await zangNFT.getAddress(), tokenId, 1)
                ).to.be.rejectedWith('Marketplace: can only delist own listings');
            });
        });
    })
})