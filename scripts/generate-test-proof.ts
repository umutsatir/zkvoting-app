/**
 * CLI: Generate a UltraHonk vote proof for a registered voter.
 *
 * Usage:
 *   VOTER_INDEX=0 VOTE_CHOICE=1 PRIVATE_KEY=0x... \
 *     npx ts-node scripts/generate-test-proof.ts
 *
 * Defaults (Hardhat account #0 sk):
 *   VOTER_INDEX=0  VOTE_CHOICE=1  PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Reads:  scripts/output/election-setup.json  (or SETUP_FILE=output/sepolia-demo.json)
 * Writes: scripts/output/proof.json
 */
import * as fs from "fs";
import * as path from "path";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { blake2s } from "@noble/hashes/blake2s";

// Load compiled circuit (relative to project root, not scripts/)
const CIRCUIT_PATH = path.join(__dirname, "../circuits/target/vote.json");

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace("0x", "").padStart(64, "0");
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToArray(b: Uint8Array): number[] {
  return Array.from(b);
}

async function main() {
  const voterIndex = parseInt(process.env.VOTER_INDEX ?? "0", 10);
  const voteChoice = parseInt(process.env.VOTE_CHOICE ?? "1", 10);
  // Hardhat account #0 private key (well-known, used only on local test networks)
  const privateKeyHex = (process.env.PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    .replace("0x", "")
    .padStart(64, "0");

  // Load election setup (SETUP_FILE overrides default)
  const setupFile = process.env.SETUP_FILE ?? "output/election-setup.json";
  const setupPath = path.isAbsolute(setupFile)
    ? setupFile
    : path.join(__dirname, setupFile);
  if (!fs.existsSync(setupPath)) {
    console.error(`Setup file not found: ${setupPath}`);
    console.error("Run create-election.ts (or deploy-demo-election.ts) first.");
    process.exit(1);
  }
  const setup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
  const voter = setup.voters[voterIndex];
  if (!voter) {
    console.error(`Voter index ${voterIndex} not found in election-setup.json`);
    process.exit(1);
  }

  console.log(`Generating proof for voter[${voterIndex}] = ${voter.address}`);
  console.log(`Vote choice: ${voteChoice} (${setup.candidates[voteChoice] ?? "?"})`);

  // Derive key material
  const skBigint = BigInt("0x" + privateKeyHex);
  const skBytes = bytesToArray(hexToBytes(privateKeyHex));

  const pubKey = secp256k1.getPublicKey(skBigint, false); // uncompressed, 65 bytes
  const pk_x = bytesToArray(pubKey.slice(1, 33));
  const pk_y = bytesToArray(pubKey.slice(33, 65));

  // election_id as [u8; 32]
  const electionIdBytes = bytesToArray(hexToBytes(setup.election_id));

  // msg_hash = blake2s(election_id)  — mirrors std::hash::blake2s in the circuit
  const msgHash = blake2s(new Uint8Array(electionIdBytes), { dkLen: 32 });

  // ECDSA signature over the blake2s message hash
  const sig = secp256k1.sign(msgHash, skBigint, { lowS: true });
  const ecdsa_sig = bytesToArray(sig.toCompactRawBytes()); // [u8; 64]

  // nullifier = blake2s(sk_bytes || election_id)
  const preimage = new Uint8Array([...skBytes, ...electionIdBytes]);
  const nullifier = bytesToArray(blake2s(preimage, { dkLen: 32 }));

  console.log(`Nullifier: 0x${nullifier.map((b) => b.toString(16).padStart(2, "0")).join("")}`);

  // Build noir inputs
  const inputs = {
    merkle_root: setup.merkle_root,
    nullifier,
    vote_choice: voteChoice.toString(),
    election_id: electionIdBytes,
    num_candidates: setup.num_candidates.toString(),
    sk_bytes: skBytes,
    pk_x,
    pk_y,
    ecdsa_sig,
    merkle_path: voter.merkle_path,
    merkle_indices: voter.merkle_indices,
  };

  // Load circuit and generate proof
  console.log("Loading circuit...");
  const circuit = JSON.parse(fs.readFileSync(CIRCUIT_PATH, "utf8"));

  console.log("Initialising Noir + UltraHonkBackend (this may take 10-30 seconds)...");
  const noir = new Noir(circuit);
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(circuit.bytecode, api);

  console.log("Executing witness...");
  const { witness } = await noir.execute(inputs);

  console.log("Generating proof...");
  const proofData = await backend.generateProof(witness, { verifierTarget: "evm" });

  const proofHex = "0x" + Buffer.from(proofData.proof).toString("hex");
  // bb.js 4.x returns publicInputs as 0x-prefixed hex strings already
  const publicInputsHex = proofData.publicInputs.map(
    (hex: string) => "0x" + hex.replace("0x", "").padStart(64, "0")
  );

  const output = {
    voter_address: voter.address,
    voter_index: voterIndex,
    vote_choice: voteChoice,
    candidate: setup.candidates[voteChoice] ?? `Candidate ${voteChoice}`,
    election_id: setup.election_id,
    merkle_root: setup.merkle_root,
    nullifier_hex: "0x" + nullifier.map((b) => b.toString(16).padStart(2, "0")).join(""),
    proof: proofHex,
    public_inputs: publicInputsHex,
    public_inputs_count: publicInputsHex.length,
  };

  const outPath = path.join(__dirname, "output/proof.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nProof written to: ${outPath}`);
  console.log(`Proof bytes: ${proofData.proof.length}`);
  console.log(`Public inputs: ${publicInputsHex.length} (expected 75)`);
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
