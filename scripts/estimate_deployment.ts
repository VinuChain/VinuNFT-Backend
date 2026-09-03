import hre from "hardhat";

/**
 * What a deployment of this generation would cost, against a real chain,
 * without spending anything.
 *
 * This is the deployment rehearsal that a funded key is NOT needed for. It
 * drives the same contract factories the deploy scripts drive, with the same
 * constructor arguments read from the same environment variables, and asks the
 * live node to estimate the gas. What it cannot rehearse is signing and
 * broadcasting; those need the funded key that remains a blocker.
 *
 *   npx hardhat run scripts/estimate_deployment.ts --network vinuchainTestnet
 *
 * `eth_estimateGas` is answered for a `from` with zero balance on both
 * VinuChain networks, so no funding is required to obtain the figures below.
 */

// Placeholders so the estimate runs before anyone has decided the real values.
// Both are ABI-fixed-width (an address is 32 bytes encoded, a string's cost
// depends on its length), so substituting the marketplace's commission account
// cannot move its gas figure; the TextNFT strings can, which is why the
// defaults are the values the live TextNFT was actually built with.
const DEFAULTS: Record<string, string> = {
    TEXT_NFT_NAME: "TextNFT",
    TEXT_NFT_SYMBOL: "VTXT",
    TEXT_NFT_DESCRIPTION: "Vinu Text NFT",
    TEXT_NFT_IMAGE_URI: "ipfs://QmSteWThyBS3qoknoYeSxAaTFm8TU7q4h8QNFAqHreA3Ce",
    TEXT_NFT_EXTERNAL_LINK: "https://vinunft.org",
    COMMISSION_ACCOUNT: "0x000000000000000000000000000000000000dEaD",
};

const arg = (name: string) => process.env[name] || DEFAULTS[name];

// COMMISSION_ACCOUNT ships in .env.example as the zero address, a placeholder
// for a decision nobody has made yet. It is truthy, so `arg` would hand it to
// the Marketplace constructor, which rejects zero — and estimateGas reverts,
// taking the whole read-only estimate down. Substituting the default is right
// HERE and wrong in scripts/deploy_marketplace.ts, which must keep refusing a
// zero commission account rather than quietly deploying with a different one.
const commissionAccount = () => {
    const configured = process.env.COMMISSION_ACCOUNT;
    return configured && !/^0x0+$/i.test(configured)
        ? configured
        : DEFAULTS.COMMISSION_ACCOUNT;
};

export async function main() {
    const { ethers } = hre;
    const net = await ethers.provider.getNetwork();
    const fee = await ethers.provider.getFeeData();
    const gasPrice = fee.gasPrice ?? 0n;

    // A key is not required to run this, and none is written anywhere. If one
    // IS configured, report only the address it derives — never the key.
    const signers = await ethers.getSigners();
    const deployer = signers[0]?.address ?? null;

    console.log(`network        chainId ${net.chainId}`);
    console.log(`gasPrice       ${gasPrice} wei (${ethers.formatUnits(gasPrice, "gwei")} gwei)`);
    console.log(`maxFeePerGas   ${fee.maxFeePerGas ?? "n/a"} wei`);
    console.log(
        deployer
            ? `deployer       ${deployer} (from DEPLOYER_PRIVATE_KEY)`
            : "deployer       none — set DEPLOYER_PRIVATE_KEY to see the address it derives"
    );
    if (deployer) {
        console.log(`balance        ${ethers.formatEther(await ethers.provider.getBalance(deployer))} VC`);
    }

    const factories: [string, unknown[]][] = [
        ["ImageNFT", []],
        [
            "TextNFT",
            [
                arg("TEXT_NFT_NAME"),
                arg("TEXT_NFT_SYMBOL"),
                arg("TEXT_NFT_DESCRIPTION"),
                arg("TEXT_NFT_IMAGE_URI"),
                arg("TEXT_NFT_EXTERNAL_LINK"),
            ],
        ],
        ["Marketplace", [commissionAccount()]],
    ];

    let total = 0n;
    for (const [name, args] of factories) {
        const factory = await ethers.getContractFactory(name);
        const tx = await factory.getDeployTransaction(...(args as never[]));
        // Marketplace's Ownable(msg.sender) reverts for the zero address, so
        // `from` is always supplied — the deployer if one is configured, an
        // arbitrary zero-balance address otherwise.
        const gas = await ethers.provider.estimateGas({
            ...tx,
            from: deployer ?? "0x000000000000000000000000000000000000dEaD",
        });
        total += gas;
        console.log(`${name.padEnd(14)} gas ${gas}  ~${ethers.formatEther(gas * gasPrice)} VC`);
    }

    const atGasPrice = total * gasPrice;
    const atMaxFee = total * (fee.maxFeePerGas ?? gasPrice);
    console.log(`TOTAL          gas ${total}`);
    console.log(`               ${ethers.formatEther(atGasPrice)} VC at the current gasPrice`);
    console.log(`               ${ethers.formatEther(atMaxFee)} VC at the current maxFeePerGas — fund at least this`);
    return { chainId: net.chainId, gas: total, atGasPrice, atMaxFee };
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
