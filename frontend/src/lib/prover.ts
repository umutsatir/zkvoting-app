import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import voteCircuit from "../assets/vote_circuit.json";

export interface VoteInputs {
  // Public inputs
  merkle_root: string;        // Field as hex string
  nullifier: number[];        // [u8; 32]
  vote_choice: string;        // Field as hex string
  election_id: number[];      // [u8; 32]
  num_candidates: string;     // Field as hex string
  // Private inputs
  sk_bytes: number[];         // [u8; 32]
  pk_x: number[];             // [u8; 32]
  pk_y: number[];             // [u8; 32]
  ecdsa_sig: number[];        // [u8; 64]
  merkle_path: string[];      // [Field; 10] as hex strings
  merkle_indices: boolean[];  // [bool; 10]
}

// Singletons — WASM init is expensive, reuse across calls
let _backend: UltraHonkBackend | null = null;
let _noir: Noir | null = null;

async function getInstances() {
  if (!_backend || !_noir) {
    const api = await Barretenberg.new({ threads: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _backend = new UltraHonkBackend((voteCircuit as any).bytecode, api);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _noir = new Noir(voteCircuit as any);
  }
  return { backend: _backend, noir: _noir };
}

/**
 * Generate a UltraHonk proof for a vote.
 * Returns the proof bytes and public inputs formatted as hex bytes32 strings
 * ready to pass directly to ElectionManager.castVote().
 */
export async function generateVoteProof(
  inputs: VoteInputs
): Promise<{ proof: `0x${string}`; publicInputs: `0x${string}`[] }> {
  const { backend, noir } = await getInstances();

  // noir_js InputMap expects arrays as plain JS arrays and Fields as decimal or hex strings
  const inputMap = {
    merkle_root: inputs.merkle_root,
    nullifier: inputs.nullifier,
    vote_choice: inputs.vote_choice,
    election_id: inputs.election_id,
    num_candidates: inputs.num_candidates,
    sk_bytes: inputs.sk_bytes,
    pk_x: inputs.pk_x,
    pk_y: inputs.pk_y,
    ecdsa_sig: inputs.ecdsa_sig,
    merkle_path: inputs.merkle_path,
    merkle_indices: inputs.merkle_indices,
  };

  const { witness } = await noir.execute(inputMap);
  const proofData = await backend.generateProof(witness, { verifierTarget: "evm" });

  // proof bytes as 0x-prefixed hex
  const proofHex = ("0x" + Array.from(proofData.proof).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

  // publicInputs: bb.js 4.x returns 0x-prefixed hex strings
  const publicInputsHex = proofData.publicInputs.map((hex: string) => {
    return ("0x" + hex.replace("0x", "").padStart(64, "0")) as `0x${string}`;
  });

  return { proof: proofHex, publicInputs: publicInputsHex };
}
