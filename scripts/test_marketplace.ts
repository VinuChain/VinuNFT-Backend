import hre from "hardhat";

function requiredAddress(name: string): string {
    const value = process.env[name];
    if (!value || !hre.ethers.isAddress(value) || value === hre.ethers.ZeroAddress) {
        throw new Error(`${name} must be set to a non-zero address`);
    }

    return value;
}

function requiredBigInt(name: string): bigint {
    const value = process.env[name];
    if (!value || !/^\d+$/.test(value)) {
        throw new Error(`${name} must be set to a non-negative integer`);
    }

    return BigInt(value);
}

async function main() {
    const marketplaceAddress = requiredAddress("MARKETPLACE_ADDRESS");
    const nftAddress = requiredAddress("NFT_ADDRESS");
    const tokenId = requiredBigInt("TOKEN_ID");
    const listingId = requiredBigInt("LISTING_ID");

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    const marketplace = Marketplace.attach(marketplaceAddress);

    console.log(await marketplace.getListing(nftAddress, tokenId, listingId));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
