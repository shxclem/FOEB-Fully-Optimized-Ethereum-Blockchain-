import { writeFileSync } from "node:fs";
import { KZG } from "micro-eth-signer/kzg.js";
import { trustedSetup } from "@paulmillr/trusted-setups/fast-peerdas.js";
import { getBlobs, bytesToHex } from "@ethereumjs/util";

const kzg = new KZG(trustedSetup);
const toHex = (b) => (typeof b === "string" ? b : bytesToHex(b));

// Longueurs en octets, volontairement non multiples de 31
const cases = { small: 200, full: 126000 };

// Texte déterministe de n caractères ASCII
function makePayload(n) {
    const alphabet = "0123456789abcdef";
    return Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join("");
}

const fixtures = Object.entries(cases).map(([name, size]) => {
    const payload = makePayload(size);
    const blobs = getBlobs(payload);
    const blobHex = toHex(blobs[0]);
    const commitment = kzg.blobToKzgCommitment(blobHex);

    return { name, payloadBytes: size, blob: blobHex, commitment: toHex(commitment) };
});

writeFileSync("fixtures.json", JSON.stringify(fixtures, null, 2));
console.log(fixtures.map((f) => `${f.name}: ${f.payloadBytes} octets, commitment ${f.commitment.slice(0, 18)}…`).join("\n"));