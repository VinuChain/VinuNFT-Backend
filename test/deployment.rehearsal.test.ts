import { expect } from "chai";
import hre from "hardhat";

import record from "../deployments/vinuchain-207.json";
import { main as deployTextNFT } from "../scripts/deploy_text_nft";
import { main as deployImageNFT } from "../scripts/deploy_image_nft";
import { main as deployMarketplace } from "../scripts/deploy_marketplace";
import { main as estimateDeployment } from "../scripts/estimate_deployment";

/**
 * HARDHAT-NETWORK REHEARSAL — NOT a testnet rehearsal.
 *
 * This drives the real deploy scripts, with the constructor arguments the live
 * contracts were actually created with (deployments/vinuchain-207.json, read
 * back from chain 207 and the explorer), against the in-process Hardhat
 * network. It proves the scripts run, take their inputs from the environment
 * the operator sets, and produce contracts whose observable state matches what
 * is deployed. It proves nothing about a real network's gas, nonce or reorg
 * behaviour. The live half of that is `yarn estimate:deployment`, which asks
 * VinuChain testnet (chain 206, hardhat.config.ts TESTNET) to estimate the
 * same deploys; only signing and broadcasting stay blocked on a funded key.
 *
 * The Marketplace leg cannot replay production verbatim, and that is the
 * finding rather than an inconvenience: production was deployed with
 * COMMISSION_ACCOUNT == deployer, which is exactly the configuration
 * scripts/deploy_marketplace.ts now refuses.
 */
describe("Deployment rehearsal (Hardhat network)", function () {
    const savedEnv = { ...process.env };

    afterEach(function () {
        process.env = { ...savedEnv };
    });

    it("deploys TextNFT with the recorded production constructor arguments", async function () {
        const [name, symbol, description, imageURI, externalLink] =
            record.contracts.text.constructorArgs;

        process.env.TEXT_NFT_NAME = name;
        process.env.TEXT_NFT_SYMBOL = symbol;
        process.env.TEXT_NFT_DESCRIPTION = description;
        process.env.TEXT_NFT_IMAGE_URI = imageURI;
        process.env.TEXT_NFT_EXTERNAL_LINK = externalLink;

        const address = await deployTextNFT();
        const textNFT = await hre.ethers.getContractAt("TextNFT", address);

        // This is a round trip — env in, storage out — so it proves the script
        // wires the arguments through in the right order, not that the record
        // is faithful. Record fidelity is a live comparison and belongs to
        // scripts/verify-deployment-record.mjs, which decodes the explorer's
        // ConstructorArguments and reads name()/symbol() off chain 207.
        expect(await textNFT.name()).to.equal(name);
        expect(await textNFT.symbol()).to.equal(symbol);
        expect(await textNFT.description()).to.equal(description);
        expect(await textNFT.imageURI()).to.equal(imageURI);
        expect(await textNFT.externalLink()).to.equal(externalLink);
    });

    it("refuses to deploy TextNFT when a constructor argument is unset", async function () {
        delete process.env.TEXT_NFT_SYMBOL;
        process.env.TEXT_NFT_NAME = "TextNFT";
        process.env.TEXT_NFT_DESCRIPTION = "d";
        process.env.TEXT_NFT_IMAGE_URI = "ipfs://x";
        process.env.TEXT_NFT_EXTERNAL_LINK = "https://vinunft.org";

        await expect(deployTextNFT()).to.be.rejectedWith(
            /TEXT_NFT_SYMBOL must be set/
        );
    });

    it("deploys ImageNFT with no constructor arguments", async function () {
        const address = await deployImageNFT();
        const imageNFT = await hre.ethers.getContractAt("ImageNFT", address);

        expect(record.contracts.image.constructorTypes).to.deep.equal([]);
        expect(await imageNFT.lastTokenId()).to.equal(0n);
        // ERC-1155 + ERC-2981, the two interfaces the frontend relies on.
        expect(await imageNFT.supportsInterface("0xd9b67a26")).to.equal(true);
        expect(await imageNFT.supportsInterface("0x2a55205a")).to.equal(true);
    });

    it("deploys the Marketplace with the recorded fee and pause state", async function () {
        const [deployer, commission] = await hre.ethers.getSigners();
        process.env.COMMISSION_ACCOUNT = commission.address;

        const address = await deployMarketplace();
        const marketplace = await hre.ethers.getContractAt("Marketplace", address);

        expect(await marketplace.owner()).to.equal(deployer.address);
        expect(await marketplace.commissionAccount()).to.equal(commission.address);
        // 500 bps and unpaused are the live values pinned by the frontend gate
        // (VinuNFT-Frontend/scripts/deployed-invariants.json).
        expect(await marketplace.platformFeePercentage()).to.equal(500n);
        expect(await marketplace.paused()).to.equal(false);
    });

    it("refuses to deploy the Marketplace with the deployer as the commission account", async function () {
        const [deployer] = await hre.ethers.getSigners();
        process.env.COMMISSION_ACCOUNT = deployer.address;

        // This is the configuration that reached mainnet: the live Marketplace
        // has creator == owner() == commissionAccount ==
        // record.deployer. AGENTS.md forbids it and nothing enforced that.
        expect(record.contracts.marketplace.constructorArgs[0]).to.equal(
            record.deployer
        );
        await expect(deployMarketplace()).to.be.rejectedWith(
            /commission account must not be the deployer/
        );
    });

    it("refuses to deploy the Marketplace with a zero commission account", async function () {
        process.env.COMMISSION_ACCOUNT = hre.ethers.ZeroAddress;

        await expect(deployMarketplace()).to.be.rejectedWith(
            /COMMISSION_ACCOUNT must be set to a non-zero address/
        );
    });

    it("estimates a deployment when COMMISSION_ACCOUNT is the .env.example placeholder", async function () {
        // A deploy must refuse the zero address (the case above). An ESTIMATE
        // must not: the operator who sourced an unchanged .env.example is
        // asking what a deployment would cost, and the Marketplace constructor
        // reverts on zero inside estimateGas, so the placeholder has to be
        // read as "not decided yet" and replaced with the estimation default.
        process.env.COMMISSION_ACCOUNT = hre.ethers.ZeroAddress;

        const { gas } = await estimateDeployment();
        expect(gas).to.be.greaterThan(0n);
    });
});
