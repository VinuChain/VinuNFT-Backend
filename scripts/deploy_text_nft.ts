import hre from "hardhat";

function requiredValue(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`${name} must be set`);
    }

    return value;
}

async function main() {
    const TextNFT = await hre.ethers.getContractFactory("TextNFT");

    const textNFT = await TextNFT.deploy(
        requiredValue("TEXT_NFT_NAME"),
        requiredValue("TEXT_NFT_SYMBOL"),
        requiredValue("TEXT_NFT_DESCRIPTION"),
        requiredValue("TEXT_NFT_IMAGE_URI"),
        requiredValue("TEXT_NFT_EXTERNAL_LINK")
    );

    console.log('Contract deployed to address:', await textNFT.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
