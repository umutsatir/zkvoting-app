import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ElectionManager, ElectionFactory } from "../typechain-types";

// Build the 67-element publicInputs array expected by ElectionManager.
// indices: [0]=merkleRoot, [1..32]=nullifier bytes, [33]=voteChoice,
//          [34..65]=electionId bytes, [66]=numCandidates
function buildPublicInputs(
  merkleRoot: string,
  nullifierBytes: number[],
  voteChoice: number,
  electionIdBytes: number[],
  numCandidates: number
): string[] {
  const inputs: string[] = new Array(67).fill(ethers.ZeroHash);
  inputs[0] = merkleRoot;
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

// Packs 32 byte values into a single bytes32 (same logic as ElectionManager._extractNullifier)
function packBytes32(bytes: number[]): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

describe("ElectionManager", function () {
  const MERKLE_ROOT = ethers.zeroPadValue("0x1234", 32);
  const ELECTION_ID_BYTES = Array(32).fill(0xde);
  const ELECTION_ID = packBytes32(ELECTION_ID_BYTES);
  const NULLIFIER_BYTES = Array.from({ length: 32 }, (_, i) => i + 1);
  const NULLIFIER_2_BYTES = Array.from({ length: 32 }, (_, i) => i + 100);
  const NUM_CANDIDATES = 3;
  const VOTE_CHOICE = 1;
  const PROOF = "0x" + "ab".repeat(128); // arbitrary non-empty bytes

  let manager: ElectionManager;
  let mockVerifierAddress: string;
  let startTime: number;
  let endTime: number;

  beforeEach(async function () {
    // Deploy a MockVerifier that always returns true
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    const mock = await MockVerifier.deploy();
    mockVerifierAddress = await mock.getAddress();

    startTime = (await time.latest()) - 60; // started 1 minute ago
    endTime = startTime + 7 * 24 * 3600; // ends in 7 days

    const ElectionManagerFactory = await ethers.getContractFactory("ElectionManager");
    manager = await ElectionManagerFactory.deploy(
      MERKLE_ROOT,
      NUM_CANDIDATES,
      startTime,
      endTime,
      mockVerifierAddress,
      ELECTION_ID
    ) as unknown as ElectionManager;
  });

  it("accepts a valid vote and increments the tally", async function () {
    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    await manager.castVote(PROOF, pi);
    const results = await manager.getResults();
    expect(results[VOTE_CHOICE]).to.equal(1n);
    expect(results[0]).to.equal(0n);
    expect(results[2]).to.equal(0n);
  });

  it("emits VoteCast with the packed nullifier and choice", async function () {
    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    const nullifierHash = packBytes32(NULLIFIER_BYTES);
    await expect(manager.castVote(PROOF, pi))
      .to.emit(manager, "VoteCast")
      .withArgs(nullifierHash, VOTE_CHOICE);
  });

  it("reverts on duplicate nullifier", async function () {
    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    await manager.castVote(PROOF, pi);
    await expect(manager.castVote(PROOF, pi)).to.be.revertedWith(
      "nullifier already used"
    );
  });

  it("reverts before election starts", async function () {
    const future = (await time.latest()) + 3600;
    const ElectionManagerFactory = await ethers.getContractFactory("ElectionManager");
    const futureManager = await ElectionManagerFactory.deploy(
      MERKLE_ROOT,
      NUM_CANDIDATES,
      future,
      future + 3600,
      mockVerifierAddress,
      ELECTION_ID
    ) as unknown as ElectionManager;

    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    await expect(futureManager.castVote(PROOF, pi)).to.be.revertedWith(
      "Election not started"
    );
  });

  it("reverts after election ends", async function () {
    await time.increaseTo(endTime + 1);
    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    await expect(manager.castVote(PROOF, pi)).to.be.revertedWith(
      "Election ended"
    );
  });

  it("reverts on wrong merkle root", async function () {
    const wrongRoot = ethers.zeroPadValue("0x9999", 32);
    const pi = buildPublicInputs(
      wrongRoot, // different from the manager's merkleRoot
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      ELECTION_ID_BYTES,
      NUM_CANDIDATES
    );
    await expect(manager.castVote(PROOF, pi)).to.be.revertedWith(
      "merkle root mismatch"
    );
  });

  it("reverts on wrong election id", async function () {
    const wrongId = Array(32).fill(0xaa);
    const pi = buildPublicInputs(
      MERKLE_ROOT,
      NULLIFIER_BYTES,
      VOTE_CHOICE,
      wrongId,
      NUM_CANDIDATES
    );
    await expect(manager.castVote(PROOF, pi)).to.be.revertedWith(
      "election id mismatch"
    );
  });

  it("tracks tally correctly across multiple votes", async function () {
    const pi0 = buildPublicInputs(MERKLE_ROOT, NULLIFIER_BYTES, 0, ELECTION_ID_BYTES, NUM_CANDIDATES);
    const pi1 = buildPublicInputs(MERKLE_ROOT, NULLIFIER_2_BYTES, 1, ELECTION_ID_BYTES, NUM_CANDIDATES);

    await manager.castVote(PROOF, pi0);
    await manager.castVote(PROOF, pi1);

    const results = await manager.getResults();
    expect(results[0]).to.equal(1n);
    expect(results[1]).to.equal(1n);
    expect(results[2]).to.equal(0n);
  });

  it("getElectionInfo returns correct parameters", async function () {
    const info = await manager.getElectionInfo();
    expect(info.root).to.equal(MERKLE_ROOT);
    expect(info.candidates).to.equal(NUM_CANDIDATES);
    expect(info.start).to.equal(BigInt(startTime));
    expect(info.end).to.equal(BigInt(endTime));
    expect(info.id).to.equal(ELECTION_ID);
  });
});

describe("ElectionFactory", function () {
  it("creates elections and returns their addresses", async function () {
    const Factory = await ethers.getContractFactory("ElectionFactory");
    const factory = await Factory.deploy() as unknown as ElectionFactory;

    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    const mock = await MockVerifier.deploy();
    const verifierAddr = await mock.getAddress();

    const merkleRoot = ethers.zeroPadValue("0xaabb", 32);
    const electionId = ethers.zeroPadValue("0xccdd", 32);
    const now = await time.latest();

    await factory.createElection(merkleRoot, 2, now - 10, now + 3600, verifierAddr, electionId);
    await factory.createElection(merkleRoot, 3, now - 10, now + 7200, verifierAddr, electionId);

    const elections = await factory.getElections();
    expect(elections.length).to.equal(2);
    expect(ethers.isAddress(elections[0])).to.be.true;
    expect(ethers.isAddress(elections[1])).to.be.true;
    expect(elections[0]).to.not.equal(elections[1]);
  });
});
