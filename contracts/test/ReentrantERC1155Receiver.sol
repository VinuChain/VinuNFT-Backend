// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IMarketplace {
    function buyToken(
        IERC1155 _nftAddress,
        uint256 _tokenId,
        uint256 _listingId,
        uint256 _amount,
        uint256 _expectedPrice
    ) external payable;
}

/**
 * @dev A mock ERC-1155 receiver that re-enters `buyToken` from inside
 * `onERC1155Received`.  Used to verify that the `nonReentrant` guard on
 * `buyToken` triggers and the transaction reverts.
 *
 * The contract holds payment tokens and pre-approves the marketplace so
 * that the re-entrant call can reach the `nonReentrant` check rather than
 * failing on an earlier allowance / balance guard.
 */
contract ReentrantERC1155Receiver is IERC1155Receiver, ERC165 {
    using SafeERC20 for IERC20;

    IMarketplace public marketplace;
    IERC1155 public nftAddress;
    uint256 public tokenId;
    uint256 public listingId;
    uint256 public amount;
    uint256 public expectedPrice;
    IERC20 public paymentToken;

    constructor(address marketplace_) {
        marketplace = IMarketplace(marketplace_);
    }

    /**
     * @dev Store parameters for the re-entrant call and approve the
     * marketplace to spend payment tokens held by this contract.
     */
    function setup(
        IERC1155 nftAddress_,
        uint256 tokenId_,
        uint256 listingId_,
        uint256 amount_,
        uint256 expectedPrice_,
        IERC20 paymentToken_
    ) external {
        nftAddress = nftAddress_;
        tokenId = tokenId_;
        listingId = listingId_;
        amount = amount_;
        expectedPrice = expectedPrice_;
        paymentToken = paymentToken_;
        // Pre-approve a large allowance so the re-entrant call clears the
        // allowance check inside buyToken.
        paymentToken_.approve(address(marketplace), type(uint256).max);
    }

    /// @dev Mint payment tokens into this contract so it can pay.
    function mintPayment(uint256 amount_) external {
        // Caller must call paymentToken.mint externally if the token
        // doesn't allow arbitrary minting; this helper is a no-op here.
        // Tests call paymentToken.connect(receiver).mint(...) directly
        // since MockERC20.mint mints to msg.sender.
    }

    // ------------------------------------------------------------------ //
    //  IERC1155Receiver
    // ------------------------------------------------------------------ //

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        // Re-enter the marketplace — the nonReentrant guard must revert.
        marketplace.buyToken(nftAddress, tokenId, listingId, amount, expectedPrice);
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
