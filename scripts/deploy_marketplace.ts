import hre from "hardhat";

function requiredAddress(name: string): string {
    const value = process.env[name];
    if (!value || !hre.ethers.isAddress(value) || value === hre.ethers.ZeroAddress) {
        throw new Error(`${name} must be set to a non-zero address`);
    }

    return value;
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const commissionAccount = requiredAddress("COMMISSION_ACCOUNT");

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    const marketplace = await Marketplace.deploy(commissionAccount);

    console.log("Deploying from:", deployer.address);
    console.log("Commission account:", commissionAccount);
    console.log('Contract deployed to address:', await marketplace.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
