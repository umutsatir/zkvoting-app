import type { Address } from "viem";
import deployments from "../assets/deployments.json";

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const electionManagerAbi = [
  {
    inputs: [
      { name: "_merkleRoot", type: "bytes32" },
      { name: "_numCandidates", type: "uint8" },
      { name: "_startTime", type: "uint256" },
      { name: "_endTime", type: "uint256" },
      { name: "_verifier", type: "address" },
      { name: "_electionId", type: "bytes32" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "nullifier", type: "bytes32" },
      { indexed: true, name: "choice", type: "uint8" },
    ],
    name: "VoteCast",
    type: "event",
  },
  {
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
    ],
    name: "castVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getElectionInfo",
    outputs: [
      { name: "root", type: "bytes32" },
      { name: "candidates", type: "uint8" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
      { name: "id", type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getResults",
    outputs: [{ name: "", type: "uint256[4]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "usedNullifiers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const electionFactoryAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "election", type: "address" },
      { indexed: true, name: "electionId", type: "bytes32" },
    ],
    name: "ElectionCreated",
    type: "event",
  },
  {
    inputs: [
      { name: "merkleRoot", type: "bytes32" },
      { name: "numCandidates", type: "uint8" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "verifier", type: "address" },
      { name: "electionId", type: "bytes32" },
    ],
    name: "createElection",
    outputs: [{ name: "addr", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getElections",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Deployed addresses (populated after `npm run deploy:sepolia`) ─────────────

export const FACTORY_ADDRESS = deployments.contracts.ElectionFactory as Address;
export const VERIFIER_ADDRESS = deployments.contracts.HonkVerifier as Address;
