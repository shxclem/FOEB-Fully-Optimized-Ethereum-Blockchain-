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

// Punto de acceso RPC al nodo
const rpcURL =
  "https://eth-sepolia.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

const rpcURL2 =
  "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

const beaconURL =
  "https://eth-sepoliabeacon.g.alchemy.com/v2/MAqI1ftDOuHcQYDb0vdi3";

// Dirección del contrato desplegado
const contractAddress = "0x856bBEF8Da0337AF597d2303A764ebd22e9D8613";

// ABI del contrato
const abi = [
  "function send_message(address receiver, bytes publicKey)",
  "function publicKeys(address) view returns (bytes)",
];

async function connectMetaMask() {
  try {
    await metamask.send("eth_requestAccounts", []);

    const signer = await metamask.getSigner();
    const account = await signer.getAddress();

    // Escribir la dirección en el input de accountInfo
    const accountInfoInput = document.getElementById("accountInfo");
    accountInfoInput.value = account;

    console.log("Metamask conectado");
  } catch {
    console.error("Error al conectar metamask");
  }
}

const provider = new ethers.JsonRpcProvider(rpcURL);
if (!window.ethereum) {
  alert("Por favor, instala MetaMask para usar esta aplicación.");
}
const metamask = new ethers.BrowserProvider(window.ethereum);

async function getEventLogs(receiverFilter = null, senderFilter = null) {
  const receivedBlobsDiv = document.getElementById("receivedBlobs");
  receivedBlobsDiv.innerHTML =
    '<div id="search-feedback">Buscando mensajes...</div>';

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

  // Filtra los logs si hay filtro de receiver y/o sender
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

  receivedBlobsDiv.innerHTML = ""; // Limpia resultados previos

  if (logs.length === 0) {
    receivedBlobsDiv.innerHTML =
      '<div id="search-feedback">No se encontraron mensajes.</div>';
    return;
  }

  for (const log of logs) {
    // Obtén el parentBeaconBlockRoot del bloque de ejecución

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
      <button class="show-blobs-btn">Ver blobs</button>
      <div class="blobs-content"></div>
      <hr>
    `;
    receivedBlobsDiv.appendChild(msgDiv);

    msgDiv
      .querySelector(".show-blobs-btn")
      .addEventListener("click", async () => {
        const contentDiv = msgDiv.querySelector(".blobs-content");
        contentDiv.innerText = "Cargando blobs...";

        // 1. Obtén la transacción
        const tx = await provider.getTransaction(log.transactionHash);
        console.log("Transacción obtenida:", tx);
        if (!tx) {
          contentDiv.innerText = "No se pudo obtener la transacción.";
          return;
        }
        const blockNumber = tx.blockNumber;
        const blobVersionedHashes = tx.blobVersionedHashes || [];
        console.log("blobVersionedHashes:", blobVersionedHashes);

        // 2. Obtén el bloque de ejecución y su parentBeaconBlockRoot
        const block = await client.getBlock({ blockNumber });
        const parentRoot = block.parentBeaconBlockRoot;
        console.log("Block obtenido:", block);
        console.log("Parent Beacon Block Root (de la tx):", parentRoot);
        if (!parentRoot) {
          contentDiv.innerText = "No se pudo obtener el parentBeaconBlockRoot.";
          return;
        }

        // 3. Obtén el slot del parentBeaconBlockRoot
        const url = `${beaconURL}/eth/v2/beacon/blocks/${parentRoot}`;
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          contentDiv.innerText = "No se pudo obtener el slot del parent root.";
          console.log(
            "Error al obtener el slot del parent root:",
            response.status
          );
          return;
        }
        const data = await response.json();
        const slot = data.data.message.slot;
        console.log("Slot del parent root:", slot);
        if (!slot) {
          contentDiv.innerText = "No se pudo obtener el slot.";
          return;
        }

        // 4. El blob está en el siguiente slot
        const nextSlot = BigInt(slot) + 1n;
        console.log("Slot objetivo para blobs:", nextSlot.toString());
        const blobUrl = `${beaconURL}/eth/v1/beacon/blob_sidecars/${nextSlot}`;
        const blobResp = await fetch(blobUrl, {
          headers: { accept: "application/json" },
        });
        if (!blobResp.ok) {
          contentDiv.innerText = "No se pudo obtener los blob sidecars.";
          console.log("Error al obtener blob sidecars:", blobResp.status);
          return;
        }
        const blobData = await blobResp.json();
        const blobSidecars = blobData.data || [];
        console.log("Blob sidecars obtenidos:", blobSidecars);

        // 5. Busca los blobs de la transacción
        const blobsForTx = findBlobsForTx(blobSidecars, blobVersionedHashes);
        console.log("Blobs asociados a la transacción:", blobsForTx);

        if (!blobsForTx || !blobsForTx.length || blobsForTx.every((b) => !b)) {
          contentDiv.innerText = "No hay blobs asociados a esta transacción.";
        } else {
          // Mostrar cada blob con opción de decodificar como UTF-8
          contentDiv.innerHTML = blobsForTx
            .map((blob, idx) => {
              if (!blob) return `<div>Blob ${idx}: No encontrado</div>`;
              // Decodifica el blob (hex) a UTF-8
              let decoded = "";
              try {
                const hex = blob.blob.replace(/^0x/, "");
                const bytes = new Uint8Array(
                  hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
                );
                decoded = new TextDecoder("utf-8").decode(bytes);
              } catch (e) {
                decoded = "(No se pudo decodificar como UTF-8)";
              }
              // Añade el botón de desencriptar
              return `
            <div>
              <b>Blob ${idx}:</b><br>
              <textarea rows="3" cols="60" readonly id="blob-hex-${idx}">${blob.blob}</textarea><br>
              <b>UTF-8:</b> <pre id="blob-encrypted-${idx}">${decoded}</pre>
              <b>Descifrado:</b> <pre id="blob-decoded-${idx}">${decoded}</pre>
              <button class="decrypt-blob-btn" data-blob="${blob.blob}" data-idx="${idx}">Desencriptar</button>
            </div>
            <hr>
          `;
            })
            .join("");
        }

        // Añade listeners a los botones de desencriptar
        contentDiv.querySelectorAll(".decrypt-blob-btn").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            const idx = btn.getAttribute("data-idx");
            const decodedPre = contentDiv.querySelector(`#blob-decoded-${idx}`);
            const encryptedPre = contentDiv.querySelector(
              `#blob-encrypted-${idx}`
            );
            const utf8Cipher = encryptedPre ? encryptedPre.textContent : "";

            const privateKey = privateKeyInput.value.trim();

            // Usa EthCrypto para parsear y desencriptar
            try {
              const encryptedObj = EthCrypto.cipher.parse(utf8Cipher);
              const result = await EthCrypto.decryptWithPrivateKey(
                privateKey,
                encryptedObj
              );
              if (decodedPre) decodedPre.textContent = result;
            } catch (err) {
              console.error("Error al desencriptar:", err);
              alert("No se pudo desencriptar el mensaje: " + err.message);
            }
          });
        });
      });
  }

  // Feedback de búsqueda completada
  const feedback = document.createElement("div");
  feedback.id = "search-feedback";
  feedback.textContent =
    "Búsqueda completada (" + logs.length + " mensajes encontrados)";
  receivedBlobsDiv.insertBefore(feedback, receivedBlobsDiv.firstChild);
}

// Dado un array de blobs del bloque y un array de blobVersionedHashes de la tx

function findBlobsForTx(blobSidecars, blobVersionedHashes) {
  console.log("Comparando blobs y versioned hashes (EIP-4844 real)...");
  return blobVersionedHashes.map((versionHash) => {
    return blobSidecars.find((blob) => {
      // Quita el 0x si lo tiene
      let kzgCommitment = blob.kzg_commitment.replace(/^0x/, "");
      // Convierte a Uint8Array
      let binaryKzg = ethers.getBytes("0x" + kzgCommitment);
      // SHA256 del commitment
      let hash = ethers.sha256(binaryKzg); // hash es un hex string 0x...
      // Versioned hash: 0x01 + hash sin el 0x inicial
      let modifiedHash = "0x01" + hash.slice(4);
      console.log(
        "Comparando",
        versionHash,
        "con",
        modifiedHash,
        "para commitment",
        blob.kzg_commitment
      );
      return versionHash.toLowerCase() === modifiedHash.toLowerCase();
    });
  });
}

// Función para encriptar el mensaje usando la clave pública del receptor
async function encryptMessageForReceiverEthCrypto(message, receiverPublicKey) {
  // receiverPublicKey debe ser un string hexadecimal (sin 0x)
  const encrypted = await EthCrypto.encryptWithPublicKey(
    receiverPublicKey.replace(/^0x/, ""),
    message
  );
  // Codifica el objeto encriptado como string para enviar
  return EthCrypto.cipher.stringify(encrypted);
}

// Función para enviar blob a contrato
async function sendBlobToContractViem() {
  const receiver = receiverInput.value;
  const blobContent = String(blobContentInput.value);
  const privateKey = privateKeyInput.value.trim();

  if (!ethers.isAddress(receiver)) {
    alert("Introduce una dirección válida de Ethereum.");
    return;
  }
  if (!blobContent) {
    alert("Introduce el contenido del blob.");
    return;
  }
  if (!privateKey) {
    alert("Introduce la clave privada.");
    return;
  }

  const contract = new ethers.Contract(contractAddress, abi, provider);
  const receiverPublicKey = await contract.publicKeys(receiver);
  console.log("Receiver Public Key from contract:", receiverPublicKey);

  // Si está activada la encriptación, encripta el contenido del blob
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
  else encryptedBlobContent = blobContent; // No encriptado

  // Calcula la clave pública del emisor
  const senderPublicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
  console.log("Sender Public Key:", senderPublicKey);
  const compressedSenderPublicKey =
    EthCrypto.publicKey.compress(senderPublicKey);
  console.log("Compressed Sender Public Key:", compressedSenderPublicKey);

  // Codifica la llamada a la función
  const iface = new Interface(abi);
  const data = iface.encodeFunctionData("send_message", [
    receiver,
    "0x" + senderPublicKey,
  ]);

  // Prepara el KZG y el cliente
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
  // Prepara la transacción tipo blob
  const txData = {
    chainId: 11155111, // Sepolia
    type: 3,
    to: contractAddress,
    data: data, // llamada codificada
    kzg: kzg,
    value: 0,
    gasLimit: 800000, // Gas de sobra
    maxFeePerGas: 10 ** 11,
    maxPriorityFeePerGas: 10 ** 11,
    maxFeePerBlobGas: 10 ** 11,
    blobsData: [encryptedBlobContent],
    nonce: transactionCount,
  };

  const pk = hexToBytes(privateKey);
  const tx = createBlob4844Tx(txData, { common });
  console.log("Transacción preparada:", tx);
  const signedTx = tx.sign(pk);
  console.log("Transacción firmada:", signedTx);
  const serialized = signedTx.serializeNetworkWrapper();
  console.log("Transacción serializada:", bytesToHex(serialized));

  try {
    const hash = await client.sendRawTransaction({
      serializedTransaction: bytesToHex(serialized),
    });
    console.log("tx hash: " + hash);
    alert("Transacción enviada: " + hash);
  } catch (error) {
    console.error("Error al enviar la transacción:", error);
    alert("Error al enviar la transacción: " + error.message);
  }
}

function hexToBase64(hexString) {
  // Quita el 0x si lo tiene
  hexString = hexString.replace(/^0x/, "");
  // Convierte a array de bytes
  const bytes = new Uint8Array(
    hexString.match(/.{1,2}/g).map((b) => parseInt(b, 16))
  );
  // Convierte a base64 usando btoa
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
  // Sin filtros: muestra todos los mensajes
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
