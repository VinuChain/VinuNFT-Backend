// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev A mock ERC-20 that burns a 10% fee on every non-mint transfer.
 * Used to characterize Marketplace behaviour when the payment token
 * delivers less than `amount` to the recipient.
 */
contract FeeOnTransferERC20 is ERC20 {
    uint256 public constant FEE_BPS = 1000; // 10%

    constructor() ERC20("FeeOnTransferERC20", "FOT") {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /// @dev Burns FEE_BPS/10000 of every transfer amount when neither
    ///      sender nor recipient is address(0) (i.e. not a mint/burn).
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (amount * FEE_BPS) / 10000;
            // Burn the fee from the sender's balance first.
            super._update(from, address(0), fee);
            super._update(from, to, amount - fee);
        } else {
            super._update(from, to, amount);
        }
    }
}
