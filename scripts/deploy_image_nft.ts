import hre from "hardhat";

// ImageNFT takes no constructor arguments: name, symbol and per-token URI all
// live in the token metadata, not in storage set at construction.
export async function main() {
    const ImageNFT = await hre.ethers.getContractFactory("ImageNFT");

    const imageNFT = await ImageNFT.deploy();
    await imageNFT.waitForDeployment();

    const address = await imageNFT.getAddress();
    console.log('Contract deployed to address:', address);
    return address;
}

if (require.main === module) {
    main()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
}
