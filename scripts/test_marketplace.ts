import hre from "hardhat";


async function main() {
    const [deployer] = await hre.ethers.getSigners();
    // Get the contract factory
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    // Deploy the contract
    const marketplace = Marketplace.attach("0x28336f2397B6f8038b27EE32C5Abd618c94440B1");

    console.log(await marketplace.getListing("0x28336f2397B6f8038b27EE32C5Abd618c94440B1", 1, 1))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
