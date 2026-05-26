/**
 * Client-side Poseidon2 Merkle tree matching the circuit's merkle.nr exactly.
 *
 * hash_node(left, right) = poseidon2_permutation([left, right, 0, 0], 4)[0]
 *
 * We use Barretenberg's poseidon2Permutation (async, WASM-backed) to stay
 * byte-for-byte identical with what the circuit computes.
 *
 * Leaf values: Ethereum address packed as a BN254 field element (20 bytes,
 * big-endian) — identical to derive_eth_address() in main.nr.
 */

import { Barretenberg } from "@aztec/bb.js";
import { keccak256, type Address } from "viem";

let _bb: Barretenberg | null = null;
async function getBb(): Promise<Barretenberg> {
  if (!_bb) _bb = await Barretenberg.new({ threads: 1 });
  return _bb;
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function bigintToBytes(n: bigint): Uint8Array {
  const buf = new Uint8Array(32);
  let tmp = n;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  return buf;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const byte of bytes) {
    n = (n << 8n) | BigInt(byte);
  }
  return n;
}

export function addressToField(addr: Address): bigint {
  const lower = addr.toLowerCase().replace("0x", "");
  return BigInt("0x" + lower);
}

// ── Core hash (mirrors hash_node in merkle.nr) ────────────────────────────────

async function hashNode(left: bigint, right: bigint): Promise<bigint> {
  const bb = await getBb();
  const result = await bb.poseidon2Permutation({
    inputs: [bigintToBytes(left), bigintToBytes(right), bigintToBytes(0n), bigintToBytes(0n)],
  });
  return bytesToBigint(result.outputs[0]);
}

// ── Merkle tree builder ───────────────────────────────────────────────────────

/**
 * Derive the Ethereum address that the circuit will compute for a given raw
 * address: keccak256(pk_x || pk_y)[12..] — but since we only have the final
 * address (not the raw public key), we use the address directly as the leaf.
 *
 * The circuit stores eth_address = keccak256(pk_x||pk_y)[12..32] packed as Field.
 * For the off-chain tree we receive already-computed addresses and pack the same way.
 */
export function leafFromAddress(addr: Address): bigint {
  return addressToField(addr);
}

/**
 * Build a depth-10 Poseidon2 Merkle tree from up to 1024 voter addresses.
 * Pads to the next power of 2 (or 1024 max) with the zero leaf.
 *
 * Returns:
 *   root  – hex string (0x-prefixed)
 *   tree  – array of levels, tree[0] = leaves (bigint[]), tree[DEPTH] = [root]
 */
export async function buildMerkleTree(addresses: Address[]): Promise<{
  root: `0x${string}`;
  tree: bigint[][];
}> {
  const DEPTH = 10;
  const SIZE = 1 << DEPTH; // 1024

  // Build leaf level
  const leaves: bigint[] = new Array(SIZE).fill(0n);
  for (let i = 0; i < Math.min(addresses.length, SIZE); i++) {
    leaves[i] = leafFromAddress(addresses[i]);
  }

  const tree: bigint[][] = [leaves];

  let level = leaves;
  for (let d = 0; d < DEPTH; d++) {
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await hashNode(level[i], level[i + 1]));
    }
    tree.push(next);
    level = next;
  }

  const root = level[0];
  const rootHex = ("0x" + root.toString(16).padStart(64, "0")) as `0x${string}`;
  return { root: rootHex, tree };
}

/**
 * Compute the authentication path for the leaf at leafIndex.
 *
 * Returns:
 *   path    – sibling field elements as hex strings (0x-prefixed), leaf-to-root order
 *   indices – direction bits: 0 = current node is left child (sibling on right)
 */
export function getMerklePath(
  tree: bigint[][],
  leafIndex: number
): { path: `0x${string}`[]; indices: boolean[] } {
  const path: `0x${string}`[] = [];
  const indices: boolean[] = [];

  let idx = leafIndex;
  for (let d = 0; d < tree.length - 1; d++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = tree[d][siblingIdx];
    path.push(("0x" + sibling.toString(16).padStart(64, "0")) as `0x${string}`);
    indices.push(isRight);
    idx = Math.floor(idx / 2);
  }

  return { path, indices };
}

/**
 * Look up a voter address in the tree and return full proof data, or null if
 * the address is not registered.
 */
export async function getVoterProof(
  tree: bigint[][],
  addresses: Address[],
  voterAddress: Address
): Promise<{ leafIndex: number; path: `0x${string}`[]; indices: boolean[] } | null> {
  const normalized = voterAddress.toLowerCase() as Address;
  const idx = addresses.findIndex((a) => a.toLowerCase() === normalized);
  if (idx === -1) return null;
  const { path, indices } = getMerklePath(tree, idx);
  return { leafIndex: idx, path, indices };
}

/**
 * One-shot helper: derive merkleRoot from a list of addresses, intended for
 * the CreateElection flow where we need only the root (not the full tree).
 */
export async function computeMerkleRoot(addresses: Address[]): Promise<`0x${string}`> {
  const { root } = await buildMerkleTree(addresses);
  return root;
}

// Re-export keccak helper for address derivation outside the circuit
export { keccak256 };
