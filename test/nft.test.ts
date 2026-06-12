import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { ImageNFT, TextNFT, TextNFT__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const toBase64 = (data: string) => Buffer.from(data).toString("base64");
const base64ToBytes = (data: string) => Buffer.from(data, "base64");

function parseContractURI(contractURI: string) {
    expect(contractURI).to.match(/^data:application\/json;base64,/);
    const data = contractURI.split(",")[1];

    return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
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


describe("NFT", function () {
    describe("deployment", function () {
        it("deploys TextNFT", async function () {
            const [deployer] = await hre.ethers.getSigners();

            const TextNFT = await hre.ethers.getContractFactory("TextNFT");
            const textNFT = await TextNFT.deploy(
                "TextNFT",
                "ZNG",
                "text description",
                "text image uri",
                "text external link"
            );
            expect(await textNFT.name()).to.equal("TextNFT");
            expect(await textNFT.symbol()).to.equal("ZNG");
            expect(await textNFT.description()).to.equal("text description");
            expect(await textNFT.imageURI()).to.equal("text image uri");
            expect(await textNFT.externalLink()).to.equal("text external link");

            const contractURI = await textNFT.contractURI();

            const parsedContractURI = parseContractURI(contractURI);
            expect(parsedContractURI.name).to.equal("TextNFT");
            expect(parsedContractURI.description).to.equal("text description");
            expect(parsedContractURI.image).to.equal("text image uri");
            expect(parsedContractURI.external_link).to.equal("text external link");
        });

        it("escapes contract metadata JSON for user-controlled strings", async function () {
            const TextNFT = await hre.ethers.getContractFactory("TextNFT");
            const textNFT = await TextNFT.deploy(
                'Text "NFT" \\ snowman',
                "ZNG",
                "line one\nline two\tunicode: cafe",
                "ipfs://image\\path",
                "https://example.com/\"collection\""
            );

            const parsedContractURI = parseContractURI(await textNFT.contractURI());
            expect(parsedContractURI.name).to.equal('Text "NFT" \\ snowman');
            expect(parsedContractURI.description).to.equal("line one\nline two\tunicode: cafe");
            expect(parsedContractURI.image).to.equal("ipfs://image\\path");
            expect(parsedContractURI.external_link).to.equal('https://example.com/"collection"');
        });

        it('deploys ImageNFT', async function () {
            const [deployer] = await hre.ethers.getSigners();

            const ImageNFT = await hre.ethers.getContractFactory("ImageNFT");
            const imageNFT = await ImageNFT.deploy();
        });
    });
    for (const nftType of ["image", "text"]) {
        describe(`execution (${nftType})`, function () {
            let nftContract: TextNFT | ImageNFT;
            let deployer: HardhatEthersSigner;
            let alice: HardhatEthersSigner;
            let bob: HardhatEthersSigner;

            beforeEach(async function () {
                const [d, a, b] = await hre.ethers.getSigners();
                deployer = d;
                alice = a;
                bob = b;

                if (nftType === "image") {
                    const ImageNFT = await hre.ethers.getContractFactory("ImageNFT");
                    nftContract = await ImageNFT.deploy();
                } else {
                    const TextNFT = await hre.ethers.getContractFactory("TextNFT");
                    nftContract = await TextNFT.deploy(
                        "TextNFT",
                        "ZNG",
                        "text description",
                        "text image uri",
                        "text external link"
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

                if (nftType === "image") {
                    await (nftContract as ImageNFT).connect(minter).mint(
                        "Hello Bob",
                        amount,
                        fee,
                        feeRecipient,
                        Buffer.from("")
                    );
                } else {
                    await (nftContract as TextNFT).connect(minter).mint(
                        encodeTextURI("Hello Bob"),
                        "Text Test",
                        "Text Description",
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
                    //expect(await textNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "image") {
                        const uri = await (nftContract as ImageNFT).uri(1);
                        expect(uri).to.equal("Hello Bob");
                    } else {
                        const textURI = await (nftContract as TextNFT).textURI(1);
                        const parsedText = parseTextURI(textURI);
                        expect(parsedText).to.equal("Hello Bob");
                    }

                    const author = await nftContract.authorOf(1);
                    expect(author).to.equal(alice.address);

                    const royaltyInfo = await nftContract.royaltyInfo(1, 10000);
                    expect(royaltyInfo[0]).to.equal(bob.address);
                    expect(royaltyInfo[1]).to.equal(1000);
                });

                if (nftType === "text") {
                    it("escapes token metadata JSON for UTF-8 and control characters", async function () {
                        const textNFT = nftContract as TextNFT;
                        const text = "Hello \"Bob\" \\ cafe\nsecond line";

                        await textNFT.connect(alice).mint(
                            encodeTextURI(text),
                            'Story "One" \\ cafe',
                            "Description with newline\nand tab\tcharacters",
                            1,
                            0,
                            alice.address,
                            Buffer.from("")
                        );

                        const parsedURI = parseContractURI(await textNFT.uri(1));
                        expect(parsedURI.name).to.equal('Story "One" \\ cafe');
                        expect(parsedURI.description).to.equal("Description with newline\nand tab\tcharacters");
                        expect(parsedURI.text_uri).to.equal(encodeTextURI(text));
                    });
                }
            })

            describe("burn", function () {
                it('burns a token', async function () {

                    await mintStandardNft(alice, { amount: 10, feeRecipient: bob.address, fee: 1000 });

                    await nftContract.connect(alice).burn(alice.address, 1, 1);

                    expect(await nftContract.totalSupply()).to.equal(9);
                    expect(await nftContract.lastTokenId()).to.equal(1);
                    //expect(await textNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "image") {
                        const uri = await (nftContract as ImageNFT).uri(1);
                        expect(uri).to.equal("Hello Bob");
                    } else {
                        const textURI = await (nftContract as TextNFT).textURI(1);
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
                    //expect(await textNFT.balanceOf(alice.address)).to.equal(1);

                    if (nftType === "image") {
                        await expect(
                            (nftContract as ImageNFT).uri(1)
                        ).to.be.rejectedWith("ImageNFT: uri query for nonexistent token");
                    } else {
                        await expect(
                            (nftContract as TextNFT).textURI(1)
                        ).to.be.rejectedWith("TextNFT: textURI query for nonexistent token");
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
