import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { VinuNFT, ZangNFT, ZangNFT__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish } from "ethers";

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

            const parsedContractURI = parseContractURI(contractURI);
            expect(parsedContractURI.name).to.equal("ZangNFT");
            expect(parsedContractURI.description).to.equal("zang description");
            expect(parsedContractURI.image).to.equal("zang image uri");
            expect(parsedContractURI.external_link).to.equal("zang external link");
        });

        it('deploys VinuNFT', async function () {
            const [deployer] = await hre.ethers.getSigners();

            const VinuNFT = await hre.ethers.getContractFactory("VinuNFT");
            const vinuNFT = await VinuNFT.deploy();
        });
    });
    for (const nftType of ["vinu", "zang"]) {
        describe(`execution (${nftType})`, function () {
            let nftContract: ZangNFT | VinuNFT;
            let deployer: HardhatEthersSigner;
            let alice: HardhatEthersSigner;
            let bob: HardhatEthersSigner;

            beforeEach(async function () {
                const [d, a, b] = await hre.ethers.getSigners();
                deployer = d;
                alice = a;
                bob = b;

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
                        "Hello Bob",
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

            describe("mint", function () {
                it('mints a token', async function () {
                    await mintStandardNft(alice, { amount: 1, feeRecipient: bob.address, fee: 1000 });

                    expect(await nftContract.totalSupply()).to.equal(1);
                    expect(await nftContract.lastTokenId()).to.equal(1);
                    //expect(await zangNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "vinu") {
                        const uri = await (nftContract as VinuNFT).uri(1);
                        expect(uri).to.equal("Hello Bob");
                    } else {
                        const textURI = await (nftContract as ZangNFT).textURI(1);
                        const parsedText = parseTextURI(textURI);
                        expect(parsedText).to.equal("Hello Bob");
                    }


                    const royaltyInfo = await nftContract.royaltyInfo(1, 10000);
                    expect(royaltyInfo[0]).to.equal(bob.address);
                    expect(royaltyInfo[1]).to.equal(1000);
                });
            })

            describe("burn", function () {
                it('burns a token', async function () {

                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await nftContract.connect(alice).burn(alice.address, 1, 1);

                    expect(await nftContract.totalSupply()).to.equal(9);
                    expect(await nftContract.lastTokenId()).to.equal(1);
                    //expect(await zangNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "vinu") {
                        const uri = await (nftContract as VinuNFT).uri(1);
                        expect(uri).to.equal("Hello Bob");
                    } else {
                        const textURI = await (nftContract as ZangNFT).textURI(1);
                        const parsedText = parseTextURI(textURI);
                        expect(parsedText).to.equal("Hello Bob");
                    }

                    const royaltyInfo = await nftContract.royaltyInfo(1, 10000);
                    expect(royaltyInfo[0]).to.equal(bob.address);
                    expect(royaltyInfo[1]).to.equal(1000);
                });

                it('burns for someone else with approval', async function () {
                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await nftContract.connect(alice).setApprovalForAll(bob.address, true);
                    await nftContract.connect(bob).burn(alice.address, 1, 1);
                });

                it('burns all tokens', async function () {
                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await nftContract.connect(alice).burn(alice.address, 1, 10);

                    expect(await nftContract.totalSupply()).to.equal(0);
                    expect(await nftContract.lastTokenId()).to.equal(1);
                    //expect(await zangNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "vinu") {
                        await expect(
                            (nftContract as VinuNFT).uri(1)
                        ).to.be.rejectedWith("VinuNFT: uri query for nonexistent token");
                    } else {
                        await expect(
                            (nftContract as ZangNFT).textURI(1)
                        ).to.be.rejectedWith("ZangNFT: textURI query for nonexistent token");
                    }

                    const royaltyInfo = await nftContract.royaltyInfo(1, 10000);
                    expect(royaltyInfo[0]).to.equal(ZERO_ADDRESS);
                    expect(royaltyInfo[1]).to.equal(0);
                });

                it('fails to burn more tokens than there exit', async function () {
                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await expect(
                        nftContract.connect(alice).burn(alice.address, 1, 11)
                    ).to.be.reverted;
                });

                it('fails to burn more tokens than the user has', async function () {
                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await nftContract.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, Buffer.from(""));

                    await expect(
                        nftContract.connect(alice).burn(alice.address, 1, 10)
                    ).to.be.reverted;
                });

                it('fails to burn for someone else without approval', async function () {
                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await expect(
                        nftContract.connect(bob).burn(alice.address, 1, 1)
                    ).to.be.rejected;
                });
            })
        })
    }
})