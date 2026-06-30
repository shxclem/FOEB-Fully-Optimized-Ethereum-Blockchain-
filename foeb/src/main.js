// IMPORTING ALL THE LIBRARIES THAT WE'LL NEED FOR THE WHOLE PROJECT
import { ethers } from "ethers";
import { loadKZG } from "kzg-wasm";
import EthCrypto from "eth-crypto";
import "./polyfills.js";

// DEFINING THE CONSTANTS THAT WILL BE NECESSARY FOR THE REST OF THE CODE
// URL of the Chainstack node to read the blobkchain
const rpcURL = "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

// Address of the deployed smart contract on the Sepolia testnet
const contractAddress = "0x4933bd80C1172c1D52C08b079de20A492C51D0AE";

// ABI of the deployed smart contract on the Sepolia testnet
const abi = [
  "function send_message(address receiver, bytes publicKey)",
  "function publicKeys(address) view returns (bytes)",
];

// Sepolia chain ID
const sepoliaChainID = 11155111;

// REFERENCES TO HTML ELEMENTS THAT WILL BE USED TO INTERACT WITH THE USER
// Buttons
const sendBlobButton = document.getElementById("sendBlob");
const connectMetaMaskButton = document.getElementById("connectMetaMask");
const viewEventsButton = document.getElementById("viewEvents");
const searchButton = document.getElementById("searchEvents");

// Input fields
const receiverInput = document.getElementById("receiver");
const blobContentInput = document.getElementById("blobContent");
const privateKeyInput = document.getElementById("privateKeyInput");
const senderInput = document.getElementById("senderFilter");
const receiverFilterInput = document.getElementById("receiverFilter");

// Checkboxes and tabs
const encryptCheckbox = document.getElementById("encryptMessage");
const tabSend = document.getElementById("tabSend");
const tabReceive = document.getElementById("tabReceive");
const viewSend = document.getElementById("viewSend");
const viewReceive = document.getElementById("viewReceive");


// INITIALIZING THE PROVIDER AND SIGNER FOR INTERACTING WITH THE ETHEREUM NETWORK
// Provider on read-only mode to interact with blobkchain without wallet connection
const provider = new ethers.JsonRpcProvider(rpcURL);

// Check if MetaMask is installed
if (!window.ethereum) {
  alert("MetaMask is not installed. Please install it to use this app.");
}

// MetaMask provider for interacting with the user's wallet
const metamask = new ethers.BrowserProvider(window.ethereum);


// Function to connect to MetaMask and get the user's account address
async function connectMetaMask() {
  try {
    // Request account access if needed
    await metamask.send("eth_requestAccounts", []);

    // Get the signer from MetaMask
    const signer = await metamask.getSigner();

    // Get the user's address
    const account = await signer.getAddress();

    // Display the connected account address in the input field
    const accountInfoInput = document.getElementById("accountInfo");
    accountInfoInput.value = account;

    console.log("Connected to MetaMask with account:", account);

  } catch (error) {
    console.error("Error connecting to MetaMask:", error);
  }
}


// Function to retrieve and display all NewTx events emitted by the contract
async function getEventLogs(receiverFilter = null, senderFilter = null) {
  const receivedBlobsDiv = document.getElementById("receivedBlobs");

  // Display loading message while searching
  receivedBlobsDiv.innerHTML =
    '<div id="search-feedback">Searching for messages...</div>';

  // Build the contract interface for log decoding
  const iface = new ethers.Interface(abi);

  // Event topic for NewTx(uint256 indexed, address indexed, address indexed)
  const newTxTopic = ethers.id("NewTx(uint256,address,address)");

  // Scan the latest blocks in small batches
  const latestBlock = await provider.getBlockNumber();
  const step = 100;
  let from = latestBlock > 1500 ? latestBlock - 1500 : 0;
  let logs = [];

  // Retrieve all NewTx events
  while (from <= latestBlock) {
    const to = Math.min(from + step, latestBlock);

    const partialLogs = await provider.getLogs({
      address: contractAddress,
      topics: [newTxTopic],
      fromBlock: from,
      toBlock: to,
    });

    logs = logs.concat(partialLogs);
    from = to + 1;
  }

  // Decode and optionnaly pply optional sender/receiver filters on logs
  const decodedLogs = logs.map((log) => {
    const parsed = iface.parseLog(log);
    return {
        raw: log,
        tx_id: parsed.args[0],
        sender: parsed.args[1],
        receiver: parsed.args[2],
    };
  });
  
  const filtered = decodedLogs.filter((entry) => {
    if (receiverFilter && entrey.receiver.toLowerCase() !== receiverFilter.toLowerCase()) return false;
    if (senderFilter && entry.sender.toLowerCase() !== senderFilter.toLowerCase()) return false;
    return true;
  });

  // Clear previous search results
  receivedBlobsDiv.innerHTML = "";

  if (filtered.length === 0) {
    receivedBlobsDiv.innerHTML =
      '<div id="search-feedback">No messages found.</div>';
    return;
  }

  // Display every event found
  for (const entry of filtered) {
    const log = entry.raw;

    // Retrieve the execution block associated with the event
    const block = await provider.getBlock(log.blockNumber);
    const parentRoot = block.parentBeaconBlockRoot;

    console.log("Log:", log);
    console.log("Block Number:", log.blockNumber);
    console.log("Parent Beacon Block Root:", parentRoot);

    const msgDiv = document.createElement("div");
    msgDiv.className = "event-log";
    msgDiv.innerHTML = `
      <b>TxID:</b> ${log.args.tx_id}<br>
      <b>Sender:</b> ${log.args.sender}<br>
      <b>Receiver:</b> ${log.args.receiver}<br>
      <b>Transaction Hash:</b> ${log.transactionHash}<br>
      <b>Block Number:</b> ${log.blockNumber}<br>
      <b>Parent Beacon Block Root:</b> ${parentRoot}<br>

      <button class="show-blobs-btn">Show blobs</button>

      <div class="blobs-content"></div>
      <hr>
    `;

    receivedBlobsDiv.appendChild(msgDiv);

    // Load blobs only when the user clicks the button
    msgDiv.querySelector(".show-blobs-btn").addEventListener("click", async () => {

        const contentDiv = msgDiv.querySelector(".blobs-content");
        contentDiv.innerText = "Loading blobs...";

        // Retrieve the blob transaction
        const tx = await provider.getTransaction(log.transactionHash);

        if (!tx) {
          contentDiv.innerText = "Unable to retrieve the transaction.";
          return;
        }

        const blockNumber = tx.blockNumber;
        const blobVersionedHashes = tx.blobVersionedHashes || [];

        // Retrieve the execution block
        const txBlock = await provider.getBlock(blockNumber);
        const txParentRoot = txBlock.parentBeaconBlockRoot;

        if (!txParentRoot) {
          contentDiv.innerText = "Unable to retrieve the parent beacon block root.";
          return;
        }

        // Retrieve the beacon slot corresponding to the parent root
        const response = await fetch(
          `${rpcURL}/eth/v2/beacon/blocks/${txParentRoot}`,
          {
            headers: {
              accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          contentDiv.innerText = "Unable to retrieve beacon slot.";
          return;
        }

        const data = await response.json();
        const slot = data.data.message.slot;

        if (!slot) {
          contentDiv.innerText = "Beacon slot not found.";
          return;
        }

        // Blob sidecars are stored in the following slot
        const nextSlot = BigInt(slot) + 1n;

        const blobResp = await fetch(
          `${rpcURL}/eth/v1/beacon/blob_sidecars/${nextSlot}`,
          {
            headers: {
              accept: "application/json",
            },
          }
        );

        if (!blobResp.ok) {
          contentDiv.innerText = "Unable to retrieve blob sidecars.";
          return;
        }

        const blobData = await blobResp.json();
        const blobSidecars = blobData.data || [];

        // Match blobs with the current transaction
        const blobsForTx = findBlobsForTx(blobSidecars, blobVersionedHashes);

        if (!blobsForTx.length || blobsForTx.every((b) => !b)) {
          contentDiv.innerText = "No blobs associated with this transaction.";
          return;
        }

        // Display each blob
        contentDiv.innerHTML = blobsForTx
          .map((blob, idx) => {

            if (!blob) return `<div>Blob ${idx}: Not found</div>`;

            let decoded = "";
            try {
              const hex = blob.blob.replace(/^0x/, "");
              const bytes = new Uint8Array(
                hex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
              );

              decoded = new TextDecoder("utf-8").decode(bytes);

            } catch {
              decoded = "(Unable to decode as UTF-8)";
            }

            return `
              <div>
                <b>Blob ${idx}</b><br>

                <textarea rows="3" cols="60" readonly id="blob-hex-${idx}">${blob.blob}</textarea>

                <br>

                <b>UTF-8:</b>
                <pre id="blob-encrypted-${idx}">${decoded}</pre>
                <b>Decrypted:</b>
                <pre id="blob-decoded-${idx}">${decoded}</pre>
                <button class="decrypt-blob-btn" data-blob="${blob.blob}" data-idx="${idx}">
                  Decrypt
                </button>
              </div>

              <hr>
            `;
          })
          .join("");

        // Attach listeners to every decrypt button
        contentDiv.querySelectorAll(".decrypt-blob-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const idx = btn.getAttribute("data-idx");
              const encrypted = contentDiv.querySelector(`#blob-encrypted-${idx}`).textContent;
              const output = contentDiv.querySelector(`#blob-decoded-${idx}`);

              try {
                const encryptedObj = EthCrypto.cipher.parse(encrypted);
                const decrypted = await EthCrypto.decryptWithPrivateKey(
                    privateKeyInput.value.trim(),
                    encryptedObj
                  );

                output.textContent = decrypted;

              } catch (err) {
                alert("Unable to decrypt the message: " + err.message);
              }
            });
          });
      });
    }

  // Display search summary
  const feedback = document.createElement("div");
  feedback.id = "search-feedback";
  feedback.textContent = `Search completed (${logs.length} message(s) found)`;
  receivedBlobsDiv.insertBefore(feedback, receivedBlobsDiv.firstChild);
}


// Function to send the blob content to the smart contract using Viem and EIP-4844
async function sendBlobToContract() {

  // Collecting the values from the input fields
  const receiver = receiverInput.value;
  const blobContent = String(blobContentInput.value);
  const privateKey = privateKeyInput.value.trim();

  // Verifications before consuming gas and sending the transaction
  if (!ethers.isAddress(receiver)) {
    alert("Invalid receiver address. Please enter a valid Ethereum address.");
    return;
  }
  if (!blobContent) {
    alert("Blob content cannot be empty. Please enter some content.");
    return;
  }
  if (!privateKey) {
    alert("Private key cannot be empty. Please enter your private key.");
    return;
  }

  // If the encrypt checkbox is checked, we will encrypt the blob content using the receiver's public key
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const receiverPublicKey = await contract.publicKeys(receiver);
  console.log("Receiver's public key:", receiverPublicKey);

  let encryptedBlobContent = blobContent; // Default to the original blob content if not encrypting
  if (encryptCheckbox.checked && receiverPublicKey && receiverPublicKey !== "0x") {
    // Encrypt the blob content using the receiver's public key
    encryptedBlobContent = await encryptMessageForReceiverEthCrypto(
      blobContent,
      receiverPublicKey
    );
  }

  // Computing the public key of the sender from the private key using EthCrypto
  const senderPublicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
  console.log("Sender's public key:", senderPublicKey);

  // Encoding the contract call to send_message 
  const iface = new ethers.Interface(abi);
  const data = iface.encodeFunctionData("send_message", [
    receiver,
    "0x" + senderPublicKey, // sender's public key in bytes format
  ]);

  // Initialize KZG with kzg-wasm which embeds its own trusted setup
  const kzg = await loadKZG();

  // Create the wallet from the private key
  const wallet = new ethers.Wallet(privateKey, provider);

  // Get the current nonce
  const nonce = await provider.getTransactionCount(wallet.address);

  // Get current fee data for EIP-1559 base fee
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(10 ** 11); // Default to 100 gwei if not available
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(10 ** 11); // Default to 100 gwei if not available
  const maxFeePerBlobGas = BigInt(10 ** 11); // Default to 100 gwei for blob gas

  // Encode the blob content as bytes and pad to the required 4096 * 32 bytes for EIP-4844
  const BLOB_SIZE = 131072; // 4096 * 32 bytes
  const contentBytes = new TextEncoder().encode(encryptedBlobContent);
  const blobBytes = new Uint8Array(BLOB_SIZE);
  blobBytes.set(contentBytes.slice(0, BLOB_SIZE)); // Trim if too long

  // Convert blob bytes to hex string
  const blobHex = 
    "0x" + 
    Array.from(blobBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  
  // Compute the KZG commitment and proof for the blob
  const commitment = kzg.blobToKZGCommitment(blobHex);
  const { proofs: cellProofs } = kzg.computeCellsAndKZGProofs(blobHex);
  
  console.log("Blob commitment: ", commitment);
  console.log("Number of cell proofs: ", cellProofs.length);

  // Build and sign the EIP-4844 type 3 transaction manually
  const tx = ethers.Transaction.from({
    type: 3,
    chainId: sepoliaChainID,
    to: contractAddress,
    data: data,
    value: 0,
    nonce: nonce,
    gasLimit: 800000,
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
    maxFeePerBlobGas: maxFeePerBlobGas,
    blobWrapperVersion: 1,
    kzg: kzg,
    blobs: [blobHex],
    // blobs: [{
    //     data: blobHex,
    //     commitment: commitment,
    //     proof: cellProofs,
    // }],
  });
  console.log("UNSIGNED", tx.unsignedSerialized.length, tx.unsignedSerialized.slice(0, 20));

  // Sign the transaction
  const signedTx = await wallet.signTransaction(tx);
  
  console.log("SIGNED", signedTx.length, signedTx.slice(0, 20));
  console.log("Signed transaction: ", signedTx);

  // Send the signed transaction to the network
  try {
    const txResponse = await provider.broadcastTransaction(signedTx);
    console.log("Transaction sent successfully. Hash: ", txResponse.hash);
    alert("Transaction sent successfully. Hash: " + txReponse.hash);
  } catch (error) {
    console.error("Error sending transaction: ", error);
    alert("Error sending transaction: " + error.message);
  }
}


// Function to encrypt the message by using the receiver's public key with EthCrypto
async function encryptMessageForReceiverEthCrypto(message, receiverPublicKey) {
  const encrypted = await EthCrypto.encryptWithPublicKey(
    receiverPublicKey.replace(/^0x/, ""),
    message 
  );

  // Return the encrypted message as a string
  return EthCrypto.cipher.stringify(encrypted);
}


// Function to find the corresponding blobs for the given versioned hashes (EIP-4844)
function findBlobsForTx(blobSidecars, blobVersionedHashes) {
  console.log("Comparing blobs and versioned hashes (EIP-4844)...");
  return blobVersionedHashes.map((versionHash) => {
    return blobSidecars.find((blob) => {

      const kzgCommitment = blob.kzg_commitment.replace(/^0x/, "");
      const binaryKzg = ethers.getBytes("0x" + kzgCommitment);
      const hash = ethers.sha256(binaryKzg);
      const modifiedHash = "0x01" + hash.slice(4);

      console.log(
        "Comparing",
        versionHash,
        "with",
        modifiedHash,
        "for commitment",
        blob.kzg_commitment
      );

      return versionHash.toLowerCase() === modifiedHash.toLowerCase();
    });
  });
}


// EVENT LISTENERS
// Send the blob transaction when the "Send Blob" button is clicked
sendBlobButton.addEventListener("click", async () => {
  await sendBlobToContract();
});

// Connect the user's MetaMask wallet when the "Connect MetaMask" button is clicked
connectMetaMaskButton.addEventListener("click", async () => {
  connectMetaMask();
});

// Switch between the "Send" and "Receive" tabs
tabSend.addEventListener("click", () => {
  tabSend.classList.add("active");
  tabReceive.classList.remove("active");
  viewSend.classList.add("active");
  viewReceive.classList.remove("active");
});

tabReceive.addEventListener("click", () => {
  tabReceive.classList.add("active");
  tabSend.classList.remove("active");
  viewReceive.classList.add("active");
  viewSend.classList.remove("active");
});

// Display every message stored by the contract
viewEventsButton.addEventListener("click", async () => {
  await getEventLogs();
});

// Search for messages based on sender and/or receiver filters
searchButton.addEventListener("click", () => {
  const senderValue = senderInput.value.trim();
  const receiverValue = receiverFilterInput.value.trim();
  getEventLogs(receiverValue || null, senderValue || null);
});