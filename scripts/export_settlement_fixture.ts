/**
 * Execute real purchases across a matrix of prices and royalties, record the
 * actual balance deltas, and write them as a fixture the frontend asserts its
 * fee-breakdown arithmetic against.
 *
 * The frontend shows buyers a fee breakdown before they sign. If its arithmetic
 * drifts from _handleFunds, users are told a split that will not happen. This
 * fixture is generated from settlement that really occurred, not from a
 * restatement of the formula.
 */
import hre from "hardhat";
import { writeFileSync } from "fs";

async function main() {
    const [deployer, seller, buyer, creator] = await hre.ethers.getSigners();
    const cases: any[] = [];

    for (const priceRaw of [1n, 3n, 7n, 19n, 100n, 333n, 1001n, 999999n]) {
        for (const feeBps of [0, 250, 500, 1000]) {
            for (const royaltyBps of [0, 250, 1000, 10000]) {
                const NFT = await hre.ethers.getContractFactory("TextNFT");
                const nft = await NFT.deploy("T", "T", "d", "i", "e");
                const Marketplace = await hre.ethers.getContractFactory("Marketplace");
                const marketplace = await Marketplace.deploy(deployer.address);
                const ERC20 = await hre.ethers.getContractFactory("MockERC20");
                const token = await ERC20.deploy();

                if (feeBps < 500) {
                    await marketplace.decreasePlatformFeePercentage(feeBps);
                } else if (feeBps > 500) {
                    await marketplace.requestPlatformFeePercentageIncrease(feeBps);
                    await hre.network.provider.send("evm_increaseTime", [7 * 24 * 3600]);
                    await hre.network.provider.send("evm_mine");
                    await marketplace.applyPlatformFeePercentageIncrease();
                }

                await nft.connect(seller).mint(
                    "data:text/plain;base64,aGk=", "n", "d", 1n, royaltyBps, creator.address, "0x"
                );
                const tokenId = await nft.lastTokenId();
                await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
                await marketplace.connect(seller).listToken(
                    await nft.getAddress(), tokenId, await token.getAddress(), priceRaw, 1n
                );

                await token.connect(buyer).mint(priceRaw);
                await token.connect(buyer).approve(await marketplace.getAddress(), priceRaw);

                const before = {
                    seller: await token.balanceOf(seller.address),
                    creator: await token.balanceOf(creator.address),
                    platform: await token.balanceOf(deployer.address),
                };
                await marketplace.connect(buyer).buyToken(
                    await nft.getAddress(), tokenId, 0n, 1n, priceRaw
                );
                const after = {
                    seller: await token.balanceOf(seller.address),
                    creator: await token.balanceOf(creator.address),
                    platform: await token.balanceOf(deployer.address),
                };

                // royaltyInfo is quoted on the post-fee remainder, as _handleFunds does.
                const platformFee = after.platform - before.platform;
                const remainder = priceRaw - platformFee;
                const [, quotedRoyalty] = await nft.royaltyInfo(tokenId, remainder);

                cases.push({
                    total: priceRaw.toString(),
                    platformFeeBps: feeBps,
                    royaltyBps,
                    royaltyReceiver: creator.address,
                    quotedRoyaltyOnRemainder: quotedRoyalty.toString(),
                    actual: {
                        platformFee: platformFee.toString(),
                        creatorFee: (after.creator - before.creator).toString(),
                        sellerProceeds: (after.seller - before.seller).toString(),
                    },
                });
            }
        }
    }

    const out = { generatedFrom: "VinuNFT-Backend Marketplace._handleFunds", cases };
    writeFileSync("settlement-fixture.json", JSON.stringify(out, null, 2));
    console.log(`wrote ${cases.length} settlement cases`);
}

main().catch((e) => { console.error(e); process.exit(1); });
