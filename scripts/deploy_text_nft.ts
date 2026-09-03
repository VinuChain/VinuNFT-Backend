import hre from "hardhat";

function requiredValue(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`${name} must be set`);
    }

    return value;
}

// Exported so test/deployment.rehearsal.test.ts can drive the real script
// against the in-process Hardhat network. The CLI path below is unchanged;
// without the `require.main` guard, importing this module would run the deploy
// and then process.exit(0) out of the test runner.
export async function main() {
    const TextNFT = await hre.ethers.getContractFactory("TextNFT");

    const textNFT = await TextNFT.deploy(
        requiredValue("TEXT_NFT_NAME"),
        requiredValue("TEXT_NFT_SYMBOL"),
        requiredValue("TEXT_NFT_DESCRIPTION"),
        requiredValue("TEXT_NFT_IMAGE_URI"),
        requiredValue("TEXT_NFT_EXTERNAL_LINK")
    );
    await textNFT.waitForDeployment();

    const address = await textNFT.getAddress();
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
