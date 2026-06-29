// IMPORTING ALL THE LIBRARIES THAT WE'LL NEED FOR THE WHOLE PROJECT
import { ethers, Interface } from "ethers";
import { createWalletClient, http, createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createNonceManager, jsonRpc } from "viem/nonce";
import { KZG as microEthKZG } from "micro-eth-signer/kzg";
import { trustedSetup } from "@paulmillr/trusted-setups/fast-kzg.js";
import { createBlob4844Tx } from "@ethereumjs/tx";
import { Common, Sepolia, Hardfork } from "@ethereumjs/common";
import { bytesToHex, hexToBytes } from "@ethereumjs/util";
import "./polyfills.js";
import EthCrypto from "eth-crypto";


// DEFINING THE CONSTANTS THAT WILL BE NECESSARY FOR THE REST OF THE CODE
// URL of the Chainstack node to read the blobkchain
const rpcURL = "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

// URL of the second Chainstack node for getLogs with Viem
const rpcURL2 = "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

// Address of the deployed smart contract on the Sepolia testnet
const contractAddress = "0x4933bd80C1172c1D52C08b079de20A492C51D0AE";

// ABI of the deployed smart contract on the Sepolia testnet
const abi = [
  "function send_message(address receiver, bytes publicKey)",
  "function publicKeys(address) view returns (bytes)",
];


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

  // Public client used to read blockchain data
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcURL2),
  });

  // Scan the latest blocks in small batches
  const latestBlock = await client.getBlockNumber();
  const step = 100n;
  let from = latestBlock > 1500n ? latestBlock - 1500n : 0n;
  let logs = [];

  // Retrieve all NewTx events
  while (from <= latestBlock) {
    const to = from + step > latestBlock ? latestBlock : from + step;

    const partialLogs = await client.getLogs({
      address: contractAddress,

      event: {
        type: "event",
        name: "NewTx",
        inputs: [
          { indexed: true, name: "tx_id", type: "uint256" },
          { indexed: true, name: "sender", type: "address" },
          { indexed: true, name: "receiver", type: "address" },
        ],
      },

      fromBlock: from,
      toBlock: to,
    });

    logs = logs.concat(partialLogs);
    from = to + 1n;
  }

  // Apply optional sender/receiver filters
  if (receiverFilter) {
    logs = logs.filter(
      (log) =>
        log.args.receiver.toLowerCase() === receiverFilter.toLowerCase()
    );
  }

  if (senderFilter) {
    logs = logs.filter(
      (log) =>
        log.args.sender.toLowerCase() === senderFilter.toLowerCase()
    );
  }

  // Clear previous search results
  receivedBlobsDiv.innerHTML = "";

  if (logs.length === 0) {
    receivedBlobsDiv.innerHTML =
      '<div id="search-feedback">No messages found.</div>';
    return;
  }

  // Display every event found
  for (const log of logs) {

    // Retrieve the execution block associated with the event
    const block = await client.getBlock({
      blockNumber: log.blockNumber,
    });

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
    msgDiv.querySelector(".show-blobs-btn").addEventListener(
      "click",
      async () => {

        const contentDiv = msgDiv.querySelector(".blobs-content");
        contentDiv.innerText = "Loading blobs...";

        // Retrieve the blob transaction
        const tx = await provider.getTransaction(
          log.transactionHash
        );

        if (!tx) {
          contentDiv.innerText =
            "Unable to retrieve the transaction.";
          return;
        }

        const blockNumber = tx.blockNumber;
        const blobVersionedHashes =
          tx.blobVersionedHashes || [];

        // Retrieve the execution block
        const block = await client.getBlock({
          blockNumber,
        });

        const parentRoot =
          block.parentBeaconBlockRoot;

        if (!parentRoot) {
          contentDiv.innerText =
            "Unable to retrieve the parent beacon block root.";
          return;
        }

        // Retrieve the beacon slot corresponding to the parent root
        const response = await fetch(
          `${rpcURL}/eth/v2/beacon/blocks/${parentRoot}`,
          {
            headers: {
              accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          contentDiv.innerText =
            "Unable to retrieve beacon slot.";
          return;
        }

        const data = await response.json();
        const slot = data.data.message.slot;

        if (!slot) {
          contentDiv.innerText =
            "Beacon slot not found.";
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
          contentDiv.innerText =
            "Unable to retrieve blob sidecars.";
          return;
        }

        const blobData = await blobResp.json();

        const blobSidecars = blobData.data || [];

        // Match blobs with the current transaction
        const blobsForTx = findBlobsForTx(
          blobSidecars,
          blobVersionedHashes
        );

        if (
          !blobsForTx.length ||
          blobsForTx.every((b) => !b)
        ) {
          contentDiv.innerText =
            "No blobs associated with this transaction.";
          return;
        }

        // Display each blob
        contentDiv.innerHTML = blobsForTx
          .map((blob, idx) => {

            if (!blob)
              return `<div>Blob ${idx}: Not found</div>`;

            let decoded = "";

            try {
              const hex = blob.blob.replace(/^0x/, "");

              const bytes = new Uint8Array(
                hex.match(/.{1,2}/g)
                  .map((b) => parseInt(b, 16))
              );

              decoded = new TextDecoder("utf-8")
                .decode(bytes);

            } catch {

              decoded =
                "(Unable to decode as UTF-8)";
            }

            return `
              <div>

                <b>Blob ${idx}</b><br>

                <textarea
                  rows="3"
                  cols="60"
                  readonly
                  id="blob-hex-${idx}"
                >${blob.blob}</textarea>

                <br>

                <b>UTF-8:</b>

                <pre id="blob-encrypted-${idx}">${decoded}</pre>

                <b>Decrypted:</b>

                <pre id="blob-decoded-${idx}">${decoded}</pre>

                <button
                  class="decrypt-blob-btn"
                  data-blob="${blob.blob}"
                  data-idx="${idx}"
                >
                  Decrypt
                </button>

              </div>

              <hr>
            `;
          })
          .join("");

        // Attach listeners to every decrypt button
        contentDiv.querySelectorAll(".decrypt-blob-btn")
          .forEach((btn) => {

            btn.addEventListener("click", async () => {

              const idx = btn.getAttribute("data-idx");

              const encrypted =
                contentDiv.querySelector(
                  `#blob-encrypted-${idx}`
                ).textContent;

              const output =
                contentDiv.querySelector(
                  `#blob-decoded-${idx}`
                );

              try {

                const encryptedObj =
                  EthCrypto.cipher.parse(encrypted);

                const decrypted =
                  await EthCrypto.decryptWithPrivateKey(
                    privateKeyInput.value.trim(),
                    encryptedObj
                  );

                output.textContent = decrypted;

              } catch (err) {

                alert(
                  "Unable to decrypt the message: " +
                  err.message
                );

              }
            });

          });

      }
    );
  }

  // Display search summary
  const feedback = document.createElement("div");

  feedback.id = "search-feedback";

  feedback.textContent =
    `Search completed (${logs.length} message(s) found)`;

  receivedBlobsDiv.insertBefore(
    feedback,
    receivedBlobsDiv.firstChild
  );
}


// Function to send the blob content to the smart contract using Viem and EIP-4844
async function sendBlobToContractViem() {

  // COllecting the values from the input fields
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

  // Encoding the contract call to send_message with the receiver's address and the sender's public key 
  const iface = new Interface(abi);
  const data = iface.encodeFunctionData("send_message", [
    receiver,
    "0x" + senderPublicKey, // sender's public key in bytes format
  ]);

  // Preparing KZG parameters 
  const kzg = new microEthKZG(trustedSetup);

  // Creating Viem account through private key and nonce manager
  const nonceManager = createNonceManager({ source: jsonRpc() });
  const account = privateKeyToAccount(privateKey, { nonceManager });

  // Viem client for sending the transaction to the Sepolia testnet
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcURL),
  });

  // Viem public client for reading the actual nonce of the account and other read-only operations
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const transactionCount = await publicClient.getTransactionCount({
    address: account.address,
  });

  // Constructing, signing, and sending the transaction to the Sepolia testnet
  const common = new Common({
    chain: Sepolia,
    hardfork: Hardfork.Cancun,
    eips: [4844],
    customCrypto: { kzg },
  });

  const txData = {
    chainId: 11155111, // Sepolia chain ID
    type: 3, // EIP-4844 transaction type
    to: contractAddress, // destination address (the smart contract)
    data: data, // encoded function call data
    kzg: kzg, // KZG parameters for EIP-4844
    value: 0, // no Ether is being sent, only the function call
    gasLimit: 800000, // gas limit for the transaction
    maxFeePerGas: 10 ** 11, // maximum fee per gas, 100 gwei
    maxPriorityFeePerGas: 10 ** 11, // tip for the miner, 100 gwei
    maxFeePerBlobGas: 10 ** 11, // blobs' specific fees
    blobsData: [encryptedBlobContent], // the actual blob data to be sent
    nonce: transactionCount, // the nonce for the account
  };

  // Converting the private key to bytes format
  const pk = hexToBytes(privateKey);

  // Creating the blob transaction
  const tx = createBlob4844Tx(txData, { common });

  // Signing the transaction with the sender's private key
  const signedTx = tx.sign(pk);

  // Serializing the signed transaction to a hex string
  const serialized = signedTx.serialize();

  console.log ("Serialized transaction:", bytesToHex(serialized));

  // Sending the signed transaction to the Sepolia testnet
  try {
    const hash = await client.sendRawTransaction({
      serializedTransaction: bytesToHex(serialized),
    });
    console.log("Transaction sent successfully. Hash:", hash);
    alert("Transaction sent successfully. Hash: " + hash);
  } catch (error) {
    console.error("Error sending transaction:", error);
    alert("Error sending transaction: " + error.message);
  }
}


// Function to encrypt the message by using the receiver's public key with EthCrypto
async function encryptMessageForReceiverEthCrypto(message, receiverPublicKey) {
  // receiverPublicKey is expected to be in hex format (0x-prefixed)
  const encrypted = await EthCrypto.encryptWithPublicKey(
    receiverPublicKey.replace(/^0x/, ""),
    message 
  );

  // Return the encrypted message as a string
  return EthCrypto.cipher.stringify(encrypted);
}


// Function to convert a hex string to a base64 string
function hexToBase64(hexString) {
  // Remove the "0x" prefix if present
  hexString = hexString.replace(/^0x/, "");

  // Convert the hex string to a Uint8Array
  const bytes = new Uint8Array(
    hexString.match(/.{1,2}/g).map((b) => parseInt(b, 16))
  );

  // Convert the Uint8Array to a base64 string using btoa
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}


// Function to find the corresponding blobs for the given versioned hashes (EIP-4844)
function findBlobsForTx(blobSidecars, blobVersionedHashes) {
  console.log("Comparing blobs and versioned hashes (EIP-4844)...");
  return blobVersionedHashes.map((versionHash) => {
    return blobSidecars.find((blob) => {
      // Remove the "0x" prefix if present
      let kzgCommitment = blob.kzg_commitment.replace(/^0x/, "");

      // Convert the kzg_commitment to Uint8Array
      let binaryKzg = ethers.getBytes("0x" + kzgCommitment);
      
      // SHA256 hash of the binary KZG commitment
      let hash = ethers.sha256(binaryKzg);

      // Versioned hash: 0x01 + hash without the first 4 characters (0x)
      let modifiedHash = "0x01" + hash.slice(4);
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
  await sendBlobToContractViem();
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

  if (senderValue || receiverValue) {
    getEventLogs(receiverValue || null, senderValue || null);
  } else {
    getEventLogs();
  }
});