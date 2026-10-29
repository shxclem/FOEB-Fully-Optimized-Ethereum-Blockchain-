import { readFileSync } from "node:fs";
import { KZG } from "micro-eth-signer/kzg.js";
import { trustedSetup } from "@paulmillr/trusted-setups/fast-peerdas.js";
import { bytesToHex } from "@ethereumjs/util";

const WARMUP = 3;
const RUNS_COMMIT = 30;
const RUNS_PROOFS = 20;

const toHex = (b) => (typeof b === "string" ? b : bytesToHex(b));

// Évite que le moteur JS élimine un calcul dont le résultat serait inutilisé
let sink;

// Exécute fn() WARMUP fois (jeté) puis RUNS fois (chronométré, en ms)
function measure(fn, warmup = WARMUP, runs = RUNS_COMMIT, progress = false) {
    for (let i = 0; i < warmup; i++) sink = fn();

    const samples = [];
    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        sink = fn();
        samples.push(performance.now() - start);
        if (progress) process.stdout.write(".");
    }
    if (progress) process.stdout.write("\n");

    const n = samples.length;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const sorted = [...samples].sort((a, b) => a - b);
    const median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2; // RUNS est pair

    return { mean, median, stdDev: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
}

function printRow(fixture, op, s) {
    const f = (x, w, d) => x.toFixed(d).padStart(w);
    console.log(
        `${fixture.padEnd(6)} ${op.padEnd(22)} mean ${f(s.mean, 10, 3)}  med ${f(s.median, 10, 3)}  std ${f(s.stdDev, 9, 3)}  min ${f(s.min, 10, 3)}  max ${f(s.max, 10, 3)}`
    );
}

const fixtures = JSON.parse(
    readFileSync(new URL("../fixtures.json", import.meta.url), "utf8")
);

console.log(`Node ${process.version} | warm-up: ${WARMUP}, commit: ${RUNS_COMMIT}, proofs: ${RUNS_PROOFS}\n`);

const loadStart = performance.now();
const kzg = new KZG(trustedSetup);
console.log(`--- micro-eth-signer (défaut) : chargement du setup ${(performance.now() - loadStart).toFixed(1)} ms ---`);

for (const f of fixtures) {
    // Garde-fou : le résultat doit rester identique à celui du fichier
    const c = toHex(kzg.blobToKzgCommitment(f.blob));
    if (c !== f.commitment) {
        throw new Error(`commitment différent pour ${f.name}`);
    }

    printRow(f.name, "blobToKzgCommitment", measure(() => kzg.blobToKzgCommitment(f.blob)));
    const t0 = performance.now();
    sink = kzg.computeCellsAndProofs(f.blob);
    console.log(`  (premier appel, inclut l'init paresseuse : ${(performance.now() - t0).toFixed(0)} ms)`);
    printRow(f.name, "computeCellsAndProofs", measure(() => kzg.computeCellsAndProofs(f.blob), 2, RUNS_PROOFS, true));
}