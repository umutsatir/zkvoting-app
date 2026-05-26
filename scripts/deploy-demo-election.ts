/**
 * CLI: Create a demo election on Sepolia via ElectionFactory.
 *
 * Usage:
 *   RPC_URL=https://... PRIVATE_KEY=0x... npx ts-node scripts/deploy-demo-election.ts
 *
 * Reads:  contracts/deployments/sepolia.json
 * Writes: scripts/output/sepolia-demo.json
 */
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildMerkleTree, fieldToHex, addrToField, getMerklePath } from "./merkle-node";

const ELECTION_FACTORY_ABI = [
  "function createElection(bytes32 merkleRoot, uint8 numCandidates, uint256 startTime, uint256 endTime, address verifier, bytes32 electionId) external returns (address addr)",
  "event ElectionCreated(address indexed election, bytes32 indexed electionId)",
];

async function main() {
  const rpcUrl  = process.env.RPC_URL  ?? "";
  const privKey = process.env.PRIVATE_KEY ?? "";
  if (!rpcUrl || !privKey) {
    console.error("Set RPC_URL and PRIVATE_KEY environment variables.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer   = new ethers.Wallet(privKey.startsWith("0x") ? privKey : "0x" + privKey, provider);

  // Load deployment
  const depPath = path.join(__dirname, "../contracts/deployments/sepolia.json");
  if (!fs.existsSync(depPath)) {
    console.error("contracts/deployments/sepolia.json not found. Deploy first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
  const factoryAddr  = deployment.contracts.ElectionFactory;
  const verifierAddr = deployment.contracts.HonkVerifier;
  console.log("ElectionFactory:", factoryAddr);
  console.log("HonkVerifier:   ", verifierAddr);

  // Demo voter set: deployer + 2 extra Hardhat addresses
  const deployer = signer.address;
  const VOTERS = [
    deployer,
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ];
  const CANDIDATES  = ["Alice", "Bob", "Carol", "Dave"];
  const NUM_CANDS   = CANDIDATES.length; // 4

  // election_id = keccak256("demo-election-001")
  const ELECTION_ID = ethers.keccak256(ethers.toUtf8Bytes("demo-election-001"));

  // Timing: start 60 s from now, end 24 h from now
  const now       = Math.floor(Date.now() / 1000);
  const startTime = now + 60;
  const endTime   = now + 24 * 3600;

  // Build Merkle tree
  console.log("\nBuilding Merkle tree for voters:", VOTERS);
  const { root: merkleRoot, tree } = await buildMerkleTree(VOTERS);
  console.log("Merkle root:", merkleRoot);

  // Call ElectionFactory.createElection
  const factory = new ethers.Contract(factoryAddr, ELECTION_FACTORY_ABI, signer);
  console.log("\nCalling createElection on Sepolia...");
  const tx = await factory.createElection(
    merkleRoot,
    NUM_CANDS,
    startTime,
    endTime,
    verifierAddr,
    ELECTION_ID
  );
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber);

  // Extract ElectionManager address from event
  const iface = new ethers.Interface(ELECTION_FACTORY_ABI);
  let electionAddr = "";
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "ElectionCreated") {
        electionAddr = parsed.args[0];
        break;
      }
    } catch { /* skip */ }
  }
  if (!electionAddr) {
    console.error("Could not find ElectionCreated event in receipt");
    process.exit(1);
  }
  console.log("ElectionManager:", electionAddr);

  // Compute voter proofs
  const voterProofs = VOTERS.map((addr, i) => {
    const { path: merklePath, indices } = getMerklePath(tree, i);
    return {
      index: i,
      address: addr,
      leaf: fieldToHex(addrToField(addr)),
      merkle_path: merklePath,
      merkle_indices: indices,
    };
  });

  // Persist output
  const output = {
    network: "sepolia",
    election_name: "Demo Election",
    election_id: ELECTION_ID,
    num_candidates: NUM_CANDS,
    candidates: CANDIDATES,
    merkle_root: merkleRoot,
    start_time: startTime,
    end_time: endTime,
    voters: voterProofs,
    contracts: {
      ElectionFactory: factoryAddr,
      HonkVerifier: verifierAddr,
      ElectionManager: electionAddr,
    },
    tx_hash: tx.hash,
  };

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sepolia-demo.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("\nDemo election setup written to:", outPath);
  console.log("Etherscan: https://sepolia.etherscan.io/tx/" + tx.hash);
  console.log("\nNext: generate a proof with");
  console.log("  SETUP_FILE=output/sepolia-demo.json VOTER_INDEX=0 VOTE_CHOICE=1 PRIVATE_KEY=<key> \\");
  console.log("  npx ts-node generate-test-proof.ts");

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
