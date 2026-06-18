// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";

/**
 * @dev A functioning ERC-1155 whose ERC2981 `royaltyInfo` returns
 * attacker-controlled, STORED values verbatim (ignoring `salePrice`).
 *
 * Used to exercise Marketplace._handleFunds against malformed royalty data
 * that a well-behaved OZ `ERC2981` could never produce:
 *   - an absolute fee larger than the available remainder (would otherwise
 *     revert every sale via underflow), and
 *   - a non-zero fee paid to address(0) (would revert / burn the royalty).
 *
 * Unlike OZ's ERC2981 (which derives the amount from `salePrice` and a
 * numerator capped at the 10000 denominator), this mock returns the raw
 * stored `(_royaltyReceiver, _royaltyAmount)` so an oversized absolute
 * amount can be returned directly.
 */
contract MockRoyaltyNFT is ERC1155, IERC2981 {
    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;

    uint256 public lastTokenId;
    address private _royaltyReceiver;
    uint256 private _royaltyAmount;

    constructor() ERC1155("") {}

    /// @dev Set the verbatim royaltyInfo return values.
    function setRoyalty(address receiver, uint256 amount) external {
        _royaltyReceiver = receiver;
        _royaltyAmount = amount;
    }

    /// @dev Returns the stored receiver/amount regardless of `salePrice`.
    function royaltyInfo(uint256, uint256)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        return (_royaltyReceiver, _royaltyAmount);
    }

    function mint(uint256 amount) external returns (uint256) {
        require(amount > 0, "MockRoyaltyNFT: amount cannot be zero");
        lastTokenId++;
        _mint(msg.sender, lastTokenId, amount, "");
        return lastTokenId;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, IERC165)
        returns (bool)
    {
        return interfaceId == _INTERFACE_ID_ERC2981 || super.supportsInterface(interfaceId);
    }
}
