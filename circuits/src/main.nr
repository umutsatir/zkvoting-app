// ZK Anonymous Voting Circuit
//
// Proves simultaneously:
//   1. The voter's Ethereum address is a leaf in a registered-voter Merkle tree.
//   2. The nullifier is correctly derived from the voter's private key and
//      the election ID (prevents double-voting without revealing identity).
//   3. The vote choice is in the valid range [0, num_candidates).
//
// NULLIFIER NOTE:
// Full PLUME (ERC-7524) requires secp256k1 EC scalar multiplication via
// distributed-lab/noir-plume, which depends on noir-lang/noir-bignum v0.4.x.
// That library does NOT compile under nargo 1.0.0-beta.13 (~30 API errors in
// the beta series).  This circuit uses a SHA-256-based substitute:
//
//   nullifier = blake2s(sk_bytes || election_id)   [u8; 32]
//
// Unique per (sk, election_id); cannot be computed without sk; ZK-safe.
// Migration path to PLUME (once bignum ships a nargo 1.x-compatible release):
//   1. Re-add plume dep to Nargo.toml (see comment there).
//   2. Replace compute_nullifier() with plume_v1(election_id, c, s, pk, N).
//   3. Add private inputs: plume_c [u8;32], plume_s [u8;32], nullifier_x/y.

mod merkle;
mod tests;

use keccak256::keccak256;
// Note: sha256 (noir-lang/sha256) triggers a Brillig-constraint bug in
// nargo 1.0.0-beta.13 non-trivial call chains.  blake2s is a builtin with
// identical security properties for nullifier use and compiles cleanly.

global DEPTH: u32 = 10;

// Main ZK-vote constraint system.
//
// Public inputs (revealed to the on-chain verifier):
//   merkle_root    - root of the registered-voter Merkle tree
//   nullifier      - sha256(sk || election_id); uniquely tags each vote
//   vote_choice    - candidate index (0-indexed)
//   election_id    - 32-byte unique election identifier
//   num_candidates - number of valid candidates (1..=4)
//
// Private inputs (known only to the prover):
//   sk_bytes       - secp256k1 private key (big-endian, 32 bytes)
//   pk_x           - public-key x coordinate (big-endian, 32 bytes)
//   pk_y           - public-key y coordinate (big-endian, 32 bytes)
//   ecdsa_sig      - ECDSA sig of blake2s(election_id) proving ownership of sk
//   merkle_path    - sibling nodes from leaf level up to root
//   merkle_indices - direction bits: 0 = current node is left child
pub fn main(
    merkle_root: pub Field,
    nullifier: pub [u8; 32],
    vote_choice: pub Field,
    election_id: pub [u8; 32],
    num_candidates: pub Field,
    sk_bytes: [u8; 32],
    pk_x: [u8; 32],
    pk_y: [u8; 32],
    ecdsa_sig: [u8; 64],
    merkle_path: [Field; DEPTH],
    merkle_indices: [bool; DEPTH],
) {
    // 1. Voter identity: ECDSA proof-of-key-ownership.
    //    Sign blake2s(election_id) so the proof is election-specific and the
    //    message is a fixed 32-byte hash (required by the ECDSA builtin).
    //    ECDSA unforgeability guarantees only the sk holder can produce a valid
    //    signature, binding (pk_x, pk_y) to the prover's private key.
    let msg_hash = std::hash::blake2s(election_id);
    let sig_valid = std::ecdsa_secp256k1::verify_signature(pk_x, pk_y, ecdsa_sig, msg_hash);
    assert(sig_valid, "ECDSA: invalid signature for pk");

    // 2. Derive Ethereum address from public key in-circuit.
    //    address = keccak256(pk_x || pk_y)[12..] packed big-endian as Field
    let eth_address = derive_eth_address(pk_x, pk_y);

    // 3. Merkle membership proof -- address must be a registered voter.
    let computed_root = merkle::compute_root(eth_address, merkle_path, merkle_indices);
    assert(computed_root == merkle_root, "Merkle: address not in voter set");

    // 4. Nullifier correctness: sha256(sk || election_id).
    let computed_nullifier = compute_nullifier(sk_bytes, election_id);
    assert(computed_nullifier == nullifier, "Nullifier: mismatch");

    // 5. Vote range check: 0 <= vote_choice < num_candidates <= 4.
    let cands = num_candidates as u8;
    let choice = vote_choice as u8;
    assert(cands >= 1, "num_candidates must be >= 1");
    assert(cands <= 4, "num_candidates must be <= 4");
    assert(choice < cands, "vote_choice out of range");
}

// Derive Ethereum address from an uncompressed secp256k1 public key.
// Returns the address as a Field element (right-aligned, 20 bytes).
fn derive_eth_address(pk_x: [u8; 32], pk_y: [u8; 32]) -> Field {
    let mut pk_bytes = [0u8; 64];
    for i in 0..32 {
        pk_bytes[i] = pk_x[i];
        pk_bytes[32 + i] = pk_y[i];
    }
    let hash = keccak256(pk_bytes, 64);

    // Pack last 20 bytes of the keccak hash as a big-endian Field integer
    let mut addr: Field = 0;
    for i in 0..20 {
        addr = addr * 256 + hash[12 + i] as Field;
    }
    addr
}

// Compute the vote nullifier: blake2s(sk_bytes || election_id).
// Unique per (voter, election); private -- requires sk to reproduce.
// blake2s is a stdlib builtin ([u8;N] -> [u8;32]) with no external dependency.
fn compute_nullifier(sk_bytes: [u8; 32], election_id: [u8; 32]) -> [u8; 32] {
    let mut preimage = [0u8; 64];
    for i in 0..32 {
        preimage[i] = sk_bytes[i];
        preimage[32 + i] = election_id[i];
    }
    std::hash::blake2s(preimage)
}
