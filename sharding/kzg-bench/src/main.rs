use c_kzg::{ethereum_kzg_settings, Blob};
use serde::Deserialize;
use std::hint::black_box;
use std::time::Instant;

const WARMUP: usize = 3;
const RUNS_COMMIT: usize = 30;
const RUNS_PROOFS: usize = 20;
const PRECOMPUTES: [u64; 3] = [8, 10, 0];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    name: String,
    payload_bytes: usize,
    blob: String,
    commitment: String,
}

struct Stats {
    mean: f64,
    std_dev: f64,
    min: f64,
    max: f64,
    median: f64,
}

// Executes f() WARMUMP times (dropped) then RUNS times (timed in ms)
fn measure<T>(runs: usize, mut f: impl FnMut() -> T) -> Stats {
    for _ in 0..WARMUP {
        black_box(f());
    }
    let mut samples = Vec::with_capacity(runs);
    for _ in 0..runs {
        let start = Instant::now();
        black_box(f());
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    let n = samples.len() as f64;
    let mean = samples.iter().sum::<f64>() / n;
    let variance = samples.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    let mut sorted = samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0; // RUNS est pair
    Stats {
        mean,
        median,
        std_dev: variance.sqrt(),
        min: samples.iter().cloned().fold(f64::INFINITY, f64::min),
        max: samples.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
    }
}

fn print_row(fixture: &str, precompute: u64, op: &str, s: &Stats) {
    println!(
        "{:<6} p={:<2} {:<22} mean {:>10.3}  med {:>10.3}  std {:>9.3}  min {:>10.3}  max {:>10.3}",
        fixture, precompute, op, s.mean, s.median, s.std_dev, s.min, s.max
    );
}

fn main() {
    let raw = std::fs::read_to_string("../fixtures.json").expect("fixtures.json introuvable");
    let fixtures: Vec<Fixture> = serde_json::from_str(&raw).expect("JSON invalide");

    // Decoding the blobs only once, outside of timing
    let blobs: Vec<Blob> = fixtures
        .iter()
        .map(|f| {
            let bytes = hex::decode(f.blob.trim_start_matches("0x")).expect("blob hex invalide");
            Blob::from_bytes(&bytes).expect("blob invalide")
        })
        .collect();

    println!("warm-up: {WARMUP}, commit: {RUNS_COMMIT}, proofs: {RUNS_PROOFS}\n");

    for &precompute in PRECOMPUTES.iter() {
        let load_start = Instant::now();
        let settings = ethereum_kzg_settings(precompute);
        let load_ms = load_start.elapsed().as_secs_f64() * 1000.0;
        println!("--- precompute = {precompute} : chargement du setup {load_ms:.1} ms ---");

        for (f, blob) in fixtures.iter().zip(blobs.iter()) {
            // The result must stay identical to the JS
            let c = settings.blob_to_kzg_commitment(blob).expect("commitment");
            let rust_hex = format!("0x{}", hex::encode(c.to_bytes().as_slice()));
            assert_eq!(rust_hex, f.commitment, "commitment différent pour {}", f.name);

            let s = measure(RUNS_COMMIT, || settings.blob_to_kzg_commitment(blob).unwrap());
            print_row(&f.name, precompute, "blobToKzgCommitment", &s);

            let s = measure(RUNS_PROOFS, || settings.compute_cells_and_kzg_proofs(blob).unwrap());
            print_row(&f.name, precompute, "computeCellsAndProofs", &s);
        }
        println!();
    }
}