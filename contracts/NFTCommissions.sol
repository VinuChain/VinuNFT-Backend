// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTCommissions is Ownable {
    // A hard ceiling on the platform's own cut, in basis points.
    //
    // This was 10000, i.e. 100%: a timelocked increase could have taken the
    // entire sale price and left the seller nothing, which is not a sensible
    // settlement limit for a marketplace fee. 10% is well clear of the 5%
    // default and of comparable marketplaces, while making that outcome
    // impossible rather than merely delayed by the timelock.
    //
    // The royalty leg is deliberately not bounded here: it is set per token by
    // the creator and accepted by the seller when they choose to list, and
    // ERC-2981 already permits up to 100%.
    //
    // The deployed generation at 0xcA396A95E0EB8B6804e25F9db131780a60564047
    // is immutable and retains the 10000 ceiling; this applies to the next.
    uint16 public constant MAX_PLATFORM_FEE_PERCENTAGE = 1000;
    uint16 public platformFeePercentage = 500; //two decimals, so 500 = 5.00%
    address public commissionAccount;

    uint256 public lock = 0;
    uint16 public newPlatformFeePercentage = 0;
    uint256 public constant PLATFORM_FEE_TIMELOCK = 7 days;

    event CommissionAccountChanged(address indexed previousCommissionAccount, address indexed newCommissionAccount);
    event PlatformFeePercentageDecreased(uint16 previousPlatformFeePercentage, uint16 newPlatformFeePercentage);
    event PlatformFeePercentageIncreaseRequested(uint16 currentPlatformFeePercentage, uint16 newPlatformFeePercentage, uint256 applyAfter);
    event PlatformFeePercentageIncreaseApplied(uint16 previousPlatformFeePercentage, uint16 newPlatformFeePercentage);

    constructor(address _commissionAccount) Ownable(msg.sender) {
        require(_commissionAccount != address(0), "NFTCommissions: commission account cannot be zero address");
        commissionAccount = _commissionAccount;
    }

    function setCommissionAccount(address _commissionAccount) public onlyOwner {
        require(_commissionAccount != address(0), "NFTCommissions: commission account cannot be zero address");
        address previousCommissionAccount = commissionAccount;
        commissionAccount = _commissionAccount;
        emit CommissionAccountChanged(previousCommissionAccount, _commissionAccount);
    }

    function decreasePlatformFeePercentage(uint16 _lowerFeePercentage) public onlyOwner {
        require(_lowerFeePercentage < platformFeePercentage, "NFTCommissions: _lowerFeePercentage must be lower than the current platform fee percentage");
        uint16 previousPlatformFeePercentage = platformFeePercentage;
        platformFeePercentage = _lowerFeePercentage;

        // Abandon any armed increase. The timelock exists to give users notice
        // before the fee rises; announcing a decrease while a matured request
        // is still pending would let the fee jump straight back up with no
        // further notice, which is the opposite of that guarantee. A new
        // increase must be requested and wait out the timelock again.
        if (lock != 0) {
            lock = 0;
            newPlatformFeePercentage = 0;
        }

        emit PlatformFeePercentageDecreased(previousPlatformFeePercentage, _lowerFeePercentage);
    }

    function requestPlatformFeePercentageIncrease(uint16 _higherFeePercentage) public onlyOwner {
        require(_higherFeePercentage > platformFeePercentage, "NFTCommissions: _higherFeePercentage must be higher than the current platform fee percentage");
        require(_higherFeePercentage <= MAX_PLATFORM_FEE_PERCENTAGE, "NFTCommissions: platform fee percentage cannot exceed MAX_PLATFORM_FEE_PERCENTAGE");
        lock = block.timestamp + PLATFORM_FEE_TIMELOCK;
        newPlatformFeePercentage = _higherFeePercentage;
        emit PlatformFeePercentageIncreaseRequested(platformFeePercentage, _higherFeePercentage, lock);
    }

    function applyPlatformFeePercentageIncrease() public onlyOwner {
        require(lock != 0, "NFTCommissions: platform fee percentage increase must be first requested");
        require(block.timestamp >= lock, "NFTCommissions: platform fee percentage increase is locked");
        uint16 previousPlatformFeePercentage = platformFeePercentage;
        lock = 0;
        platformFeePercentage = newPlatformFeePercentage;
        newPlatformFeePercentage = 0;
        emit PlatformFeePercentageIncreaseApplied(previousPlatformFeePercentage, platformFeePercentage);
    }
}
