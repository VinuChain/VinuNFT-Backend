import { parseEther } from "ethers";
import hre from "hardhat";


async function main() {
    const [deployer] = await hre.ethers.getSigners();
    // Get the contract factory
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

    // Deploy the contract
    const mockERC20 = MockERC20.attach("0x6a219e51722df3d9882ef85dbf57720939974b5a");

    // Mint tokens
    const tx = await mockERC20.mint(parseEther("1000"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
