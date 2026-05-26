/**
 * Server-side Poseidon2 Merkle tree — mirrors merkle.nr exactly.
 *
 * hash_node(left, right) = poseidon2_permutation([left, right, 0, 0], 4)[0]
 *
 * Uses Barretenberg (Node.js CJS build) for byte-for-byte fidelity with
 * the circuit.
 */
import { Barretenberg } from "@aztec/bb.js";

const DEPTH = 10;
export const TREE_SIZE = 1 << DEPTH; // 1024

let _bb: Barretenberg | null = null;
async function getBb(): Promise<Barretenberg> {
  if (!_bb) _bb = await Barretenberg.new({ threads: 1 });
  return _bb;
}

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
  for (const byte of bytes) n = (n << 8n) | BigInt(byte);
  return n;
}

export function addrToField(addr: string): bigint {
  return BigInt(addr.toLowerCase().replace("0x", "") ? "0x" + addr.toLowerCase().replace("0x", "") : "0x0");
}

async function hashNode(left: bigint, right: bigint): Promise<bigint> {
  const bb = await getBb();
  const result = await bb.poseidon2Permutation({
    inputs: [
      bigintToBytes(left),
      bigintToBytes(right),
      bigintToBytes(0n),
      bigintToBytes(0n),
    ],
  });
  return bytesToBigint(result.outputs[0]);
}

export function fieldToHex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

export async function buildMerkleTree(addresses: string[]): Promise<{
  root: string;
  tree: bigint[][];
}> {
  const leaves: bigint[] = new Array(TREE_SIZE).fill(0n);
  for (let i = 0; i < Math.min(addresses.length, TREE_SIZE); i++) {
    leaves[i] = addrToField(addresses[i]);
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

  return { root: fieldToHex(level[0]), tree };
}

export function getMerklePath(
  tree: bigint[][],
  leafIndex: number
): { path: string[]; indices: number[] } {
  const path: string[] = [];
  const indices: number[] = [];
  let idx = leafIndex;
  for (let d = 0; d < DEPTH; d++) {
    const isRight = idx % 2 === 1;
    path.push(fieldToHex(tree[d][isRight ? idx - 1 : idx + 1]));
    indices.push(isRight ? 1 : 0);
    idx = Math.floor(idx / 2);
  }
  return { path, indices };
}
