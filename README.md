# FOEB (Fully Optimized Ethereum Blockchain)

## Context

This repository contains the complete body of a research project carried out by Clément DURÉCU during a five-month internship at DVHE (De Vinci Higher Education), supervised by researcher-lecturer Kenza RIAHI.


## Origin of the project

This repository builds, on the one hand, on an in-depth review of articles and various data on the progress and current state of Ethereum, and on the other hand on the project _tfg-ethereum-sharding_ by Marco Antonio Prieto Aradra.

The original project is available here:
> https://github.com/marcoapr11/tfg-ethereum-sharding

The original project is an encrypted messaging DApp that takes advantage of the sharding introduced in Ethereum through blobs (EIP-4844 / EIP-7594). Instead of storing message contents in the calldata of a regular transaction, which is a costly and permanent operation, it encodes them in a blob attached to a type-3 transaction, the smart contract only emitting an event that serves as a pointer to that blob.

As the reference work was developed more than nine months ago, the goal of this project was, beyond modifying many aspects to fit our needs, to deliberately emphasize the most recent compatible technologies of the Ethereum ecosystem available today.

Components inherited from the original project:
  • Blob (type 3) transactions in the EIP-4844 format, with an architecture ready for the move to EIP-7594 (PeerDAS / cell proofs); this project now uses the EIP-7594 format
  • KZG proof generation through an official trusted setup
  • viem client (nonce management, wallet client, public client) combined with @ethereumjs/tx for low-level construction and signing of blob transactions
  • Direct queries to the Beacon API (consensus layer) to retrieve blob sidecars, in addition to the usual JSON-RPC calls to the execution layer
  • ECIES encryption (eth-crypto) of the content, with on-chain registration of public keys


## Objective of this project

The final program developed in this repository is not a messenger but an item-selling application based on an escrow mechanism, with:
  • Seller and buyer interfaces to send transactions and to validate the shipping / reception of the item
  • On-chain escrow mechanism: the buyer's funds are locked in the smart contract until a defined condition is met (here, the confirmation of reception), and are then released to the seller

The operation of the original project, in particular its use of blobs to carry data outside the calldata, its event-based contract structure and its RPC architecture, serves as a technical and pedagogical basis that was adapted and extended to meet the specific needs of the application.

The application also serves as a test bench to compare the cost of publishing data in the contract (calldata / storage) with publishing it in blobs, in terms of gas and latency (see [Measurements](#measurements)).


## Features

**Seller**
  • Create a listing: the price (in Gwei) and the title are sent to the contract, the full description is sent in a blob
  • Cancel an active listing
  • Read the buyer's encrypted delivery address (decrypted locally with the seller's private key)
  • Claim the funds after the timeout if the buyer never confirms reception, then withdraw them (pull-payment)
  • Public key registration, done automatically the first time a listing is created

**Buyer**
  • Browse the active listings and read their full description from the blob
  • Buy an item: the payment is locked in the contract
  • Send the delivery address, encrypted for the seller, in a blob
  • Confirm reception, which releases the funds to the seller (the button appears once the address has been sent)


## How it works

### Smart contract

`EscrowManager.sol` (Solidity, deployed on Sepolia) manages the financial side of the application:
  • **Listings**: `id`, `seller`, `price`, `metadataRef` (the title) and an `active` flag
  • **Orders**: created by `buy()`, in the `Funded` state with a deadline 15 days later, then `Released` after `confirmReceipt()` or `claimTimeout()`
  • **Withdrawals**: the released amounts accumulate in `pendingWithdrawals` and are withdrawn with `withdraw()` (pull-payment pattern)
  • **Public keys**: `registerPublicKey()` stores one public key per address, used to encrypt content for that user
  • **Content pointers**: `sendContent(receiver, contentType, relatedId)` records the block number of the calling transaction under `keccak256(relatedId, contentType)` and emits `ContentSent`. The two content types are `full_description` (related to a listing) and `delivery_address` (related to an order)

No arbitration or dispute resolution is implemented: users are assumed to behave correctly.

### Creating a listing

Creating a listing involves two transactions, plus a third one the first time a seller uses the application:
  1. `createListing()`, signed with MetaMask: the price and the title are stored in the contract
  2. `registerPublicKey()`, only if the seller has no registered public key yet. The key is derived locally from the signing key entered in the form
  3. A blob transaction calling `sendContent()`: the full description travels in the blob, and the contract records the block number of this transaction so that the blob can be found later

### Blob transactions

MetaMask cannot sign type-3 transactions, so blob transactions are built, signed and broadcast directly by the front-end with a private key entered by the user (see [Security notes](#security-notes-and-limitations)). The pipeline is:
  1. If the content is private (delivery address), it is encrypted with the receiver's registered public key (ECIES)
  2. The payload is framed: an 8-character hexadecimal length header followed by the content encoded in hexadecimal. The hexadecimal encoding guarantees that every 32-byte field element of the blob stays a valid BLS12-381 scalar, whatever the content
  3. The payload is packed into a blob, then the KZG commitment and the per-cell KZG proofs (EIP-7594) are computed
  4. The transaction is signed, serialized together with its blob, commitment and proofs, and broadcast through a dedicated RPC endpoint

A blob carries about 63,000 characters of text with this encoding, and each transaction carries a single blob.

### Reading content back

  1. `getContentBlock()` returns the block in which the content was sent; the front-end scans this block to find the matching `sendContent()` transaction
  2. The `parentBeaconBlockRoot` of the execution block gives the parent beacon block; the following slots are scanned until the block whose `parent_root` matches is found
  3. The blob sidecars of that slot are fetched from the Beacon API, and the right one is identified through its KZG commitment and the transaction's versioned hash
  4. The blob is unpacked, the header is read, the content is decoded from hexadecimal and, if needed, decrypted

Consensus nodes only keep blobs for about 18 days: older descriptions and delivery addresses can no longer be read.


## Tech stack

| Domain | Technology |
|---|---|
| Smart contract | Solidity |
| Frontend | JavaScript (Vite) |
| Blockchain interaction | [viem](https://viem.sh/), [ethers.js](https://docs.ethers.org/) |
| Wallet | MetaMask |
| Blob transactions (EIP-4844 / EIP-7594) | [@ethereumjs/tx](https://github.com/ethereumjs/ethereumjs-monorepo), [@ethereumjs/common](https://github.com/ethereumjs/ethereumjs-monorepo) |
| KZG proofs | [micro-eth-signer](https://github.com/paulmillr/micro-eth-signer), [@paulmillr/trusted-setups](https://github.com/paulmillr/trusted-setups) |
| Encryption | [eth-crypto](https://github.com/pubkey/eth-crypto) (ECIES) |
| Network | Ethereum Sepolia (testnet) |


## Installation and launch

```bash
npm install
npm run dev
```

Before launching the application, you must fill in the `Configuration` section of `src/app.js`:
- `rpcURL`: the RPC URL of the execution layer from your node provider (reads, and Sepolia network registration in MetaMask)
- `beaconURL`: the URL of the Beacon API (consensus layer), which can be identical to the previous one or not depending on the provider
- `blobSendRpcURL`: the RPC URL used to read the nonce and broadcast blob transactions
- `contractAddress`: the address of the smart contract deployed on Sepolia

Do not commit API keys: keep them out of the repository, for instance in a `.env` file read through `import.meta.env.VITE_*` variables (Vite).

You also need MetaMask and some Sepolia ETH. The application asks MetaMask to switch to (or add) the Sepolia network when connecting.


## Measurements

The front-end embeds a small instrumentation layer used to compare calldata and blobs. Every step is timed with the browser clock (`performance.now()`) and the gas figures are read from the transaction receipts. The data is kept in memory (it is lost when the page is reloaded), so export it before closing the page, for example with `copy(JSON.stringify(metrics))` in the browser console.

Console helpers:
  • `startNewRun()`: starts a new run, to keep repeated measurements separated
  • `printMetricsTable(runId)`: prints the steps of a run as a table
  • `averageDuration(label)`, `averageGasUsed(label)` and `statsFor(label, field)`: average, standard deviation, minimum and maximum across all the recorded runs

Recorded steps:
  • `createListing:submit`, `:confirm`, `:gas`, `:payloadSize`
  • `blobTx:fetchNonce`, `:payloadSize`, `:buildAndKzg`, `:sign`, `:serialize`, `:broadcast`, `:confirm`, `:gas`
  • `readBlob:*`: the steps of reading a blob back (transaction, block, beacon slot resolution, sidecar download, decoding, decryption)
  • `diag:packBlobs`, `diag:commitment`, `diag:cellProofs`: diagnostic measurements that re-run the sub-steps of `buildAndKzg` in isolation. They duplicate that work and add about two seconds to each blob transaction: remove them for normal use

Two things to keep in mind when reading the results:
  • The `submit` step of MetaMask transactions includes the user's interaction with the wallet
  • The measurement campaign took place right after the Glamsterdam upgrade reached Sepolia (6 October 2026), which substantially increased the gas cost of creating new storage slots (EIP-8037). Gas figures measured before and after that date are not comparable


## Security notes and limitations

  • **Testnet only.** The signing key of blob transactions and the private key used to decrypt delivery addresses are typed into the page. Never use a key that holds real funds
  • The signing key entered in the forms must belong to the account connected in MetaMask: the public key derived from it is registered on-chain for that account
  • A single blob per transaction: content must fit in about 63,000 characters
  • Blob content is only retained for about 18 days, whereas the title and the escrow data stay in the contract state
  • No dispute resolution: the escrow only covers confirmation of reception and the timeout
