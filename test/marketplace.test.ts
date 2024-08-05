import {
    time
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { Marketplace, MockERC20, VinuNFT, ZangNFT } from "../typechain-types";
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
    for (const nftType of ["vinu", "zang"]) {
        describe(`execution (${nftType})`, function () {
            let nftContract: ZangNFT | VinuNFT;
            let marketplace: Marketplace;
            let deployer: HardhatEthersSigner;
            let alice: HardhatEthersSigner;
            let bob: HardhatEthersSigner;
            let charlie: HardhatEthersSigner;
            let paymentToken: MockERC20;

            beforeEach(async function () {
                const [d, a, b, c] = await hre.ethers.getSigners();
                deployer = d;
                alice = a;
                bob = b;
                charlie = c;

                if (nftType === "vinu") {
                    const VinuNFT = await hre.ethers.getContractFactory("VinuNFT");
                    nftContract = await VinuNFT.deploy();

                } else {
                    const ZangNFT = await hre.ethers.getContractFactory("ZangNFT");
                    nftContract = await ZangNFT.deploy(
                        "ZangNFT",
                        "ZNG",
                        "zang description",
                        "zang image uri",
                        "zang external link"
                    );
                }

                const Marketplace = await hre.ethers.getContractFactory("Marketplace");
                marketplace = await Marketplace.deploy(
                    deployer.address
                );

                const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
                paymentToken = await MockERC20.deploy();
            });

            async function mintStandardNft(minter: HardhatEthersSigner,
                { amount, feeRecipient, fee }: { amount?: BigNumberish, feeRecipient?: string, fee?: number }
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

                if (nftType === "vinu") {
                    await (nftContract as VinuNFT).connect(minter).mint(
                        encodeTextURI("Hello Bob"),
                        amount,
                        fee,
                        feeRecipient,
                        Buffer.from("")
                    );
                } else {
                    await (nftContract as ZangNFT).connect(minter).mint(
                        encodeTextURI("Hello Bob"),
                        "Zang Test",
                        "Zang Description",
                        amount,
                        fee,
                        feeRecipient,
                        Buffer.from("")
                    );
                }
                const tokenId = await nftContract.lastTokenId();
                return tokenId;
            }

            describe('listToken', function () {
                it('lists a token', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);
                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);
                });

                it('fails to list a token that does not exist', async function () {
                    const tokenId = 1;
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                    ).to.be.rejectedWith('Marketplace: not enough tokens to list');
                });

                it('fails to list a token not owned by the user', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await nftContract.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(bob).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                    ).to.be.rejectedWith('Marketplace: not enough tokens to list');
                });

                it('fails to list a token without approving', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 100;
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                    ).to.be.rejectedWith('Marketplace: Marketplace contract is not approved');
                });

                it('fails to list more tokens that the user owns', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2)
                    ).to.be.rejectedWith('Marketplace: not enough tokens to list');
                });

                it('fails to list zero tokens', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 0)
                    ).to.be.rejectedWith('Marketplace: amount must be greater than 0');
                });

                it('fails to list more then MAX_AMOUNT tokens', async function () {
                    const amount = MAX_LISTING_AMOUNT + BigInt(1);
                    const tokenId = await mintStandardNft(alice, { amount });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, amount)
                    ).to.be.rejectedWith('Marketplace: amount must be less than or equal to MAX_AMOUNT');
                });

                it('fails to list for free', async function () {
                    const tokenId = await mintStandardNft(alice, {});
                    const price = 0;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                    ).to.be.rejectedWith('Marketplace: price must be greater than 0');
                });
            });

            describe('editListing', function () {
                it('edits a listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price + 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(2);
                });

                it('edits a listing keeping the same amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);


                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, -1, 1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price + 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);
                });

                it('edits a listing when some tokens have been transferred away', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 5 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 4);

                    await nftContract.connect(alice).safeTransferFrom(alice.address, bob.address, tokenId, 1, Buffer.from(""));

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 3, 4);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price + 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(3);
                });

                it('edits a listing ignoring the expected amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    const alternativeToken = await (await hre.ethers.getContractFactory("MockERC20")).deploy();

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, -1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price + 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(2);
                });

                it('edits a listing ignoring both the amount and the expected amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, -1, -1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price + 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);
                });

                it('fails to edit a listing that does not exist', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

                    await expect(
                        marketplace.connect(bob).editListing(await nftContract.getAddress(), tokenId, 1, price + 1, 2, 1)
                    ).to.be.rejectedWith('Marketplace: can only edit own listings');
                });

                it('fails to edit a listing that the user does not own', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await nftContract.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(bob).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 1)
                    ).to.be.rejectedWith('Marketplace: can only edit own listings');
                });

                it('fails to edit a listing with more tokens that the user owns', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await nftContract.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(bob).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 3)
                    ).to.be.rejectedWith('Marketplace: can only edit own listings');
                });

                it('fails to edit a listing after revoking approval', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), false);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 1)
                    ).to.be.rejectedWith('Marketplace: Marketplace contract is not approved');
                });

                it('fails to edit a listing with an incorrect expected amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 0)
                    ).to.be.rejectedWith('Marketplace: expected amount does not match');
                });

                it('fails to edit a listing with a < -1 amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, -2, 1)
                    ).to.be.rejectedWith('Marketplace: amount must be greater than 0 or equal to -1 for no change');
                });

                it('fails to edit a listing with a zero amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 0, 1)
                    ).to.be.rejectedWith('Marketplace: amount must be greater than 0 or equal to -1 for no change');
                });

                it('fails to edit a listing with a zero price', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, 0, 2, 1)
                    ).to.be.rejectedWith('Marketplace: price must be greater than 0');
                });

                it('fails to edit a listing with a < -1 expected amount', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, -2)
                    ).to.be.rejectedWith('Marketplace: expected amount must be greater than or equal to 0, or -1 for no check');
                });

                it('fails to edit a listing where too many tokens have been transferred away', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 5 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 4);

                    await nftContract.connect(alice).safeTransferFrom(alice.address, bob.address, tokenId, 3, Buffer.from(""));

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 3, 4)
                    ).to.be.rejectedWith('Marketplace: not enough tokens to list');
                });
            });
            describe('delistToken', function () {
                it('delists a token', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).delistToken(await nftContract.getAddress(), tokenId, listingId);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(ZERO_ADDRESS);
                    expect(listing.price).to.equal(0);
                    expect(listing.paymentToken).to.equal(ZERO_ADDRESS);
                    expect(listing.amount).to.equal(0);
                });

                it('fails to delist a token that does not exist', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await expect(
                        marketplace.connect(alice).delistToken(await nftContract.getAddress(), tokenId, 1)
                    ).to.be.rejectedWith('Marketplace: can only delist own listings');
                });

                it('fails to delist a token not owned by the user', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await expect(
                        marketplace.connect(bob).delistToken(await nftContract.getAddress(), tokenId, 1)
                    ).to.be.rejectedWith('Marketplace: can only delist own listings');
                });

                it('fails to delist an already delisted listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).delistToken(await nftContract.getAddress(), tokenId, listingId);

                    await expect(
                        marketplace.connect(bob).delistToken(await nftContract.getAddress(), tokenId, listingId)
                    ).to.be.rejectedWith('Marketplace: can only delist own listings');
                });
            });

            describe('buyToken', function () {
                it('buys a token', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(price * 0.95);
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                });

                it('buys a token with creator fee', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2, fee: 1000, feeRecipient: charlie.address }); // 10% fee
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(Math.ceil(price * 0.95 * 0.9));
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                    expect(await paymentToken.balanceOf(charlie.address)).to.equal(Math.floor(price * 0.95 * 0.1)); // 10% fee
                });

                it('buys multiple tokens', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 3 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 3);

                    await paymentToken.connect(bob).mint(price * 2);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price * 2);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 2, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(2);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(price * 2 * 0.95);
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 2 * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                });

                it('buys a token, leading to a delist', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(ZERO_ADDRESS);
                    expect(listing.price).to.equal(0);
                    expect(listing.paymentToken).to.equal(ZERO_ADDRESS);
                    expect(listing.amount).to.equal(0);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(price * 0.95);
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                });

                it('buys a token with a lower price than expected', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price + 1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(price * 0.95);
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                });

                it('buys a token from a listing that had the price decreased', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price - 1, 2, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price - 1);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(Math.ceil((price - 1) * 0.95));
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(Math.floor((price - 1) * 0.05)); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(1);
                });

                it('buys a token even if some were transferred away', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 5 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 5);

                    // Transfer 3 tokens away
                    await nftContract.connect(alice).safeTransferFrom(alice.address, charlie.address, tokenId, 3, Buffer.from(""));

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(4);

                    expect(await nftContract.balanceOf(bob.address, tokenId)).to.equal(1);
                    expect(await paymentToken.balanceOf(alice.address)).to.equal(price * 0.95);
                    expect(await paymentToken.balanceOf(deployer.address)).to.equal(price * 0.05); // 5% commission
                    expect(await paymentToken.balanceOf(bob.address)).to.equal(0);
                });

                it('fails to buy from a non-existing listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(alice).buyToken(await nftContract.getAddress(), tokenId, 1, 1, price)
                    ).to.be.rejectedWith('Marketplace: cannot interact with a non-existent listing');
                });

                it('fails to buy zero tokens', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(alice).buyToken(await nftContract.getAddress(), tokenId, listingId, 0, price)
                    ).to.be.rejectedWith('Marketplace: _amount must be greater than 0');
                });

                it('fails to buy from a fully used listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(alice).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: cannot interact with a non-existent listing');
                });

                it('fails to buy from a delisted listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).delistToken(await nftContract.getAddress(), tokenId, listingId);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(alice).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: cannot interact with a non-existent listing');
                });

                it('fails to buy from a listing that had the price increased', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 2, 1);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: price too high');
                });

                it('fails to buy a token without having enough tokens', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price - 1);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price - 1);

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: not enough allowance');
                });

                it('fails to buy a token without approving enough tokens', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price - 1);

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: not enough allowance');
                });

                it('fails to buy a token with a higher than expected price', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price - 1)
                    ).to.be.rejectedWith('Marketplace: price too high');
                });

                it('fails to buy from an owned listing', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 2 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 2);

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(alice).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.rejectedWith('Marketplace: cannot buy from yourself');
                });

                it('fails to buy when too many tokens were transferred away', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 5 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 5);

                    await paymentToken.connect(bob).mint(price * 2);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price * 2);

                    await nftContract.connect(alice).safeTransferFrom(alice.address, charlie.address, tokenId, 4, Buffer.from(""));

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 2, price)
                    ).to.be.rejectedWith('Marketplace: seller does not have enough tokens');
                });

                it('fails to buy when all tokens were transferred away', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 5 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 5);

                    await paymentToken.connect(bob).mint(price * 2);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price * 2);

                    await nftContract.connect(alice).safeTransferFrom(alice.address, charlie.address, tokenId, 5, Buffer.from(""));

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 2, price)
                    ).to.be.rejectedWith('Marketplace: seller does not have enough tokens');
                });
            });

            describe('pause', function () {
                it('pauses and unpauses the contract', async function () {
                    await marketplace.pause();
                    expect(await marketplace.paused()).to.be.true;

                    await marketplace.unpause();
                    expect(await marketplace.paused()).to.be.false;
                });

                it('fails to pause the contract if not the owner', async function () {
                    await expect(
                        marketplace.connect(bob).pause()
                    ).to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
                });

                it('fails to unpause the contract if not the owner', async function () {
                    await marketplace.pause();

                    await expect(
                        marketplace.connect(bob).unpause()
                    ).to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
                });

                it('fails to list when the contract is paused', async function () {
                    await marketplace.pause();

                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

                    await expect(
                        marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1)
                    ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
                });

                it('fails to edit when the contract is paused', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.pause();

                    await expect(
                        marketplace.connect(alice).editListing(await nftContract.getAddress(), tokenId, listingId, price + 1, 1, 1)
                    ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
                });

                it('successfully delists when the contract is paused', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.pause();

                    await marketplace.connect(alice).delistToken(await nftContract.getAddress(), tokenId, listingId);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(ZERO_ADDRESS);
                    expect(listing.price).to.equal(0);
                    expect(listing.paymentToken).to.equal(ZERO_ADDRESS);
                    expect(listing.amount).to.equal(0);
                });

                it('fails to buy when the contract is paused', async function () {
                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    await marketplace.pause();

                    await paymentToken.connect(bob).mint(price);
                    await paymentToken.connect(bob).approve(await marketplace.getAddress(), price);

                    await expect(
                        marketplace.connect(bob).buyToken(await nftContract.getAddress(), tokenId, listingId, 1, price)
                    ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
                });

                it('successfully lists when the contract is unpaused', async function () {
                    await marketplace.pause();
                    await marketplace.unpause();

                    const tokenId = await mintStandardNft(alice, { amount: 1 });
                    const price = 100;
                    await nftContract.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

                    const listingId = await marketplace.listingCount(await nftContract.getAddress(), tokenId);
                    await marketplace.connect(alice).listToken(await nftContract.getAddress(), tokenId, await paymentToken.getAddress(), price, 1);

                    const listing = await marketplace.getListing(await nftContract.getAddress(), tokenId, listingId);
                    expect(listing.seller).to.equal(alice.address);
                    expect(listing.price).to.equal(price);
                    expect(listing.paymentToken).to.equal(await paymentToken.getAddress());
                    expect(listing.amount).to.equal(1);
                });
            });

            describe('commissions', function () {
                it('sets the commission account', async function () {
                    await marketplace.setCommissionAccount(alice.address);

                    expect(await marketplace.commissionAccount()).to.equal(alice.address);
                });

                it('decreases the platform commission', async function () {
                    await marketplace.decreasePlatformFeePercentage(100); // 1%

                    expect(await marketplace.platformFeePercentage()).to.equal(100);
                });

                it('increases the platform commission after waiting', async function () {
                    await marketplace.requestPlatformFeePercentageIncrease(2000); // 20%
                    expect(await marketplace.newPlatformFeePercentage()).to.equal(2000);

                    await time.setNextBlockTimestamp((await time.latest()) + 3600 * 24 * 7); // 1 week

                    await marketplace.applyPlatformFeePercentageIncrease();
                    expect(await marketplace.platformFeePercentage()).to.equal(2000);
                    expect(await marketplace.newPlatformFeePercentage()).to.equal(0);
                    expect(await marketplace.lock()).to.equal(0);
                });

                it('fails to increase the platform commission without first requesting it', async function () {
                    await expect(
                        marketplace.applyPlatformFeePercentageIncrease()
                    ).to.be.revertedWith('NFTCommissions: platform fee percentage increase must be first requested');
                });

                it('fails to increase the platform commission too soon after requesting it', async function () {
                    await marketplace.requestPlatformFeePercentageIncrease(2000); // 20%

                    await time.setNextBlockTimestamp((await time.latest()) + 3600 * 24 * 1); // 1 day

                    await expect(
                        marketplace.applyPlatformFeePercentageIncrease()
                    ).to.be.revertedWith('NFTCommissions: platform fee percentage increase is locked');
                });
            })
        })
    }
})