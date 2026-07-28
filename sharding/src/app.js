// ---------------------------- Imports ----------------------------

import { ethers } from "ethers";


// ---------------------------- Configuration ----------------------------

// read-only RPC endpoint to browse listings even if the user is not connected to a wallet
const rpcURL =
    "https://eth-sepolia.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Address of the smart contract 'EscrowManager' deployed on Sepolia
// TODO: Replace with the actual deployed contract address
const contractAddress = 
    "0xdCeD9c616d18Aacf7c7d94479dE9d8ffe27971Ce";

// Complete ABI of the smart contract
const abi = [

    // Listings
    "function createListing(uint256 price, string metadataRef) returns (uint256 listingId)",
    "function cancelListing(uint256 listingId)",
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


const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const SEPOLIA_ADD_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [rpcURL],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

// ---------------------------- Functions to connect to MetaMask ----------------------------

/// Function to verify that Metamask works with Sepolia to make sure we are on the testnet
async function ensureSepoliaNetwork() {
  const network = await browserProvider.getNetwork();
  if (network.chainId === SEPOLIA_CHAIN_ID) return true;
 
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
    return true;
  } catch (switchError) {

    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SEPOLIA_ADD_PARAMS],
        });
        return true;
      } catch (addError) {
        console.error("Couldn't add Sepolia network", addError);
        return false;
      }
    }
    console.error("Couldn't switch to Sepolia network", switchError);
    return false;
  }
}

async function connectMetaMask() {
    try {
        browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.send("eth_requestAccounts", []);

        const onSepolia = await ensureSepoliaNetwork();
        if (!onSepolia) {
            alert("This application only works with Sepolia. Switch network on Metamask and try again.");
            browserProvider = null;
            return;
        }

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
    window.ethereum.on("accountsChanged", async (accounts) => {
        if (accounts.length === 0) {
            currentAccount = null;
            signer = null;
            writeContract = null;
            console.log("Metamask disconnected");
            await refreshWalletBalance();
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


// ---------------------------- Reading listings and orders ----------------------------

// Function to get all existing listings (active or not)
async function fetchAllListings() {
    const count = await readContract.listingCount();
    const listings = [];

    for (let i=0n ; i<count; i++) {
        listings.push(await readContract.getListing(i));
    }

    // Using reverse() to make put more recent listings first 
    return listings.reverse();
}

// Function to get all existing active listings (active = true)
async function fetchActiveListings() {
    const listings = await fetchAllListings();

    return listings.filter((listing) => listing.active);
}

// Function to get all existing orders (active or not)
async function fetchAllOrders() {
    const count = await readContract.orderCount();
    const orders = [];

    for (let i=0n ; i<count; i++) {
        orders.push(await readContract.getOrder(i));
    }

    // Using reverse() to make put more recent orders first 
    return orders.reverse();
} 

// Function to get the set of listingIds that have an associated order (to get canceled listings)
async function fetchSoldListingIds() {
    const orders = await fetchAllOrders();
    return new Set(orders.map((order) => order.listingId.toString()));
}

// Function to get orders where the connected account is the buyer
async function fetchOrdersAsBuyer(account = currentAccount) {
    if (!account) return [];

    const orders = await fetchAllOrders();

    return orders.filter((order) => isOrderBuyer(order, account));
}

// Function to get orders where the connected account is the seller
async function fetchOrdersAsSeller(account = currentAccount) {
    if (!account) return [];

    const orders = await fetchAllOrders();

    return orders.filter((order) => isOrderSeller(order, account));
}

// Function to get all the listings published by the connected account
async function fetchMyListings(account = currentAccount) {
    if (!account) return [];

    const [listings, soldIds] = await Promise.all([fetchAllListings(), fetchSoldListingIds()]);

    return listings.filter((listing) => {
        if (!isListingSeller(listing, account)) return false;

        return listing.active || soldIds.has(listing.id.toString());
    });
}

// Function to get a Map of all listings indexed by their id (as string), useful to get descriptions from orders
async function fetchListingsMap() {
    const listings = await fetchAllListings();
    return new Map(listings.map((listing) => [listing.id.toString(), listing]));
}

// ---------------------------- Seller actions ----------------------------

// Function to create a new listing
// @param priceEth: price in Gwei (converted to Wei inside the function)
// @param metadataRef: external reference to the object description
async function createListing(priceGwei, metadataRef) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    const priceWei = ethers.parseUnits(priceGwei, "gwei");

    try {
        const tx = await writeContract.createListing(priceWei, metadataRef);
        const receipt = await tx.wait();

        // Get the listingId from the event emitted by the contract
        const event = receipt.logs.map((log) => {
            try {
                return writeContract.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find((parsed) => parsed && parsed.name === "ListingCreated");
    
    const listingId = event ? event.args.listingId : null;
    console.log("Listing created with ID: ", listingId?.toString());

    return listingId;
    } catch (error) {
        console.error("Error creating listing: ", error);
        alert("Error creating listing: " + error.message);
    }
}

// Function to cancel an existing listing
async function cancelListing(listingId) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const tx = await writeContract.cancelListing(listingId);
        await tx.wait();
        console.log("Listing canceled with ID: ", listingId);
    } catch(error) {
        console.error("Error canceling listing: ", error);
        alert("Error canceling listing: " + error.message);
    }
}


// ---------------------------- Buyer Actions ----------------------------

// Function to buy a listing (create an order)
async function buyListing(listingId) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const listing = await readContract.getListing(listingId);
        if (!listing.active) {
            alert("This listing is no longer active.");
            return;
        }
        
        const tx = await writeContract.buy(listingId, { value: listing.price });
        const receipt = await tx.wait();
        console.log("Buy transaction done, tx: ", receipt.hash);
    } catch (error) {
        console.error("Error buying listing: ", error);
        alert("Error buying listing: " + error.message);
    }
}

// Function to confirm receipt of an order (release funds to the contract)
async function confirmReceipt(orderId) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const tx = await writeContract.confirmReceipt(orderId);
        await tx.wait();
        console.log("Receipt confirmed for order: ", orderId);
    } catch (error) {
        console.error("Error confirming receipt: ", error);
        alert("Error confirming receipt: " + error.message);
    }
}

// Function to claim a timeout on an order (if the buyer did not confirm receipt in time)
async function claimTimeout(orderId) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const tx = await writeContract.claimTimeout(orderId);
        await tx.wait();
        console.log("Timeout claimed for order: ", orderId);
    } catch (error) {
        console.error("Error claiming timeout: ", error);
        alert("Error claiming timeout: " + error.message);
    }
}

// Function to know if a timeout can be claimed for a specific order (if the deadline has passed and the order is still funded)
// We'll use it for the UI to know if we display the "Claim Timeout" button or not. This is a read-only function, it does not send a transaction to the blockchain.
function isTimeoutClaimable(order) {
    if (order.status !== 0n) return false; // Only funded orders can be claimed
    
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    return nowSeconds >= order.deadline;
}


// ---------------------------- Funds withdrawal ----------------------------

// Function to get the funds available for withdrawal
async function fetchPendingWithdrawal(account = currentAccount) {
    if (!account) return 0n;
    return readContract.pendingWithdrawals(account);
}

// Function to withdraw available funds of the connected account
async function withdrawFunds() {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const tx = await writeContract.withdraw();
        await tx.wait();
        console.log("Withdrawal succeeded for ", currentAccount);
    } catch(error) {
        console.error("Error withdrawing funds :", error);
        alert("Error withdrawing funds: ", error.message);
    }
}


// ---------------------------- Public keys and Content ----------------------------

// Function to register the public key of the connected account (one-time function)
async function registerPublicKey(publicKeyHex) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    try {
        const tx = await writeContract.registerPublicKey(publicKeyHex);
        await tx.wait();
        console.log("Public key registered for ", currentAccount);
    } catch (error) {
        console.error("Error registering the public key :", error);
        alert("Error registering the public key :", error.message);
    }
}

// Function to get the public key registered for a specific account (empty if no key registered yet)
async function fetchPublicKey(account) {
    return readContract.getPublicKey(account);
}

// Function to know if the account has already registered a public key
async function hasRegisteredPublicKey(account) {
    const key = await fetchPublicKey(account);
    return key && key !== "0x";
}

// Function to signal the sending of content to `receiver`. It does not currently
/// carry any actual data: only the on-chain pointer
/// (contentId, sender, receiver, contentType) is created.
/// TODO: hook up the attachment of the actual content here via a blob
/// (ECIES encryption + EIP-4844 transaction) in a later step.
async function sendContent(receiver, contentType) {
    if (!writeContract) {
        alert("Please connect your MetaMask wallet first.");
        return;
    }

    if(!ethers.isAddress(receiver)) {
        alert("Wrong receiver's address.");
        return;
    }

    try {
        const tx = await writeContract.sendContent(receiver, contentType);
        const receipt = await tx.wait();

        const event = receipt.logs.map((log) => {
            try {
                return writeContract.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find((parsed) => parsed && parsed.name === "ContentSent");

        const contentId = event ? event.args.contentId : null;
        console.log("Signaled content, contentId :", contentId?.toString());
        return contentId;
    } catch (error) {
        console.error("Error sending content :", error);
        alert("Error sending content :", error.message);
    }
}


// ---------------------------- Formatting for display ----------------------------

// Function to shorten address in order to make it more readable
function shortenAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Function to transform a price into a wei price
function formatGwei(wei) {
    return `${ethers.formatUnits(wei, "gwei")} Gwei`;
}

// Function to convert a Unix timestamp in seconds into a human-readable date based on locale settings
function formatDeadline(deadlineSeconds) {
    return new Date(Number(deadlineSeconds) * 1000).toLocaleString();
}


// ---------------------------- Render : listing and order cards ----------------------------

const listingCardTemplate = document.getElementById("listingCardTemplate");
const orderCardTemplate = document.getElementById("orderCardTemplate");

// Function to build a listing card with "buy" or "sell" button depending on the view
function createListingCardElement(listing, context) {
    const node = listingCardTemplate.content.cloneNode(true);

    node.querySelector(".price").textContent = formatGwei(listing.price);

    const statusBadge = node.querySelector(".status-badge");
    if (listing.active) {
        statusBadge.textContent = "Active";
        statusBadge.className = "status-badge card-badge status-active";
    } else {
        statusBadge.textContent = "Sold";
        statusBadge.className = "status-badge card-badge status-sold";
    }

    node.querySelector(".listing-desc").textContent = listing.metadataRef;

    const sellerEl = node.querySelector(".seller-address");
    sellerEl.textContent = shortenAddress(listing.seller);
    sellerEl.title = listing.seller;

    const actions = node.querySelector(".card-actions");

    if (context === "sell" && listing.active) {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn btn-danger btn-sm";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", async () => {
            cancelBtn.disabled = true;
            await cancelListing(listing.id);
            await refreshSellerView();
        });
        actions.appendChild(cancelBtn);
    }

    if (context === "buy" && listing.active) {
        const isOwn = isListingSeller(listing);
        const buyBtn = document.createElement("button");
        buyBtn.className = "btn btn-primary btn-sm";
        buyBtn.textContent = isOwn ? "This is your listing" : "Buy";
        buyBtn.disabled = isOwn || !currentAccount;
        buyBtn.addEventListener("click", async () => {
            buyBtn.disabled = true;
            await buyListing(listing.id);
            await Promise.all([refreshActiveListings(), refreshBuyerView()]);
        });
        actions.appendChild(buyBtn);
    }

    return node;
}

// Function to build an order card with "buyer" or "seller" role to display the available actions
function createOrderCardElement(order, role, listingsMap) {
    const node = orderCardTemplate.content.cloneNode(true);

    const listing = listingsMap?.get(order.listingId.toString());
    const label = listing ? listing.metadataRef : `Order #${order.id.toString()}`;
    node.querySelector(".order-id").textContent = label;

    const statusBadge = node.querySelector(".status-badge");
    if (order.status === 0n) {
        statusBadge.textContent = "Funded";
        statusBadge.className = "status-badge status-funded";
    } else {
        statusBadge.textContent = "Released";
        statusBadge.className = "status-badge status-released";
    }

    node.querySelector(".order-amount").textContent = formatGwei(order.amount);

    const counterparty = role === "buyer" ? order.seller : order.buyer;
    const counterpartyEl = node.querySelector(".order-counterparty");
    counterpartyEl.textContent = shortenAddress(counterparty);
    counterpartyEl.title = counterparty;

    node.querySelector(".order-deadline").textContent = formatDeadline(order.deadline);

    const actions = node.querySelector(".card-actions");
    
    if (order.status === 0n) {
        if (role === "buyer") {
            const confirmBtn = document.createElement("button");
            confirmBtn.className = "btn btn-primary btn-sm";
            confirmBtn.textContent = "Confirm Receipt";
            confirmBtn.addEventListener("click", async () => {
                confirmBtn.disabled = true;
                await confirmReceipt(order.id);
                await refreshBuyerView();
            });
            actions.appendChild(confirmBtn);
        }

        if (isTimeoutClaimable(order)) {
            const timeoutBtn = document.createElement("button");
            timeoutBtn.className = "btn btn-ghost btn-sm";
            timeoutBtn.textContent = "Claim timeout";
            timeoutBtn.addEventListener("click", async () => {
                timeoutBtn.disabled = true;
                await claimTimeout(order.id);
                await Promise.all([refreshBuyerView(), refreshSellerView()]);
            });
            actions.appendChild(timeoutBtn);
        }
    }

    return node;
}

// Function to empty 'container' and fill it with the rendered cards or an empty state message
function renderInto(container, items, renderFn, emptyMessage) {
    container.innerHTML = "";
    if (!items.length) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = emptyMessage;
        container.appendChild(p);
        container.dataset.state = "empty";
        return;
    }
    container.dataset.state = "filled";
    items.forEach((item) => container.appendChild(renderFn(item)));
}


// ---------------------------- Refreshing sections ----------------------------

async function refreshWalletBalance() {
    const balanceEl = document.getElementById("walletBalance");
    const connectBtn = document.getElementById("connectMetaMask");
    if (!balanceEl) return;

    if (!currentAccount || !browserProvider) {
        balanceEl.hidden = true;
        connectBtn.hidden = false;
        return;
    }

    const balance = await browserProvider.getBalance(currentAccount);
    const rounded = parseFloat(formatGwei(balance)).toFixed(1);
    balanceEl.textContent = `${rounded} Gwei`;
    balanceEl.hidden = false;
    connectBtn.hidden = true;
}

async function refreshActiveListings() {
    const container = document.getElementById("activeListings");
    try {
        const listings = await fetchActiveListings();
        renderInto(container, listings, (l) => createListingCardElement(l, "buy"), "There are no active posts at the moment.");
    } catch (error) {
        console.error("Error loading posts: ", error);
    }
}

async function refreshMyListings() {
    const container = document.getElementById("myListings");
    if (!currentAccount) {
        renderInto(container, [], () => null, "Connect yout wallet to view your listings.");
        return;
    }

    const listings = await fetchMyListings();
    renderInto(container, listings, (l) => createListingCardElement(l, "sell"), "You haven't published any ads yet.");
}

async function refreshSellerOrders() {
    const container = document.getElementById("sellerOrders");
    if (!currentAccount) {
        renderInto(container, [], () => null, "Connect your wallet to view your your sales orders.");
        return;
    }

    const [orders, listingsMap] = await Promise.all([fetchOrdersAsSeller(), fetchListingsMap()]);
    renderInto(container, orders, (o) => createOrderCardElement(o, "seller", listingsMap), "You haven't received any orders yet.");
}

async function refreshBuyerOrders() {
    const container = document.getElementById("buyerOrders");
    if (!currentAccount) {
        renderInto(container, [], () => null, "Connect your wallet to view your orders.");
        return;
    }

    const [orders, listingsMap] = await Promise.all([fetchOrdersAsBuyer(), fetchListingsMap()]);
    renderInto(container, orders, (o) => createOrderCardElement(o, "buyer", listingsMap), "You haven't placed any orders yet.");
}

async function refreshWithdrawPanel() {
    const amountEl = document.getElementById("withdrawAmount");
    const withdrawButton = document.getElementById("withdrawButton");
    if (!amountEl || !withdrawButton) return;

    if (!currentAccount) {
        amountEl.textContent = "- Gwei";
        withdrawButton.disabled = true;
        return;
    }

    const pending = await fetchPendingWithdrawal();
    amountEl.textContent = formatGwei(pending);
    withdrawButton.disabled = pending === 0n;
}

async function refreshSellerView() {
    await Promise.all([refreshMyListings(), refreshSellerOrders(), refreshWithdrawPanel()]);
}

async function refreshBuyerView() {
    await Promise.all([refreshActiveListings(), refreshBuyerOrders()]);
}

async function onAccountReady(account) {
    await Promise.all([refreshSellerView(), refreshBuyerView(), refreshWalletBalance()]);
}


// ---------------------------- Tabs Navigation ----------------------------

const tabSell = document.getElementById("tabSell");
const tabBuy = document.getElementById("tabBuy");
const viewSell = document.getElementById("viewSell");
const viewBuy = document.getElementById("viewBuy");

function activateTab(tabName) {
    const isSell = tabName === "sell";
    tabSell.classList.toggle("active", isSell);
    tabBuy.classList.toggle("active", !isSell);
    tabSell.setAttribute("aria-selected", String(isSell));
    tabBuy.setAttribute("aria-selected", String(!isSell));
    viewSell.classList.toggle("active", isSell);
    viewBuy.classList.toggle("active", !isSell);
}

if (tabSell && tabBuy) {
    tabSell.addEventListener("click", () => activateTab("sell"));
    tabBuy.addEventListener("click", () => activateTab("buy"));
}


// ---------------------------- Event Listeners ----------------------------

const connectMetaMaskButton = document.getElementById("connectMetaMask");
if (connectMetaMaskButton) {
    connectMetaMaskButton.addEventListener("click", connectMetaMask);
}

const createListingForm = document.getElementById("createListingForm");
if (createListingForm) {
    createListingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const price = document.getElementById("listingPrice").value.trim();
        const metadataRef = document.getElementById("listingMetadata").value.trim();
        if (!price || !metadataRef) return;

        const submitBtn = createListingForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        try {
            await createListing(price, metadataRef);
            createListingForm.reset();
            await refreshSellerView();
        } finally {
            submitBtn.disabled = false;
        }
    });
}

const refreshListingsButton = document.getElementById("refreshListings");
if (refreshListingsButton) {
    refreshListingsButton.addEventListener("click", refreshActiveListings);
}

const withdrawButtonEl = document.getElementById("withdrawButton");
if (withdrawButtonEl) {
    withdrawButtonEl.addEventListener("click", async () => {
        withdrawButtonEl.disabled = true;
        await withdrawFunds();
        await refreshWithdrawPanel();
    });
}

const refreshSellerOrdersButton = document.getElementById("refreshSellerOrders");
if (refreshSellerOrdersButton) {
    refreshSellerOrdersButton.addEventListener("click", refreshSellerOrders);
}

const refreshMyListingsButton = document.getElementById("refreshMyListings");
if (refreshMyListingsButton) {
    refreshMyListingsButton.addEventListener("click", refreshMyListings)
}

const refreshWithdrawPanelButton = document.getElementById("refreshWithdrawPanel");
if (refreshWithdrawPanelButton) {
    refreshWithdrawPanelButton.addEventListener("click", refreshWithdrawPanel);
}

const walletBalanceEl = document.getElementById("walletBalance");
if (walletBalanceEl) {
    walletBalanceEl.addEventListener("click", refreshWalletBalance);
}

// ---------------------------- Initial Loading ----------------------------

const contractAddressDisplay = document.getElementById("contractAddressDisplay");
if (contractAddressDisplay) {
    contractAddressDisplay.textContent = shortenAddress(contractAddress);
    contractAddressDisplay.title = contractAddress;
}

// Active listings are public so we load them at the beginning, before connecting the wallet
refreshActiveListings();