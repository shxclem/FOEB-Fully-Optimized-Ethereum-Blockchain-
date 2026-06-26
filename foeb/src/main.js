// IMPORTING ALL THE LIBRARIES THAT WE'LL NEED FOR THE WHOLE PROJECT
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
const provider = new ethers.providers.JsonRpcProvider(rpcURL);

// Check if MetaMask is installed
if (!window.ethereum) {
  alert("MetaMask is not installed. Please install it to use this app.");
}

// MetaMask provider for interacting with the user's wallet
const metamask = new ethers.BrowserProvider(window.ethereum);


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
  const serialized = signedTx.serializeNetworkWrapper();

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

