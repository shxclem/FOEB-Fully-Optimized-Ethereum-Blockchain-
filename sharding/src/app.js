// ---------------------------- Imports ----------------------------

import { ethers } from "ethers";
import { createWalletClient, http, createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createNonceManager, jsonRpc } from "viem/nonce";
import { KZG as microEthKZG } from "micro-eth-signer/advanced/kzg.js";
import { trustedSetup } from "@paulmillr/trusted-setups/fast-kzg.js";
import { createBlob4844Tx } from "@ethereumjs/tx";
import { Common, Sepolia, Hardfork } from "@ethereumjs/common";
import { bytesToHex, hexToBytes } from "@ethereumjs/util";
import EthCrypto from "eth-crypto";


// ---------------------------- Configuration ----------------------------

// read-only RPC endpoint to browse listings even if the user is not connected to a wallet
const rpcURL =
    "https://eth-sepolia.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Beacon API endpoint (consensus layer), separate from the execution-layer RPC above
const beaconURL =
    "https://eth-sepoliabeacon.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Address of the smart contract 'EscrowManager' deployed on Sepolia
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

// contentType values used for the two blob-carrying content flows
const CONTENT_TYPE_FULL_DESCRIPTION = "full_description";
const CONTENT_TYPE_DELIVERY_ADDRESS = "delivery_address";


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


// ---------------------------- EIP-4844 blob pipeline ----------------------------

// This is the actual data-carrying mechanism: sendContent() above only
// emits an on-chain pointer (ContentSent event). The real payload (the
// full item description, or the buyer's delivery address) travels
// separately, inside an EIP-4844 blob attached to a type-3 transaction
// that ALSO calls sendContent() with the matching (receiver, contentType)

// Browser wallets (MetaMask included) cannot sign blob transactions as of
// today, so this part is signed manually with a raw private key, entered
// by the user just for this action — everything else in the app keeps
// using MetaMask normally.

// Function to find which sidecars belong to a transaction given blob sidecars of a beacon slot and blobVersionedHashes of a transaction
function findBlobsForTx(blobSidecars, blobVersionedHashes) {
    return blobVersionedHashes.map((versionHash) => {
        return blobSidecars.find((blob) => {
            const kzgCommitment = blob.kzg_commitment.replace(/^0x/, "");
            const binaryKzg = ethers.getBytes("0x" + kzgCommitment);
            const hash = ethers.sha256(binaryKzg);
            const modifiedHash = "0x01" + hash.slice(4);
            return versionHash.toLowerCase() === modifiedHash.toLowerCase();
        });
    });
}

// Function to build, sign and broadcast a type-3 transaction that calls sendConten() as a single EIP-4844 blob. Returns the transaction hash on success, null on failure
async function sendContentBlob(receiver, contentType, text, privateKeyHex, encrypt) {
    if (!ethers.isAddress(receiver)) {
        alert("Wrong receiver's address.");
        return null;
    }

    if (!privateKeyHex) {
        alert("Please provide a private key to sign the blob transaction.");
        return null;
    }

    if (!text) {
        alert("Please provide some text to send.");
        return null;
    }

    let payload = text;
    if (encrypt) {
        const receiverPublicKey = await fetchPublicKey(receiver);
        if (!receiverPublicKey || receiverPublicKey === "0x") {
            alert("The receiver hasn't registered a public key yet: content cannot be encrypted for them.");
            return null;
        }

        try {
            const encrypted = await EthCrypto.encryptWithPublicKey(receiverPublicKey.replace(/^0x/, ""), text);
            payload = EthCrypto.cipher.stringify(encrypted);
        } catch (error) {
            console.error("Error encrypting content: ", error);
            alert("Error encrypting content: " + error.message);
            return null;
        }
    }

    try {
        const iface = new ethers.Interface(abi);
        const data = iface.encodeFunctionData("sendContent", [receiver, contentType]);

        const kzg = new microEthKZG(trustedSetup);

        const nonceManager = createNonceManager({ source: jsonRpc() });
        const account = privateKeyToAccount(privateKeyHex, { nonceManager });

        const client = createWalletClient({ 
            account, 
            chain: sepolia,
            transport: http(rpcURL)
        });

        const publicClient = createPublicClient({
            chain: sepolia,
            transport: http(rpcURL)
        });

        const transactionCount = await publicClient.getTransactionCount({ address: account.address });

        const common = new Common({
            chain: Sepolia, 
            hardfork: Hardfork.Cancun,
            eips: [4844],
            customCrypto: { kzg }
        });

        const txData = {
            chainId: 11155111,
            type: 3,
            to: contractAddress,
            data,
            kzg,
            value: 0,
            gasLimit: 800000,
            maxFeePerGas: 10 ** 11,
            maxPriorityFeePerGas: 10 ** 11,
            maxFeePerBlobGas: 10 ** 11,
            blobsData: [payload],
            nonce: transactionCount
        };

        const pk = hexToBytes(privateKeyHex);
        const tx = createBlob4844Tx(txData, { common });
        const signedTx = tx.sign(pk);
        const serialized = signedTx.serializeNetworkWrapper();

        const hash = await client.sendRawTransaction({
            serializedTransaction: bytesToHex(serialized),
        });
        console.log("Content blob sent, tx hash: ", hash);
        return hash;
    } catch (error) {
        console.error("Error sending content blob: ", error);
        alert("Error sending content blob: " + error.message);
        return null;
    }
}

// Function to read the content of a blob transaction given its hash. If decrypt is true, the content will be decrypted using the provided private key.
async function readContentBlob(txHash, { decrypt = false, privateKeyHex = null } = {}) {
    const tx = await readProvider.getTransaction(txHash);
    
    if (!tx) {
        throw new Error("Transaction not found");
    }

    const blobVersionedHashes = tx.blobVersionedHashes || [];
    if (!blobVersionedHashes.length) {
        throw new Error("Transaction does not carry any blob");
    }

    const block = await readProvider.getBlock(tx.blockNumber);
    const parentRoot = block?.parentBeaconBlockRoot;
    if (!parentRoot) {
        throw new Error("Couldn't resolve the parent beacon block root.");
    }

    const blockResp = await fetch(`${beaconURL}/eth/v2/beacon/blocks/${parentRoot}`, {
        headers: { accept: "application/json" },
    });
    if (!blockResp.ok) {
        throw new Error("Couldn't resolve the beacon slot");
    };

    const blockData = await blockResp.json();
    const slot = blockData.data.message.slot;

    const nextSlot = BigInt(slot) + 1n;
    const sidecarResp = await fetch(`${beaconURL}/eth/v1/beacon/blob_sidecars/${nextSlot}`, {
        headers: { accept: "application/json" },
    });
    if (!sidecarResp.ok) {
        throw new Error("Couldn't fetch blob sidecars.");
    }

    const sidecarData = await sidecarResp.json();
    const blobSidecars = sidecarData.data || [];

    const blobsForTx = findBlobsForTx(blobSidecars, blobVersionedHashes);
    const blob = blobsForTx[0];
    if(!blob) {
        throw new Error("Couldn't find the blob for this transaction. It may have expired since there is a ~18 days retention.");
    }

    const hex = blob.blob.replace(/^0x/, "");
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

    let decoded = new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "");
    if (decrypt) {
        if (!privateKeyHex) {
            throw new Error("A private key is required to decrypt the content.");
        }

        const encryptedObj = EthCrypto.cipher.parse(decoded);
        decoded = await EthCrypto.decryptWithPrivateKey(privateKeyHex, encryptedObj);
    }

    return decoded;
}


// ---------------------------- Local reference storage (txHash lookup) ----------------------------

// Our contract has no getContent(id) view function: content can only be
// rediscovered through the ContentSent event (which would require
// eth_getLogs) or by keeping the tx hash somewhere. For this first version
// we simply keep it in localStorage, scoped to the sender's own browser.

// KNOWN LIMITATION: this means the full_description (meant to be public,
// readable by any buyer) and the delivery_address (meant to be read by the
// seller) are only auto-discoverable in the browser that SENT them. Any
// other party needs the tx hash shared manually — the "paste a tx hash"
// fallback fields in the UI below exist specifically for this reason.

function contentStorageKey(scope, id, contentType) {
    return `content:${scope}:${id}:${contentType}`;
}

function saveContentReference(scope, id, contentType, txHash) {
    try {
        localStorage.setItem(contentStorageKey(scope, id, contentType), txHash);
    } catch (error) {
        console.error("Error saving content reference to localStorage: ", error);
    }
}

function getContentReference(scope, id, contentType) {
    try {
        return localStorage.getItem(contentStorageKey(scope, id, contentType));
    } catch (error) {
        console.error("Error getting content reference from localStorage: ", error);
        return null;
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

// Function to build the "View full description" block for a listing card
// It reads the blob from localStorage if available, otherwise from a manually pasted txhash
function buildDescriptionContentSection(listing) {
    const wrapper = document.createElement("div");
    wrapper.className = "content-section";
    wrapper.style.gridColumn = "1 / -1";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = "Full description:";
    wrapper.appendChild(label);

    const savedRef = getContentReference("listing", listing.id.toString(), CONTENT_TYPE_FULL_DESCRIPTION);

    const resultEl = document.createElement("p");
    resultEl.className = "content-result";
    resultEl.hidden = true;
    wrapper.appendChild(resultEl);

    const row = document.createElement("div");
    row.className = "card-actions";

    const hashInput = document.createElement("input");
    hashInput.type = "text";
    hashInput.className = "mono content-hash-input";
    hashInput.placeholder = savedRef ? "" : "Paste description tx hash (if shared by seller)";

    if (savedRef) {
        hashInput.value = savedRef;
        hashInput.readOnly = true;
    }
    row.appendChild(hashInput);

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-ghost btn-sm";
    viewBtn.textContent = "View description";
    viewBtn.addEventListener("click", async () => {
        const txHash = hashInput.value.trim();
        if (!txHash) {
            alert("No tx hash available yet for this listing's description.");
            return;
        }
        viewBtn.disabled = true;
        resultEl.hidden = true;
        try {
            const text = await readContentBlob(txHash, {});
            resultEl.textContent = text;
            resultEl.hidden = false;
        } catch (error) {
            console.error("Error reading description blob:", error);
            alert("Error reading description: " + error.message);
        } finally {
            viewBtn.disabled = false;
        }
    });
    row.appendChild(viewBtn);
 
    wrapper.appendChild(row);

    return wrapper;
}

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

    const contentSection = node.querySelector(".content-section");
    if (contentSection) {
        contentSection.replaceWith(buildDescriptionContentSection(listing));
    }

    return node;
}

// Function to build the delivery-address block for a buyer's order card
function buildDeliveryAddressSendSection(order) {
    const wrapper = document.createElement("div");
    wrapper.className = "content-section";
    wrapper.style.gridColumn = "1 / -1";
 
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = "Delivery address (sent encrypted to the seller)";
    wrapper.appendChild(label);
 
    const alreadySent = getContentReference("order", order.id.toString(), CONTENT_TYPE_DELIVERY_ADDRESS);
    if (alreadySent) {
        const note = document.createElement("p");
        note.className = "content-result";
        note.textContent = `Already sent — tx: ${shortenAddress(alreadySent)}`;
        wrapper.appendChild(note);
    }
 
    const addressInput = document.createElement("textarea");
    addressInput.rows = 2;
    addressInput.placeholder = "Full name, street, city, postal code, country";
    wrapper.appendChild(addressInput);
 
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.className = "mono";
    keyInput.placeholder = "Signing key for the blob transaction (testnet only)";
    wrapper.appendChild(keyInput);
 
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "btn btn-primary btn-sm";
    sendBtn.textContent = alreadySent ? "Send again" : "Send delivery address";
    sendBtn.addEventListener("click", async () => {
        const address = addressInput.value.trim();
        const key = keyInput.value.trim();
        if (!address || !key) {
            alert("Both the delivery address and the signing key are required.");
            return;
        }
        sendBtn.disabled = true;
        try {
            const txHash = await sendContentBlob(
                order.seller,
                CONTENT_TYPE_DELIVERY_ADDRESS,
                address,
                key,
                true // always encrypted
            );
            if (txHash) {
                saveContentReference("order", order.id.toString(), CONTENT_TYPE_DELIVERY_ADDRESS, txHash);
                alert("Delivery address sent (encrypted) — tx: " + txHash);
                await refreshBuyerView();
            }
        } finally {
            sendBtn.disabled = false;
        }
    });
    wrapper.appendChild(sendBtn);
 
    return wrapper;
}

// Function to build the delivery-address block for a seller's order card
function buildDeliveryAddressReadSection(order) {
    const wrapper = document.createElement("div");
    wrapper.className = "content-section";
    wrapper.style.gridColumn = "1 / -1";
 
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = "Buyer's delivery address";
    wrapper.appendChild(label);
 
    const savedRef = getContentReference("order", order.id.toString(), CONTENT_TYPE_DELIVERY_ADDRESS);
 
    const resultEl = document.createElement("p");
    resultEl.className = "content-result";
    resultEl.hidden = true;
    wrapper.appendChild(resultEl);
 
    const hashInput = document.createElement("input");
    hashInput.type = "text";
    hashInput.className = "mono";
    hashInput.placeholder = "Paste the tx hash shared by the buyer";
    if (savedRef) hashInput.value = savedRef;
    wrapper.appendChild(hashInput);
 
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.className = "mono";
    keyInput.placeholder = "Your private key (needed to decrypt)";
    wrapper.appendChild(keyInput);
 
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-ghost btn-sm";
    viewBtn.textContent = "Decrypt & view";
    viewBtn.addEventListener("click", async () => {
        const txHash = hashInput.value.trim();
        const key = keyInput.value.trim();
        if (!txHash || !key) {
            alert("Both the tx hash and your private key are required.");
            return;
        }
        viewBtn.disabled = true;
        resultEl.hidden = true;
        try {
            const text = await readContentBlob(txHash, { decrypt: true, privateKeyHex: key });
            resultEl.textContent = text;
            resultEl.hidden = false;
        } catch (error) {
            console.error("Error reading delivery address blob:", error);
            alert("Error reading delivery address: " + error.message);
        } finally {
            viewBtn.disabled = false;
        }
    });
    wrapper.appendChild(viewBtn);
 
    return wrapper;
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

// TODO : add a form for the full description
const createListingForm = document.getElementById("createListingForm");
if (createListingForm) {
    createListingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const price = document.getElementById("listingPrice").value.trim();
        const metadataRef = document.getElementById("listingMetadata").value.trim();
        const fullDescription = document.getElementById("listingFullDescription").value.trim();
        const blobKey = document.getElementById("listingBlobKey").value.trim();
        if (!price || !metadataRef || !fullDescription || !blobKey) return;

        const submitBtn = createListingForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        try {
            const listingId = await createListing(price, metadataRef);
            if (listingId === null || listingId === undefined) return;

            const txHash = await SendContentBlob(
                currentAccount,
                CONTENT_TYPE_FULL_DESCRIPTION,
                fullDescription,
                blobKey,
                false // meant to be public
            );

            if (txHash) {
                saveContentReference("listing", listingId.toString(), CONTENT_TYPE_FULL_DESCRIPTION, txHash);
                console.log("Full description sent, tx hash: ", txHash);
            }

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