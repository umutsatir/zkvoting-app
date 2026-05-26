/**
 * CLI: Submit a previously generated proof to ElectionManager.castVote on Sepolia.
 *
 * Usage:
 *   RPC_URL=https://... PRIVATE_KEY=0x... ELECTION_ADDRESS=0x... \
 *     npx ts-node scripts/verify-on-chain.ts
 *
 * If ELECTION_ADDRESS is not set, reads it from contracts/deployments/sepolia.json
 * (assumes the first election created by ElectionFactory).
 *
 * Reads:  scripts/output/proof.json
 *         contracts/deployments/sepolia.json
 */
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

const ELECTION_MANAGER_ABI = [
  "function castVote(bytes calldata proof, bytes32[] calldata publicInputs) external",
  "function usedNullifiers(bytes32) external view returns (bool)",
  "function getResults() external view returns (uint256[4])",
];

const ELECTION_FACTORY_ABI = [
  "function getElections() external view returns (address[])",
];

async function main() {
  // Load proof
  const proofPath = path.join(__dirname, "output/proof.json");
  if (!fs.existsSync(proofPath)) {
    console.error("Run generate-test-proof.ts first.");
    process.exit(1);
  }
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

  // Load deployment
  const deploymentsPath = path.join(__dirname, "../contracts/deployments/sepolia.json");
  if (!fs.existsSync(deploymentsPath)) {
    console.error("No sepolia deployment found. Run: cd contracts && npx hardhat run scripts/deploy.ts --network sepolia");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    console.error("Set RPC_URL and PRIVATE_KEY environment variables.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  // Resolve election address
  let electionAddress = process.env.ELECTION_ADDRESS;
  if (!electionAddress) {
    const factory = new ethers.Contract(
      deployment.contracts.ElectionFactory,
      ELECTION_FACTORY_ABI,
      provider
    );
    const elections: string[] = await factory.getElections();
    if (elections.length === 0) {
      console.error("No elections found. Create one via the frontend or factory contract.");
      process.exit(1);
    }
    electionAddress = elections[elections.length - 1]; // use the most recent
    console.log(`Using most recent election: ${electionAddress}`);
  }

  const manager = new ethers.Contract(electionAddress, ELECTION_MANAGER_ABI, signer);

  // Check if nullifier is already used
  const nullifierBytes32 = proof.nullifier_hex.padEnd(66, "0");
  const alreadyUsed: boolean = await manager.usedNullifiers(nullifierBytes32);
  if (alreadyUsed) {
    console.error("Nullifier already used — this vote was already cast.");
    process.exit(1);
  }

  console.log(`Submitting castVote to ${electionAddress}...`);
  console.log(`  Voter:  ${proof.voter_address}`);
  console.log(`  Choice: ${proof.vote_choice} (${proof.candidate})`);
  console.log(`  Proof:  ${proof.proof.length / 2 - 1} bytes`);

  const tx = await manager.castVote(proof.proof, proof.public_inputs, {
    gasLimit: 10_000_000,
  });
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);

  // Print updated tally
  const results: bigint[] = await manager.getResults();
  console.log("\nUpdated tally:");
  results.forEach((v, i) => console.log(`  Candidate ${i}: ${v.toString()} vote(s)`));

  console.log(`\nEtherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
