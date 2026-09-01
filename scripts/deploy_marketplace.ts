import hre from "hardhat";

function requiredAddress(name: string): string {
    const value = process.env[name];
    if (!value || !hre.ethers.isAddress(value) || value === hre.ethers.ZeroAddress) {
        throw new Error(`${name} must be set to a non-zero address`);
    }

    return value;
}

// Exported for the rehearsal test; see deploy_text_nft.ts for why.
export async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const commissionAccount = requiredAddress("COMMISSION_ACCOUNT");

    // AGENTS.md "Production deployment rule": one key must not hold both
    // deployment authority and the accrued fee balance. The deployed v1
    // Marketplace violates this (creator == owner() == commissionAccount ==
    // 0x12BD0b15…), which is why the check lives here rather than in a review
    // checklist. It is deliberately NOT a constructor require: this is custody
    // policy, not a contract invariant, and four test files legitimately deploy
    // with the deployer as the commission account.
    if (commissionAccount.toLowerCase() === deployer.address.toLowerCase()) {
        throw new Error(
            "COMMISSION_ACCOUNT: commission account must not be the deployer"
        );
    }

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    const marketplace = await Marketplace.deploy(commissionAccount);
    await marketplace.waitForDeployment();

    const address = await marketplace.getAddress();
    console.log("Deploying from:", deployer.address);
    console.log("Commission account:", commissionAccount);
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
