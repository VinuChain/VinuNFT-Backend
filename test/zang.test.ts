import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { ZangNFT, ZangNFT__factory } from "../typechain-types";
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


describe("ZangNFT", function () {
    describe("deployment", function () {
        it("Should deploy ZangNFT", async function () {
            const [deployer] = await hre.ethers.getSigners();

            const ZangNFT = await hre.ethers.getContractFactory("ZangNFT");
            const zangNFT = await ZangNFT.deploy(
                "ZangNFT",
                "ZNG",
                "zang description",
                "zang image uri",
                "zang external link"
            );
            expect(await zangNFT.name()).to.equal("ZangNFT");
            expect(await zangNFT.symbol()).to.equal("ZNG");
            expect(await zangNFT.description()).to.equal("zang description");
            expect(await zangNFT.imageURI()).to.equal("zang image uri");
            expect(await zangNFT.externalLink()).to.equal("zang external link");

            const contractURI = await zangNFT.contractURI();

            console.log(contractURI);
            const parsedContractURI = parseContractURI(contractURI);
            expect(parsedContractURI.name).to.equal("ZangNFT");
            expect(parsedContractURI.description).to.equal("zang description");
            expect(parsedContractURI.image).to.equal("zang image uri");
            expect(parsedContractURI.external_link).to.equal("zang external link");
        });
        }
    )
    describe("execution", function () {
        let zangNFT: ZangNFT;
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
        });

        describe("mint", function () {
            it('mints a token', async function () {
                await zangNFT.connect(alice).mint(
                    encodeTextURI("Hello Bob"),
                    "Zang Test",
                    "Zang Description",
                    1,
                    1000,
                    bob.address,
                    Buffer.from("")
                );

                expect(await zangNFT.totalSupply()).to.equal(1);
                expect(await zangNFT.lastTokenId()).to.equal(1);
                //expect(await zangNFT.balanceOf(alice.address)).to.equal(1);
                const textURI = await zangNFT.textURI(1);

                console.log(textURI);
                const parsedText = parseTextURI(textURI);
                expect(parsedText).to.equal("Hello Bob");

                const royaltyInfo = await zangNFT.royaltyInfo(1, 10000);
                expect(royaltyInfo[0]).to.equal(bob.address);
                expect(royaltyInfo[1]).to.equal(1000);
            });
        })
    })
})