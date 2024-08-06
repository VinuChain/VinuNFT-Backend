import hre from "hardhat";

async function main() {
    // Get the contract factory
    const ZangNFT = await hre.ethers.getContractFactory("ZangNFT");

    // Deploy the contract
    const zangNFT = await ZangNFT.deploy(
        "ZangNFT",
        "ZNG",
        "zang description",
        "zang image uri",
        "zang external link"
    );

    console.log('Contract deployed to address:', await zangNFT.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
