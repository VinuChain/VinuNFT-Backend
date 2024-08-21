import hre from "hardhat";

async function main() {
    // Get the contract factory
    const TextNFT = await hre.ethers.getContractFactory("TextNFT");

    // Deploy the contract
    const textNFT = await TextNFT.deploy(
        "TextNFT",
        "ZNG",
        "text description",
        "text image uri",
        "text external link"
    );

    console.log('Contract deployed to address:', await textNFT.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
