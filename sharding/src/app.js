// ---------------------------- Imports ----------------------------

import { ethers } from "ethers";


// ---------------------------- Configuration ----------------------------

// read-only RPC endpoint to browse listings even if the user is not connected to a wallet
const rpcURL =
    "https://eth-sepolia.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Address of the smart contract 'EscrowManager' deployed on Sepolia
// TODO: Replace with the actual deployed contract address
const contractAddress = 
    "0x00000000000000000000000000000000000000000000000000000000";

// Complete ABI of the smart contract
const abi = [

    // Listings
    "function createListing(uint256 price, string metadataRef) returns (uint256 listingId)",
    "function cancelListing(uint256, listingId)",
    "function getListing(uint256 listingId) view returns (tuple(uint256 id, address seller, uint256 price, string metadataRef, bool active))",
    "function listingCount() view returns (uint256)",

    // Orders - Escrow
    "function buy(uint256 listingId) payable returns (uint256 orderId)",
    "function confirmReceipt(uint256 orderId)",
    "function claimTimeout(uint256 orderId)",
    "function getOrder(uint256 orderId) view returns (tuple(uint256 id, uint256 listingId, address buyer, address seller, uint256 amount, uint8 status, uint256 deadline))",
    "function orderCount() view returns (uint256)",
    "function TIMEOUT_DURATION() view returns (uint256)",

    // Withdrawals
    "function withdraw()",
    "function pendingWithdrawals(address) view returns (uint256)",
    
    // Content - Public keys
    "function registerPublicKey(bytes publicKey)",
    "function sendContent(address receiver, string contentType) returns (uint256 contentId)",
    "function getPublicKey(address account) view returns (bytes)",
    "function contentCount() view returns (uint256)",

    // Events
    "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price, string metadataRef)",
    "event ListingCancelled(uint256 indexed listingId)",
    "event OrderCreated(uint256 indexed orderId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, uint256 deadline)",
    "event OrderConfirmed(uint256 indexed orderId)",
    "event OrderTimeoutClaimed(uint256 indexed orderId)",
    "event Withdrawal(address indexed account, uint256 amount)",
    "event PublicKeyRegistered(address indexed account, bytes publicKey)",
    "event ContentSent(uint256 indexed contentId, address indexed sender, address indexed receiver, string contentType)"
];

// Possible status of an order (same order as the Solidity enum OrderStatus : Funded = 0, Released = 1)
const OrderStatus = Object.freeze({
    Funded: 0,
    Released: 1
});


// ---------------------------- Global state of connexion ----------------------------

if (!window.ethereum) {
    alert("Please install MetaMask to use this application.");
}

// Read-only provider to print listings even if the user is not connected to a wallet
const readProvider = new ethers.JsonRpcProvider(rpcURL);
const readContract = new ethers.Contract(contractAddress, abi, readProvider);

// MetaMask provider (filled after the user connects their wallet)
let browserProvider = null;     // object that represents the connection to the user's MetaMask wallet, used to interact with the extension
let signer = null;              // comes from browserProvider, represents the account and is used to sign transactions and messages
let currentAccount = null;      // account address (string) of the currently connected wallet exctracted from signer, used to print of compare addresses
let writeContract = null;       // EscrowManager instance linked to signer, used to send signed transactions to the smart contract


// ---------------------------- Functions to connect to MetaMask ----------------------------

async function connectMetaMask() {
    try {
        browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.send("eth_requestAccounts", []);

        signer = await browserProvider.getSigner();
        currentAccount = await signer.getAddress();
        writeContract = new ethers.Contract(contractAddress, abi, signer);

        const accountInfoInput = document.getElementById("accountInfo");
        if (accountInfoInput) accountInfoInput.value = currentAccount;

        console.log("Metamask connected:", currentAccount);
        onAccountReady(currentAccount);
    } catch (error) {
        console.error("Error connecting Metamask:", error);
    }
}

// React to account changes in MetaMask (e.g., user switches accounts or networks without refreshing the page)
if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
            currentAccount = null;
            signer = null;
            writeContract = null;
            console.log("Metamask disconnected");
            return;
        }
        currentAccount = ethers.getAddress(accounts[0]);
        signer = await browserProvider.getSigner();
        writeContract = new ethers.Contract(contractAddress, abi, signer);
        
        const accountInfoInput = document.getElementById("accountInfo");
        if (accountInfoInput) accountInfoInput.value = currentAccount;

        onAccountReady(currentAccount);
    });
}

// Hook for refreshing the role-dependent UI once the account is known (populated as views are connected).
function onAccountReady(account) {
    // TODO: Implement role-dependent UI updates here, such as displaying user-specific information 
    // or enabling certain actions based on the account's role in the application.
}


// ---------------------------- Role Detection ----------------------------
// An account can have multiple roles (buyer, seller). 
// The role is then determined by the actions the account has taken (e.g., creating listings, buying items).

// Is the connected account the seller of a specific listing?
function isListingSeller(listing, account = currentAccount) {
    if (!account) return false;
    return listing.seller.toLowerCase() === account.toLowerCase();
}

// Is the connected account the buyer of a specific order?
function isOrderBuyer(order, account = currentAccount) {
    if (!account) return false;
    return order.buyer.toLowerCase() === account.toLowerCase();
}

// Is the connected account the seller of a specific order?
function isOrderSeller(order, account = currentAccount) {
    if (!account) return false;
    return order.seller.toLowerCase() === account.toLowerCase();
}

// Role of the connected account in a specific order (buyer, seller, or visitor). Returns null if the account is not involved in the order.
function getOrderRole(order, account = currentAccount) {
    if (isOrderBuyer(order, account)) return "buyer";
    if (isOrderSeller(order, account)) return "seller";
    return null;
}


// ---------------------------- Event Listeners ----------------------------

const connectMetaMaskButton = document.getElementById("connectMetaMask");
if (connectMetaMaskButton) {
    connectMetaMaskButton.addEventListener("click", connectMetaMask);
}