import hre from "hardhat";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    // Get the contract factory
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    // Deploy the contract
    const marketplace = await Marketplace.deploy(deployer.address);

    console.log('Contract deployed to address:', await marketplace.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
