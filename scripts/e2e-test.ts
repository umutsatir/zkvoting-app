/**
 * End-to-end smoke test on a local Hardhat node.
 *
 * Spins up a JSON-RPC connection to the running Hardhat node (or uses the
 * in-process fork via ethers), deploys MockVerifier + ElectionFactory, creates
 * an election, and exercises the full castVote flow without generating a real
 * ZK proof (MockVerifier always returns true).
 *
 * Usage:
 *   # Terminal 1 — start Hardhat node:
 *   cd contracts && npx hardhat node
 *
 *   # Terminal 2 — run the e2e test:
 *   cd scripts && npx ts-node e2e-test.ts
 *
 * Expected output:
 *   PASS: vote 1 accepted (choice 1)
 *   PASS: duplicate nullifier reverts
 *   PASS: vote 2 accepted (choice 0)
 *   PASS: tally = [1, 1, 0, 0]
 */
import { ethers } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { buildMerkleTree } from "./merkle-node";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — blake2s re-export is deprecated in favour of @noble/hashes/blake2, but still works
import { blake2s } from "@noble/hashes/blake2s";


// ── Load contract artifacts ───────────────────────────────────────────────────

function loadArtifact(name: string): { abi: object[]; bytecode: string } {
  const dir = path.join(__dirname, "../contracts/artifacts/src");
  const p = path.join(dir, `${name}.sol/${name}.json`);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: raw.abi, bytecode: raw.bytecode };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

function hexToBytes(hex: string): number[] {
  const h = hex.replace("0x", "").padStart(64, "0");
  const arr: number[] = [];
  for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
  return arr;
}

// Build 83-element publicInputs array for ElectionManager
// Mirrors the layout documented in ElectionManager.sol
function buildPublicInputs(
  merkleRoot: string,
  nullifierBytes: number[],
  voteChoice: number,
  electionIdBytes: number[],
  numCandidates: number
): string[] {
  const inputs: string[] = new Array(83).fill(ethers.ZeroHash);
  inputs[0] = ethers.zeroPadValue(merkleRoot, 32);
  for (let i = 0; i < 32; i++) {
    inputs[1 + i] = ethers.zeroPadValue(ethers.toBeHex(nullifierBytes[i]), 32);
  }
  inputs[33] = ethers.zeroPadValue(ethers.toBeHex(voteChoice), 32);
  for (let i = 0; i < 32; i++) {
    inputs[34 + i] = ethers.zeroPadValue(ethers.toBeHex(electionIdBytes[i]), 32);
  }
  inputs[66] = ethers.zeroPadValue(ethers.toBeHex(numCandidates), 32);
  return inputs;
}

// Derive nullifier bytes: blake2s(sk_bytes || election_id)
function deriveNullifier(skBytes: number[], electionIdBytes: number[]): number[] {
  const preimage = new Uint8Array([...skBytes, ...electionIdBytes]);
  return Array.from(blake2s(preimage, { dkLen: 32 }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const RPC = process.env.HARDHAT_RPC ?? "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(RPC);

  // Use Hardhat's well-known test accounts (accounts[0..2])
  const deployer = new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  );
  // Three voter private keys (Hardhat accounts 1, 2, 3 — distinct from deployer at account 0)
  const voterKeys = [
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  ];
  const voterSigners = voterKeys.map((k) => new ethers.Wallet(k, provider));
  const voterAddresses = voterSigners.map((s) => s.address);

  console.log("Deployer:  ", deployer.address);
  console.log("Voters:    ", voterAddresses);

  // Fetch nonce once, then increment manually — avoids ethers v6 async caching issue
  let nonce = await deployer.getNonce();

  // Deploy MockVerifier
  const mockArt = loadArtifact("MockVerifier");
  const MockFactory = new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer);
  const mock = await MockFactory.deploy({ nonce: nonce++ });
  await mock.waitForDeployment();
  const verifierAddr = await mock.getAddress();
  console.log("MockVerifier:", verifierAddr);

  // Deploy ElectionFactory
  const factArt = loadArtifact("ElectionFactory");
  const FactoryContract = new ethers.ContractFactory(factArt.abi, factArt.bytecode, deployer);
  const factory = await FactoryContract.deploy({ nonce: nonce++ });
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("ElectionFactory:", factoryAddr);

  // ── Build Merkle tree ───────────────────────────────────────────────────────
  console.log("\nBuilding Merkle tree...");
  const { root: merkleRoot } = await buildMerkleTree(voterAddresses);
  console.log("Merkle root:", merkleRoot);

  // Election parameters
  const ELECTION_ID = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  const electionIdBytes = hexToBytes(ELECTION_ID);
  const NUM_CANDIDATES = 3;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - 60;
  const endTime = now + 7 * 24 * 3600;

  // Create election via factory
  const factoryWithSigner = new ethers.Contract(factoryAddr, factArt.abi as ethers.InterfaceAbi, deployer);
  const createTx = await factoryWithSigner.createElection(
    merkleRoot,
    NUM_CANDIDATES,
    startTime,
    endTime,
    verifierAddr,
    ELECTION_ID,
    { nonce: nonce++ }
  );
  const createReceipt = await createTx.wait();
  const managerAddr: string = createReceipt.logs
    .map((l: ethers.Log) => {
      try {
        const iface = new ethers.Interface(factArt.abi as ethers.InterfaceAbi);
        return iface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e: ethers.LogDescription | null) => e?.name === "ElectionCreated")?.args[0];

  console.log("ElectionManager:", managerAddr);

  const mgrArt = loadArtifact("ElectionManager");
  // Connect manager to each voter's own signer to keep nonces isolated from deployer
  const managerAsVoter0 = new ethers.Contract(managerAddr, mgrArt.abi as ethers.InterfaceAbi, voterSigners[0]);
  const managerAsVoter1 = new ethers.Contract(managerAddr, mgrArt.abi as ethers.InterfaceAbi, voterSigners[1]);
  const managerView    = new ethers.Contract(managerAddr, mgrArt.abi as ethers.InterfaceAbi, provider);

  // Fetch voter nonces once; increment manually to avoid ethers v6 cache issues
  let vNonce0 = await voterSigners[0].getNonce();
  let vNonce1 = await voterSigners[1].getNonce();

  // ── Vote 1: voter[0] votes for candidate 1 ─────────────────────────────────
  console.log("\n--- Vote 1: voter[0] → candidate 1 ---");
  const sk0Bytes = hexToBytes(voterKeys[0]);
  const nullifier0 = deriveNullifier(sk0Bytes, electionIdBytes);
  const pi0 = buildPublicInputs(merkleRoot, nullifier0, 1, electionIdBytes, NUM_CANDIDATES);

  // Provide a non-empty dummy proof (MockVerifier ignores it)
  const dummyProof = "0x" + "ab".repeat(128);
  const tx1 = await managerAsVoter0.castVote(dummyProof, pi0, { nonce: vNonce0++ });
  await tx1.wait();
  assert(true, "vote 1 accepted (voter[0] → candidate 1)");

  // ── Duplicate nullifier must revert ────────────────────────────────────────
  console.log("\n--- Duplicate nullifier ---");
  try {
    // voterSigners[2] submits the same nullifier (contract checks nullifier, not sender)
    const managerAsVoter2 = new ethers.Contract(managerAddr, mgrArt.abi as ethers.InterfaceAbi, voterSigners[2]);
    await managerAsVoter2.castVote(dummyProof, pi0, { nonce: await voterSigners[2].getNonce() });
    assert(false, "should have reverted on duplicate nullifier");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes("nullifier already used"), `duplicate nullifier reverts`);
  }

  // ── Vote 2: voter[1] votes for candidate 0 ─────────────────────────────────
  console.log("\n--- Vote 2: voter[1] → candidate 0 ---");
  const sk1Bytes = hexToBytes(voterKeys[1]);
  const nullifier1 = deriveNullifier(sk1Bytes, electionIdBytes);
  const pi1 = buildPublicInputs(merkleRoot, nullifier1, 0, electionIdBytes, NUM_CANDIDATES);
  const tx2 = await managerAsVoter1.castVote(dummyProof, pi1, { nonce: vNonce1++ });
  await tx2.wait();
  assert(true, "vote 2 accepted (voter[1] → candidate 0)");

  void vNonce0; void vNonce1;

  // ── Check tally ────────────────────────────────────────────────────────────
  console.log("\n--- Checking tally ---");
  const results: bigint[] = await managerView.getResults();
  const tally = results.map(Number);
  console.log("Tally:", tally);
  assert(tally[0] === 1, "tally[0] === 1");
  assert(tally[1] === 1, "tally[1] === 1");
  assert(tally[2] === 0, "tally[2] === 0");
  assert(tally[3] === 0, "tally[3] === 0");

  console.log("\nAll e2e checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
