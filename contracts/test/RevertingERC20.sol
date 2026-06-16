// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev A mock ERC-20 that reverts any transfer whose recipient equals
 * a configurable `blockedAddress`.  Used to simulate a token that
 * bricks one settlement leg (e.g. the commission account).
 */
contract RevertingERC20 is ERC20 {
    address public blockedAddress;

    constructor(address blocked_) ERC20("RevertingERC20", "REV") {
        blockedAddress = blocked_;
    }

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    function setBlockedAddress(address blocked_) external {
        blockedAddress = blocked_;
    }

    /// @dev Reverts when the recipient is the blocked address.
    function _update(address from, address to, uint256 amount) internal override {
        if (to == blockedAddress && from != address(0)) {
            revert("blocked");
        }
        super._update(from, to, amount);
    }
}
