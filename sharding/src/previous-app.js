import { ethers, Interface } from "ethers";
import { createWalletClient, http, createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createNonceManager, jsonRpc } from "viem/nonce";
import { KZG as microEthKZG } from "micro-eth-signer/kzg";
import { trustedSetup } from "@paulmillr/trusted-setups/fast.js";
import { createBlob4844Tx } from "@ethereumjs/tx";
import { Common, Sepolia, Hardfork } from "@ethereumjs/common";
import { bytesToHex, hexToBytes } from "@ethereumjs/util";
import "./polyfills.js";
import EthCrypto from "eth-crypto";

const sendBlobButton = document.getElementById("sendBlob");
const connectMetaMaskButton = document.getElementById("connectMetamask");
const receiverInput = document.getElementById("receiver");
const blobContentInput = document.getElementById("blobContent");
const encryptCheckbox = document.getElementById("encryptMessage");
const privateKeyInput = document.getElementById("privateKeyInput");
const tabSend = document.getElementById("tabSend");
const tabReceive = document.getElementById("tabReceive");
const viewSend = document.getElementById("viewSend");
const viewReceive = document.getElementById("viewReceive");
const viewEventsButton = document.getElementById("viewEvents");
const searchButton = document.getElementById("searchEvents");
const senderInput = document.getElementById("senderFilter");
const receiverFilterInput = document.getElementById("receiverFilter");

// RPC endpoint for the node
const rpcURL =
  "https://eth-sepolia.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

const rpcURL2 =
  "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

const beaconURL =
  "https://eth-sepoliabeacon.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Deployed contract address
const contractAddress = "0x856bBEF8Da0337AF597d2303A764ebd22e9D8613";

// Contract ABI
const abi = [
  "function send_message(address receiver, bytes publicKey)",
  "function publicKeys(address) view returns (bytes)",
];

async function connectMetaMask() {
  try {
    await metamask.send("eth_requestAccounts", []);

    const signer = await metamask.getSigner();
    const account = await signer.getAddress();

    // Write the address into the accountInfo input
    const accountInfoInput = document.getElementById("accountInfo");
    accountInfoInput.value = account;

    console.log("Metamask connected");
  } catch {
    console.error("Error connecting Metamask");
  }
}

const provider = new ethers.JsonRpcProvider(rpcURL);
if (!window.ethereum) {
  alert("Please install MetaMask to use this application.");
}
const metamask = new ethers.BrowserProvider(window.ethereum);

async function getEventLogs(receiverFilter = null, senderFilter = null) {
  const receivedBlobsDiv = document.getElementById("receivedBlobs");
  receivedBlobsDiv.innerHTML =
    '<div id="search-feedback">Searching for messages...</div>';

  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcURL),
  });

  const latestBlock = await client.getBlockNumber();
  const step = 9n; 
  let from = latestBlock > 200n ? latestBlock - 200n : 0n;
  let logs = [];

  while (from <= latestBlock) {
    const to = from + step - 1n > latestBlock ? latestBlock : from + step - 1n;
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
    await new Promise((r) => setTimeout(r, 50));
  }

  // Filter the logs if there is a receiver and/or sender filter
  if (receiverFilter) {
    logs = logs.filter(
      (log) => log.args.receiver.toLowerCase() === receiverFilter.toLowerCase()
    );
  }
  if (senderFilter) {
    logs = logs.filter(
      (log) => log.args.sender.toLowerCase() === senderFilter.toLowerCase()
    );
  }

  receivedBlobsDiv.innerHTML = ""; // Clear previous results

  if (logs.length === 0) {
    receivedBlobsDiv.innerHTML =
      '<div id="search-feedback">No messages found.</div>';
    return;
  }

  for (const log of logs) {
    // Get the parentBeaconBlockRoot from the execution block

    const block = await client.getBlock({ blockNumber: log.blockNumber });
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
      <b>Tx Hash:</b> ${log.transactionHash}<br>
      <b>Block Number:</b> ${log.blockNumber}<br>
      <b>Parent Beacon Block Root:</b> ${parentRoot}<br>
      <button class="show-blobs-btn">View blobs</button>
      <div class="blobs-content"></div>
      <hr>
    `;
    receivedBlobsDiv.appendChild(msgDiv);

    msgDiv
      .querySelector(".show-blobs-btn")
      .addEventListener("click", async () => {
        const contentDiv = msgDiv.querySelector(".blobs-content");
        contentDiv.innerText = "Loading blobs...";

        // 1. Get the transaction
        const tx = await provider.getTransaction(log.transactionHash);
        console.log("Transaction obtained:", tx);
        if (!tx) {
          contentDiv.innerText = "Could not get the transaction.";
          return;
        }
        const blockNumber = tx.blockNumber;
        const blobVersionedHashes = tx.blobVersionedHashes || [];
        console.log("blobVersionedHashes:", blobVersionedHashes);

        // 2. Get the execution block and its parentBeaconBlockRoot
        const block = await client.getBlock({ blockNumber });
        const parentRoot = block.parentBeaconBlockRoot;
        console.log("Block obtained:", block);
        console.log("Parent Beacon Block Root (from the tx):", parentRoot);
        if (!parentRoot) {
          contentDiv.innerText = "Could not get the parentBeaconBlockRoot.";
          return;
        }

        // 3. Get the slot of the parentBeaconBlockRoot
        const url = `${beaconURL}/eth/v2/beacon/blocks/${parentRoot}`;
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          contentDiv.innerText = "Could not get the slot of the parent root.";
          console.log(
            "Error getting the slot of the parent root:",
            response.status
          );
          return;
        }
        const data = await response.json();
        const slot = data.data.message.slot;
        console.log("Slot of the parent root:", slot);
        if (!slot) {
          contentDiv.innerText = "Could not get the slot.";
          return;
        }

        // 4. The blob is in the next slot
        const nextSlot = BigInt(slot) + 1n;
        console.log("Target slot for blobs:", nextSlot.toString());
        const blobUrl = `${beaconURL}/eth/v1/beacon/blob_sidecars/${nextSlot}`;
        const blobResp = await fetch(blobUrl, {
          headers: { accept: "application/json" },
        });
        if (!blobResp.ok) {
          contentDiv.innerText = "Could not get the blob sidecars.";
          console.log("Error getting blob sidecars:", blobResp.status);
          return;
        }
        const blobData = await blobResp.json();
        const blobSidecars = blobData.data || [];
        console.log("Blob sidecars obtained:", blobSidecars);

        // 5. Find the blobs for the transaction
        const blobsForTx = findBlobsForTx(blobSidecars, blobVersionedHashes);
        console.log("Blobs associated with the transaction:", blobsForTx);

        if (!blobsForTx || !blobsForTx.length || blobsForTx.every((b) => !b)) {
          contentDiv.innerText = "No blobs associated with this transaction.";
        } else {
          // Show each blob with the option to decode as UTF-8
          contentDiv.innerHTML = blobsForTx
            .map((blob, idx) => {
              if (!blob) return `<div>Blob ${idx}: Not found</div>`;
              // Decode the blob (hex) to UTF-8
              let decoded = "";
              try {
                const hex = blob.blob.replace(/^0x/, "");
                const bytes = new Uint8Array(
                  hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
                );
                decoded = new TextDecoder("utf-8").decode(bytes);
              } catch (e) {
                decoded = "(Could not decode as UTF-8)";
              }
              // Add the decrypt button
              return `
            <div>
              <b>Blob (message #${log.args.tx_id}):</b>
              <textarea rows="3" cols="60" readonly id="blob-hex-${idx}">${blob.blob}</textarea><br>
              <b>UTF-8:</b> <pre id="blob-encrypted-${idx}">${decoded}</pre>
              <b>Decrypted:</b> <pre id="blob-decoded-${idx}">${decoded}</pre>
              <button class="decrypt-blob-btn" data-blob="${blob.blob}" data-idx="${idx}">Decrypt</button>
            </div>
            <hr>
          `;
            })
            .join("");
        }

        // Add listeners to the decrypt buttons
        contentDiv.querySelectorAll(".decrypt-blob-btn").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            const idx = btn.getAttribute("data-idx");
            const decodedPre = contentDiv.querySelector(`#blob-decoded-${idx}`);
            const encryptedPre = contentDiv.querySelector(
              `#blob-encrypted-${idx}`
            );
            const utf8Cipher = encryptedPre ? encryptedPre.textContent : "";

            const privateKey = privateKeyInput.value.trim();

            // Use EthCrypto to parse and decrypt
            try {
              const encryptedObj = EthCrypto.cipher.parse(utf8Cipher);
              const result = await EthCrypto.decryptWithPrivateKey(
                privateKey,
                encryptedObj
              );
              if (decodedPre) decodedPre.textContent = result;
            } catch (err) {
              console.error("Error decrypting:", err);
              alert("Could not decrypt the message: " + err.message);
            }
          });
        });
      });
  }

  // Search completed feedback
  const feedback = document.createElement("div");
  feedback.id = "search-feedback";
  feedback.textContent =
    "Search completed (" + logs.length + " messages found)";
  receivedBlobsDiv.insertBefore(feedback, receivedBlobsDiv.firstChild);
}

// Given an array of blobs from the block and an array of blobVersionedHashes from the tx

function findBlobsForTx(blobSidecars, blobVersionedHashes) {
  console.log("Comparing blobs and versioned hashes (real EIP-4844)...");
  return blobVersionedHashes.map((versionHash) => {
    return blobSidecars.find((blob) => {
      // Remove the 0x if present
      let kzgCommitment = blob.kzg_commitment.replace(/^0x/, "");
      // Convert to Uint8Array
      let binaryKzg = ethers.getBytes("0x" + kzgCommitment);
      // SHA256 of the commitment
      let hash = ethers.sha256(binaryKzg); // hash is a hex string 0x...
      // Versioned hash: 0x01 + hash without the leading 0x
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

// Function to encrypt the message using the receiver's public key
async function encryptMessageForReceiverEthCrypto(message, receiverPublicKey) {
  // receiverPublicKey must be a hexadecimal string (without 0x)
  const encrypted = await EthCrypto.encryptWithPublicKey(
    receiverPublicKey.replace(/^0x/, ""),
    message
  );
  // Encode the encrypted object as a string to send
  return EthCrypto.cipher.stringify(encrypted);
}

// Function to send a blob to the contract
async function sendBlobToContractViem() {
  const receiver = receiverInput.value;
  const blobContent = String(blobContentInput.value);
  const privateKey = privateKeyInput.value.trim();

  if (!ethers.isAddress(receiver)) {
    alert("Enter a valid Ethereum address.");
    return;
  }
  if (!blobContent) {
    alert("Enter the blob content.");
    return;
  }
  if (!privateKey) {
    alert("Enter the private key.");
    return;
  }

  const contract = new ethers.Contract(contractAddress, abi, provider);
  const receiverPublicKey = await contract.publicKeys(receiver);
  console.log("Receiver Public Key from contract:", receiverPublicKey);

  // If encryption is enabled, encrypt the blob content
  let encryptedBlobContent = blobContent;
  if (
    encryptCheckbox.checked &&
    receiverPublicKey &&
    receiverPublicKey !== "0x"
  ) {
    encryptedBlobContent = await encryptMessageForReceiverEthCrypto(
      blobContent,
      receiverPublicKey
    );
  }
  else encryptedBlobContent = blobContent; // Not encrypted

  // Compute the sender's public key
  const senderPublicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
  console.log("Sender Public Key:", senderPublicKey);
  const compressedSenderPublicKey =
    EthCrypto.publicKey.compress(senderPublicKey);
  console.log("Compressed Sender Public Key:", compressedSenderPublicKey);

  // Encode the function call
  const iface = new Interface(abi);
  const data = iface.encodeFunctionData("send_message", [
    receiver,
    "0x" + senderPublicKey,
  ]);

  // Prepare the KZG and the client
  const kzg = new microEthKZG(trustedSetup);

  const nonceManager = createNonceManager({ source: jsonRpc() });
  const account = privateKeyToAccount(privateKey, { nonceManager });

  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcURL),
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });
  const transactionCount = await publicClient.getTransactionCount({
    address: account.address,
  });
  const common = new Common({
    chain: Sepolia,
    hardfork: Hardfork.Cancun,
    eips: [4844],
    customCrypto: { kzg },
  });
  // Prepare the blob-type transaction
  const txData = {
    chainId: 11155111, // Sepolia
    type: 3,
    to: contractAddress,
    data: data, // encoded call
    kzg: kzg,
    value: 0,
    gasLimit: 800000, // Extra gas margin
    maxFeePerGas: 10 ** 11,
    maxPriorityFeePerGas: 10 ** 11,
    maxFeePerBlobGas: 10 ** 11,
    blobsData: [encryptedBlobContent],
    nonce: transactionCount,
  };

  const pk = hexToBytes(privateKey);
  const tx = createBlob4844Tx(txData, { common });
  console.log("Transaction prepared:", tx);
  const signedTx = tx.sign(pk);
  console.log("Transaction signed:", signedTx);
  const serialized = signedTx.serializeNetworkWrapper();
  console.log("Transaction serialized:", bytesToHex(serialized));

  try {
    const hash = await client.sendRawTransaction({
      serializedTransaction: bytesToHex(serialized),
    });
    console.log("tx hash: " + hash);
    alert("Transaction sent: " + hash);
  } catch (error) {
    console.error("Error sending the transaction:", error);
    alert("Error sending the transaction: " + error.message);
  }
}

function hexToBase64(hexString) {
  // Remove the 0x if present
  hexString = hexString.replace(/^0x/, "");
  // Convert to a byte array
  const bytes = new Uint8Array(
    hexString.match(/.{1,2}/g).map((b) => parseInt(b, 16))
  );
  // Convert to base64 using btoa
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// event listeners

sendBlobButton.addEventListener("click", async () => {
  await sendBlobToContractViem();
});

connectMetaMaskButton.addEventListener("click", async () => {
  connectMetaMask();
});

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

viewEventsButton.addEventListener("click", async () => {
  // No filters: show all messages
  await getEventLogs();
});

searchButton.addEventListener("click", () => {
  const senderValue = senderInput.value.trim();
  const receiverValue = receiverFilterInput.value.trim();
  if (senderValue || receiverValue) {
    getEventLogs(receiverValue || null, senderValue || null);
  } else {
    getEventLogs();
  }
});