# FOEB-Fully-Optimized-Ethereum-Blockchain

## Contexte
Ce dépôt constitue l'ensemble d'un travail de recherche réalisé par Clément DURÉCU dans le cadre d'un stage de cinq mois qui s'est déroulé à la DVHE (De Vinci Higher Education) et encadré par l'enseignant-chercheur Kenza RIAHI.


## Origine du projet
Ce dépôt s'appuie d'une part sur une recherche approfondie d'articles et de donnéees diverses qui a permis de découvrir les avancées et l'état actuel d'Ethereum, puis, d'autre part, sur le projet _tfg-ethereum-sharding_ réalisé par Marco Antonio Prieto Aradra. 

Ci-dessous le dépôt contenant le projet étudié :
> https://github.com/marcoapr11/tfg-ethereum-sharding

Le projet original propose une DApp de messagerie chiffrée qui exploite le sharding introduit par Ethereum via les blobs (EIP-4844 / EIP-7594). Au lieu de stocker le contenu des messages dans le calldata d'une transaction classique, ce qui constitue une opération coûteuse et permanente, il l'encode dans un blob attaché à une transaction de type 3, le Smart Contract se contenant alors d'émettre un évènement servant de pointeur vers ce blob.

Le travail nous servant de référence ayant été développé il y a plus de 9 mois, l'idée de ce projet-ci était ainsi, au-delà de modifier de nombreux aspects pour qu'il corresponde à nos attentes, de mettre volontairement l'accent sur l'utilisation des techonologies les plus récentes et compatibles de l'écosystème Ethereum disponibles à ce jour. 
Concernant les composants du projet initial, on retrouve :
  • Transactions blob (type 3) au format EIP-4844 avec une architecture prête pour l'évolution vers EIP-7594 (PeerDAS / cell proofs)
  • Génération de preuves KZG via un trusted setup officiel
  • Client viem (nonce management, wallet client, public client) combiné à @ethereumjs/tx pour la construction et la signature bas niveau des transactions blob
  • Interrogation directe de l'API Beacon (couche consensus) pour la récupération des blob sidecars, en complément des appels JSON-RPC classiques de la couche d'exécution
  • Chiffrement ECIES (eth-crypto) pour le contenu des messages avec enregistrement on-chain des clés publiques


## Objectif de ce projet
Le programme final développé dans ce dépôt n'est pas une messagerie, mais plutôt une application de vente d'objets fonctionnant par escrow avec :
  • Interfaces vendeur et acheteur pour envoyer les transactions et valider envoi / réception de l'objet
  • Mécanisme d'escrow on-chain : les fonds de l'acheteur sont bloqués dans le Smart Contract jusqu'à ce qu'une condition définie soit remplie (ici, la confirmation de réception), avant d'être libérés au vendeur.

Le fonctionnement du projet original, en particulier son usage des blobs pour transporter des données hors du calldata, la structure de contrat basée sur des évènements et l'architecture RPC, sert de base technique et pédagogique qui a été adaptée et étendue pour répondre aux besoins spécifiques de l'application.


## Stack technique
 
| Domaine | Technologie |
|---|---|
| Smart contract | Solidity |
| Frontend | JavaScript (Vite) |
| Interaction blockchain | [viem](https://viem.sh/), [ethers.js](https://docs.ethers.org/) |
| Transactions blob (EIP-4844) | [@ethereumjs/tx](https://github.com/ethereumjs/ethereumjs-monorepo), [@ethereumjs/common](https://github.com/ethereumjs/ethereumjs-monorepo) |
| Preuves KZG | [micro-eth-signer](https://github.com/paulmillr/micro-eth-signer), [@paulmillr/trusted-setups](https://github.com/paulmillr/trusted-setups) |
| Chiffrement | [eth-crypto](https://github.com/pubkey/eth-crypto) (ECIES) |
| Réseau | Ethereum Sepolia (testnet) |


## Installation et lancement
 
```bash
npm install
npm run dev
```

Avant de lancer l'application, il est primordial de renseigner dans le code :
- l'URL RPC de la couche d'exécution (execution layer) du fournisseur de nœud
- l'URL de l'API Beacon (couche consensus), qui peut être identique ou différente de la précédente selon le fournisseur choisi
- l'adresse du smart contract déployé sur Sepolia
