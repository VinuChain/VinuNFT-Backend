// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev A mock ERC-20 whose `transferFrom` always returns false without
 * reverting.  Used to confirm that SafeERC20 converts a false return
 * value into a revert, so Marketplace.buyToken cannot silently succeed
 * with a failed payment.
 */
contract ReturnsFalseERC20 is ERC20 {
    constructor() ERC20("ReturnsFalseERC20", "RFE") {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /// @dev Always returns false to simulate a broken ERC-20.
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}
