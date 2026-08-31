// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EscrowManager
/// @notice Manages listings and orders of a marketplace based on
///         escrow mechanism: buyer's funds are held in the contract until
///         receipt confirmation or expiration of a time limit (tiemout).
///         No arbitration or dispute resolution is implemented: users are
///         assumed to behave correctly (assumption made for this version of
///         the contract).
/// @dev    This contract only manages financial aspect of the application. 
///         The optionnal content related to an order (pictures, expedition 
///         proofs, encrypted messages) is managed by another contract 
///         (ContentManager.sol) linked here only thanks to the "orderId".

contract EscrowManager {

    // ---------------------------- Types ----------------------------

    enum OrderStatus {
        Funded, // Funds are locked, waiting for confirmation or dispute
        Released // Funds released to the seller (final state)
    }

    struct Listing {
        uint256 id;
        address seller;
        uint256 price; // in wei (1 ETH = 10^18 wei)
        string metadataRef; // external reference (hash/pointer) to the description
        bool active; // false once selled or cancelled
    }

    struct Order {
        uint256 id;
        uint256 listingId;
        address buyer;
        address seller;
        uint256 amount; // Locked amount (listing.price copy on buying timing)
        OrderStatus status;
        uint256 deadline; // timestamp from which claimTimeout() becomes possible
    }


    // ---------------------------- Constants and states ----------------------------

    /// @notice Delay after which, if there is no confirmation or dispute,
    ///         the seller can reclaim funds himself.
    uint256 public constant TIMEOUT_DURATION = 15 days;

    uint256 public listingCount;
    uint256 public orderCount;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Order) public orders;

    /// @notice Balances pending withdrawal (pull-payment pattern).
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Public key registered by each user, used to send encrypted content (ECIES).
    mapping(address => bytes) public publicKeys;

    uint256 public contentCount;

    /// @notice Block number where the blob transaction containing the content (listingId or orderId + contentType) was mined
    mapping(bytes32 => uint256) public contentBlockNumber;

    // ---------------------------- Events ----------------------------

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price, string metadataRef);
    event ListingCancelled(uint256 indexed listingId);
    event OrderCreated(uint256 indexed orderId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, uint256 deadline);
    event OrderConfirmed(uint256 indexed orderId);
    event OrderTimeoutClaimed(uint256 indexed orderId);
    event Withdrawal(address indexed account, uint256 amount);
    event PublicKeyRegistered(address indexed account, bytes publicKey);
    event ContentSent(uint256 indexed contentId, address indexed sender, address indexed receiver, string contentType);


    // ---------------------------- Custom errors (Cheaper in gas than require + string) ----------------------------

    error NotBuyer();
    error NotSeller();
    error ListingNotActive();
    error WrongAmount();
    error WrongStatus();
    error TimeoutNotReached();
    error NothingToWithdraw();
    error TransferFailed();
    error PublicKeyAlreadyRegistered();
    error EmptyPublicKey();
    error InvalidReceiver();


    // ---------------------------- Modifiers ----------------------------

    modifier onlyBuyer(uint256 orderId) {
        if (msg.sender != orders[orderId].buyer) revert NotBuyer();
        _;
    }


    // ---------------------------- Listings ----------------------------

    /// @notice             Creates a new one-time listing.
    /// @param price        Price in wei.
    /// @param metadataRef  External reference to the item description.
    function createListing(uint256 price, string calldata metadataRef) external returns (uint256 listingId) {
        require (price > 0, "price must be > 0");

        listingId = listingCount++;
        listings[listingId] = Listing({
            id: listingId,
            seller: msg.sender,
            price: price,
            metadataRef: metadataRef,
            active: true
        });

        emit ListingCreated(listingId, msg.sender, price, metadataRef);
    }

    /// @notice Cancels a listing not yet sold (reserved to the seller).
    function cancelListing(uint256 listingId) external {
        if (msg.sender != listings[listingId].seller) revert NotSeller();
        if (!listings[listingId].active) revert ListingNotActive();

        listings[listingId].active = false;

        emit ListingCancelled(listingId);
    }


    // ---------------------------- Order lifecycle ----------------------------

    /// @notice Buys an item from an active order, locks the funds in the contract.
    function buy(uint256 listingId) external payable returns (uint256 orderId) {
        if (!listings[listingId].active) revert ListingNotActive();
        if (msg.value != listings[listingId].price) revert WrongAmount();

        listings[listingId].active = false;

        orderId = orderCount++;
        uint256 deadline = block.timestamp + TIMEOUT_DURATION;

        orders[orderId] = Order({
            id: orderId,
            listingId: listingId,
            buyer: msg.sender,
            seller: listings[listingId].seller,
            amount: msg.value,
            status: OrderStatus.Funded,
            deadline: deadline
        });

        emit OrderCreated(orderId, listingId, msg.sender, listings[listingId].seller, msg.value, deadline);
    }

    /// @notice Buyer confirms receipt of the item : released the seller's funds.
    function confirmReceipt(uint256 orderId) external onlyBuyer(orderId) {
        if (orders[orderId].status != OrderStatus.Funded) revert WrongStatus();

        orders[orderId].status = OrderStatus.Released;
        pendingWithdrawals[orders[orderId].seller] += orders[orderId].amount;

        emit OrderConfirmed(orderId);
    }

    /// @notice Seller claims the funds after the timeout if the buyer did not confirm receipt.
    function claimTimeout(uint256 orderId) external {
        if (block.timestamp < orders[orderId].deadline) revert TimeoutNotReached();
        if (orders[orderId].seller != msg.sender) revert NotSeller();
        if (orders[orderId].status != OrderStatus.Funded) revert WrongStatus();

        orders[orderId].status = OrderStatus.Released;
        pendingWithdrawals[orders[orderId].seller] += orders[orderId].amount;

        emit OrderTimeoutClaimed(orderId);
    }


    // ---------------------------- Withdrawal (Pull-Payment) ----------------------------

    /// @notice Withdraws the pending balance for the caller.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable (msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, amount);
    }


    // ---------------------------- Public Key Management ----------------------------

    /// @notice Registers the public key of the caller for encrypted communication.
    function registerPublicKey(bytes calldata publicKey) external {
        if (publicKeys[msg.sender].length != 0) revert PublicKeyAlreadyRegistered();
        if (publicKey.length == 0) revert EmptyPublicKey();

        publicKeys[msg.sender] = publicKey;

        emit PublicKeyRegistered(msg.sender, publicKey);
    }

    // ---------------------------- Content Management ----------------------------

    /// @param receiver The address of the receiver (buyer or seller) of the content.
    /// @param contentType The type of the content (e.g., "listing_image", "shipment_proof", "message").
    /// @param relatedId The ID of the related entity (e.g., listing ID, order ID).
    function sendContent(address receiver, string calldata contentType, uint256 relatedId) external returns (uint256 contentId) {
        if (receiver == address(0)) revert InvalidReceiver();

        contentId = contentCount++;
        bytes32 key = keccak256(abi.encodePacked(relatedId, contentType));
        contentBlockNumber[key] = block.number;

        emit ContentSent(contentId, msg.sender, receiver, contentType);
    }

    // ---------------------------- Utility Views ----------------------------

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getPublicKey(address account) external view returns (bytes memory) {
        return publicKeys[account];
    }

    function getContentBlock(uint256 relatedId, string calldata contentType) external view returns (uint256) {
        return contentBlockNumber[keccak256(abi.encodePacked(relatedId, contentType))];
    }
}