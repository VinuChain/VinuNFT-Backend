// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";


contract Marketplace is Pausable, Ownable, NFTCommissions, ReentrancyGuard {
    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;

    event TokenListed(
        uint256 indexed _tokenId,
        address indexed _seller,
        uint256 _listingId,
        uint256 amount,
        uint256 _price
    );

    event TokenDelisted(
        uint256 indexed _tokenId,
        address indexed _seller,
        uint256 _listingId
    );

    event TokenPurchased(
        uint256 indexed _tokenId,
        address indexed _buyer,
        address indexed _seller,
        uint256 _listingId,
        uint256 _amount,
        uint256 _price
    );

    struct Listing {
        uint256 price;
        address seller;
        uint256 amount;
    }

    // (tokenId => (listingId => Listing)) mapping
    mapping(uint256 => mapping(uint256 => Listing)) public listings;
    mapping(uint256 => uint256) public listingCount;

    constructor(address _commissionAccount) ZangNFTCommissions(_commissionAccount) {

    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function listToken(IERC1155 nftAddress, uint256 _tokenId, uint256 _price, uint256 _amount) external whenNotPaused nonReentrant {
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist");
        require(nftAddress.isApprovedForAll(msg.sender, address(this)), "Marketplace: Marketplace contract is not approved");
        require(_amount <= nftAddress.balanceOf(msg.sender, _tokenId), "Marketplace: not enough tokens to list");
        require(_amount > 0, "Marketplace: amount must be greater than 0");
        require(_price > 0, "Marketplace: price must be greater than 0");

        uint256 listingId = listingCount[_tokenId];
        listings[_tokenId][listingId] = Listing(_price, msg.sender, _amount);
        listingCount[_tokenId]++;
        emit TokenListed(_tokenId, msg.sender, listingId, _amount, _price);
    }

    function editListingAmount(IERC1155 nftAddress, uint256 _tokenId, uint256 _listingId, uint256 _amount, uint256 _expectedAmount) external whenNotPaused nonReentrant {
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist");
        require(nftAddress.isApprovedForAll(msg.sender, address(this)), "Marketplace: Marketplace contract is not approved");
        // require(_listingId < listingCount[_tokenId], "Marketplace: listing ID out of bounds"); // Opt.
        require(listings[_tokenId][_listingId].seller == msg.sender, "Marketplace: can only edit own listings");
        require(_amount <= nftAddress.balanceOf(msg.sender, _tokenId), "Marketplace: not enough tokens to list");
        require(_amount > 0, "Marketplace: amount must be greater than 0");
        // require(listings[_tokenId][_listingId].seller != address(0), "Marketplace: listing does not exist"); // Opt.
        require(listings[_tokenId][_listingId].amount == _expectedAmount, "Marketplace: expected amount does not match");

        listings[_tokenId][_listingId].amount = _amount;
        emit TokenListed(_tokenId, msg.sender, _listingId, _amount, listings[_tokenId][_listingId].price);
    }
    
    function editListing(IERC1155 nftAddress, uint256 _tokenId, uint256 _listingId, uint256 _price, uint256 _amount, uint256 _expectedAmount) external whenNotPaused nonReentrant {
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist");
        require(nftAddress.isApprovedForAll(msg.sender, address(this)), "Marketplace: Marketplace contract is not approved");
        // require(_listingId < listingCount[_tokenId], "Marketplace: listing ID out of bounds"); // Opt.
        require(listings[_tokenId][_listingId].seller == msg.sender, "Marketplace: can only edit own listings");
        require(_amount <= nftAddress.balanceOf(msg.sender, _tokenId), "Marketplace: not enough tokens to list");
        require(_amount > 0, "Marketplace: amount must be greater than 0");
        require(_price > 0, "Marketplace: price must be greater than 0");
        //require(listings[_tokenId][_listingId].seller != address(0), "Marketplace: listing does not exist"); // Opt.
        require(listings[_tokenId][_listingId].amount == _expectedAmount, "Marketplace: expected amount does not match");

        listings[_tokenId][_listingId] = Listing(_price, msg.sender, _amount);
        emit TokenListed(_tokenId, msg.sender, _listingId, _amount, _price);
    }

    function editListingPrice(IERC1155 nftAddress, uint256 _tokenId, uint256 _listingId, uint256 _price) external whenNotPaused nonReentrant {
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist");
        // require(_listingId < listingCount[_tokenId], "Marketplace: listing ID out of bounds"); // Opt.
        require(nftAddress.isApprovedForAll(msg.sender, address(this)), "Marketplace: Marketplace contract is not approved");
        require(listings[_tokenId][_listingId].seller == msg.sender, "Marketplace: can only edit own listings");
        require(_price > 0, "Marketplace: price must be greater than 0");
        //require(listings[_tokenId][_listingId].seller != address(0), "Marketplace: listing does not exist"); // Opt.

        listings[_tokenId][_listingId].price = _price;
        emit TokenListed(_tokenId, msg.sender, _listingId, listings[_tokenId][_listingId].amount, _price);
    }

    function delistToken(IERC1155 nftAddress, uint256 _tokenId, uint256 _listingId) external whenNotPaused nonReentrant {
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist");
        require(nftAddress.isApprovedForAll(msg.sender, address(this)), "Marketplace: Marketplace contract is not approved");
        // require(_listingId < listingCount[_tokenId], "Marketplace: listing ID out of bounds"); // Opt.
        //require(listings[_tokenId][_listingId].seller != address(0), "Marketplace: cannot interact with a delisted listing"); // Opt.
        require(listings[_tokenId][_listingId].seller == msg.sender, "Marketplace: can only remove own listings");

        _delistToken(_tokenId, _listingId);
    }

    function _removeListing(uint256 _tokenId, uint256 _listingId) private {
        delete listings[_tokenId][_listingId];
    }

    function _delistToken(uint256 _tokenId, uint256 _listingId) private {
        _removeListing(_tokenId, _listingId);
        emit TokenDelisted(_tokenId, msg.sender, _listingId);
    }

    function _handleFunds(IERC1155 nftAddress, uint256 _tokenId, address seller) private {
        uint256 value = msg.value;
        uint256 platformFee = (value * nftAddress.platformFeePercentage()) / 10000;

        uint256 remainder = value - platformFee;

        address creator;
        uint256 creatorFee;

        if (nftAddress.supportsInterface(_INTERFACE_ID_ERC2981)) {
            (creator, creatorFee) = IERC2981(address(_nftAddress)).royaltyInfo(_tokenId, remainder);
        }

        uint256 sellerEarnings = remainder;
        bool sent;

        if(creatorFee > 0) {
            sellerEarnings -= creatorFee;
            (sent, ) = payable(creator).call{value: creatorFee}("");
            require(sent, "Marketplace: could not send creator fee");
        }

        (sent, ) = payable(nftAddress.zangCommissionAccount()).call{value: platformFee}("");
        require(sent, "Marketplace: could not send platform fee");

        (sent, ) = payable(seller).call{value: sellerEarnings}("");
        require(sent, "Marketplace: could not send seller earnings");
    }

    function buyToken(IERC1155 nftAddress, uint256 _tokenId, uint256 _listingId, uint256 _amount) external payable whenNotPaused nonReentrant {
        // If all copies have been burned, the token is deleted
        require(nftAddress.exists(_tokenId), "Marketplace: token does not exist"); // Opt.
        require(_amount > 0, "Marketplace: _amount must be greater than 0");
        require(_listingId < listingCount[_tokenId], "Marketplace: listing index out of bounds"); // Opt.
        require(listings[_tokenId][_listingId].seller != address(0), "Marketplace: cannot interact with a delisted listing");
        require(listings[_tokenId][_listingId].seller != msg.sender, "Marketplace: cannot buy from yourself");
        require(_amount <= listings[_tokenId][_listingId].amount, "Marketplace: not enough tokens to buy");
        address seller = listings[_tokenId][_listingId].seller;
        // If seller transfers tokens "for free", their listing is still active! If they get them back they can still be bought
        require(_amount <= nftAddress.balanceOf(seller, _tokenId), "Marketplace: seller does not have enough tokens");

        uint256 price = listings[_tokenId][_listingId].price;
        // check if listing is satisfied
        require(msg.value == price * _amount, "Marketplace: price does not match");

        // Update listing
        listings[_tokenId][_listingId].amount -= _amount;

        // Delist a listing if all tokens have been sold
        if (listings[_tokenId][_listingId].amount == 0) {
            _delistToken(_tokenId, _listingId);
        }

        emit TokenPurchased(_tokenId, msg.sender, seller, _listingId, _amount, price);

        _handleFunds(_tokenId, seller);
        nftAddress.safeTransferFrom(seller, msg.sender, _tokenId, _amount, "");
    }
}