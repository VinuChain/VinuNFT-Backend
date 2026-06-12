import { parseEther } from "ethers";
import hre from "hardhat";

function requiredAddress(name: string): string {
    const value = process.env[name];
    if (!value || !hre.ethers.isAddress(value) || value === hre.ethers.ZeroAddress) {
        throw new Error(`${name} must be set to a non-zero address`);
    }

    return value;
}

async function main() {
    const tokenAddress = requiredAddress("MOCK_ERC20_ADDRESS");
    const mintAmount = process.env.MINT_AMOUNT || "1000";
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

    const mockERC20 = MockERC20.attach(tokenAddress);

    const tx = await mockERC20.mint(parseEther(mintAmount));
    await tx.wait();
    console.log(`Minted ${mintAmount} tokens from ${tokenAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
