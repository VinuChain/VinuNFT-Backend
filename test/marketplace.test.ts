import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { Marketplace, ZangNFT, ZangNFT__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
        });

        async function mintStandardNft(minter: HardhatEthersSigner,
            { amount, feeRecipient, fee } : { amount?: number, feeRecipient?: string, fee?: number }
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
                await marketplace.connect(alice).listToken(await zangNFT.getAddress(), tokenId, price, 1);
                const listing = await marketplace.getListing(await zangNFT.getAddress(), tokenId, listingId);
                expect(listing.seller).to.equal(alice.address);
                expect(listing.price).to.equal(price);
            });
        });
    })
})