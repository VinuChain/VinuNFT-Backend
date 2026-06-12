// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTCommissions is Ownable {
    uint16 public constant MAX_PLATFORM_FEE_PERCENTAGE = 10000;
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
        emit PlatformFeePercentageDecreased(previousPlatformFeePercentage, _lowerFeePercentage);
    }

    function requestPlatformFeePercentageIncrease(uint16 _higherFeePercentage) public onlyOwner {
        require(_higherFeePercentage > platformFeePercentage, "NFTCommissions: _higherFeePercentage must be higher than the current platform fee percentage");
        require(_higherFeePercentage <= MAX_PLATFORM_FEE_PERCENTAGE, "NFTCommissions: platform fee percentage cannot exceed 10000 basis points");
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
