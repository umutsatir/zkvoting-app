/**
 * CLI: Build a Merkle tree for a demo election and write all voter proofs.
 *
 * Usage:
 *   npx ts-node scripts/create-election.ts
 *   VOTER_ADDRESSES=0xAbc,0xDef npx ts-node scripts/create-election.ts
 *
 * Output: scripts/output/election-setup.json
 */
import * as fs from "fs";
import * as path from "path";
import { buildMerkleTree, getMerklePath, fieldToHex, addrToField } from "./merkle-node";

// Demo voter set — override with VOTER_ADDRESSES env var (comma-separated)
const DEFAULT_VOTERS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Hardhat account #0
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Hardhat account #1
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Hardhat account #2
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // Hardhat account #3
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // Hardhat account #4
];

// Demo election parameters
const ELECTION_NAME = "Demo Election 2026";
const ELECTION_ID = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const NUM_CANDIDATES = 3;
const CANDIDATES = ["Alice", "Bob", "Carol"];

async function main() {
  const addresses = process.env.VOTER_ADDRESSES
    ? process.env.VOTER_ADDRESSES.split(",").map((a) => a.trim())
    : DEFAULT_VOTERS;

  console.log(`Building Merkle tree for ${addresses.length} voters...`);
  const { root, tree } = await buildMerkleTree(addresses);
  console.log(`Merkle root: ${root}`);

  // Compute proof for every registered voter
  const voterProofs = addresses.map((addr, i) => {
    const { path: merklePath, indices } = getMerklePath(tree, i);
    return {
      index: i,
      address: addr,
      leaf: fieldToHex(addrToField(addr)),
      merkle_path: merklePath,
      merkle_indices: indices,
    };
  });

  // Serialize tree (only the non-leaf levels, as hex strings — leaves are large)
  const treeHex = tree.map((level) => level.map(fieldToHex));

  const output = {
    election_name: ELECTION_NAME,
    election_id: ELECTION_ID,
    num_candidates: NUM_CANDIDATES,
    candidates: CANDIDATES,
    merkle_root: root,
    voters: voterProofs,
    tree_depth: 10,
    tree_size: 1024,
    // Full tree is large; include only root path levels for inspection
    tree_levels: treeHex.slice(0, 4).map((level, d) => ({
      depth: d,
      nodes: level.slice(0, 8), // first 8 nodes per level for inspection
    })),
  };

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "election-setup.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nElection setup written to: ${outPath}`);
  console.log(`\nSummary:`);
  console.log(`  Name:          ${ELECTION_NAME}`);
  console.log(`  Election ID:   ${ELECTION_ID}`);
  console.log(`  Voters:        ${addresses.length}`);
  console.log(`  Merkle root:   ${root}`);
  console.log(`  Candidates:    ${CANDIDATES.join(", ")}`);
  console.log(`\nVoter Merkle paths:`);
  voterProofs.forEach((v) => {
    console.log(`  [${v.index}] ${v.address}`);
    console.log(`       leaf:    ${v.leaf}`);
    console.log(`       indices: [${v.merkle_indices.join(",")}]`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
