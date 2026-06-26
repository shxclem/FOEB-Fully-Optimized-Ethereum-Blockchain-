// Importing all the libraries that we'll need for the whole project
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

// Defining the constants that will be necessary for the rest of the code
const rpcURL = "https://ethereum-sepolia.core.chainstack.com/0b0b2788df50f6248f517d0e4f6bd23d";

const contractAddress = "0x4933bd80C1172c1D52C08b079de20A492C51D0AE";

const abi = [
  "function send_message(address receiver, bytes publicKey)",
  "function publicKeys(address) view returns (bytes)",
];