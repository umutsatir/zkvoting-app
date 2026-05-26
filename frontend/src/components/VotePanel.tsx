import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toBytes, bytesToHex, type Address } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";
import { generateVoteProof } from "../lib/prover";
import { buildMerkleTree, getVoterProof } from "../lib/merkle";
import { electionManagerAbi } from "../lib/contracts";

interface Props {
  electionAddress: Address;
  electionId: `0x${string}`;
  merkleRoot: `0x${string}`;
  numCandidates: number;
  candidateNames: string[];
  voterAddresses: Address[];
}

type ProofStatus =
  | { state: "idle" }
  | { state: "building_tree" }
  | { state: "proving" }
  | { state: "sending" }
  | { state: "waiting" }
  | { state: "success"; txHash: `0x${string}` }
  | { state: "error"; message: string };

export default function VotePanel({
  electionAddress,
  electionId,
  merkleRoot,
  numCandidates,
  candidateNames,
  voterAddresses,
}: Props) {
  const { address: connectedAddress } = useAccount();
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [status, setStatus] = useState<ProofStatus>({ state: "idle" });

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && status.state === "waiting" && txHash) {
      setStatus({ state: "success", txHash });
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVote = async () => {
    if (selectedChoice === null) return;
    if (!privateKey || privateKey.length < 10) {
      setStatus({ state: "error", message: "Enter a private key." });
      return;
    }

    if (!connectedAddress) {
      setStatus({ state: "error", message: "Connect your wallet first." });
      return;
    }

    try {
      // Parse private key
      const skHex = (privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey).trim();
      if (skHex.length !== 64) {
        setStatus({ state: "error", message: "Private key must be 32 bytes (64 hex chars)." });
        return;
      }
      const skBytes = Array.from(toBytes("0x" + skHex));

      // Derive public key (uncompressed, skip 0x04 prefix)
      const pubKey = secp256k1.getPublicKey(BigInt("0x" + skHex), false);
      const pk_x = Array.from(pubKey.slice(1, 33));
      const pk_y = Array.from(pubKey.slice(33, 65));

      // election_id as [u8; 32]
      const electionIdBytes = Array.from(toBytes(electionId as `0x${string}`, { size: 32 }));

      // ECDSA signature over blake2s(election_id)
      // We can't call blake2s from JS directly, but we can use a hash of election_id.
      // For the circuit: msg_hash = std::hash::blake2s(election_id)
      // We approximate blake2s with a noble-hashes import:
      const { blake2s } = await import("@noble/hashes/blake2s");
      const msgHash = blake2s(new Uint8Array(electionIdBytes), { dkLen: 32 });
      const sig = secp256k1.sign(msgHash, BigInt("0x" + skHex), { lowS: true });
      const ecdsa_sig = Array.from(sig.toCompactRawBytes());

      // Nullifier = blake2s(sk_bytes || election_id)
      const preimage = new Uint8Array([...skBytes, ...electionIdBytes]);
      const nullifier = Array.from(blake2s(preimage, { dkLen: 32 }));

      // Build Merkle tree and find voter
      setStatus({ state: "building_tree" });
      const { tree } = await buildMerkleTree(voterAddresses);
      const voterProof = await getVoterProof(tree, voterAddresses, connectedAddress as Address);
      if (!voterProof) {
        setStatus({ state: "error", message: "Your address is not in the registered voter list." });
        return;
      }

      // Generate ZK proof
      setStatus({ state: "proving" });
      const { proof, publicInputs } = await generateVoteProof({
        merkle_root: merkleRoot,
        nullifier,
        vote_choice: selectedChoice.toString(),
        election_id: electionIdBytes,
        num_candidates: numCandidates.toString(),
        sk_bytes: skBytes,
        pk_x,
        pk_y,
        ecdsa_sig,
        merkle_path: voterProof.path,
        merkle_indices: voterProof.indices,
      });

      // Send transaction
      setStatus({ state: "sending" });
      const hash = await writeContractAsync({
        address: electionAddress,
        abi: electionManagerAbi,
        functionName: "castVote",
        args: [proof, publicInputs],
      });
      setTxHash(hash);
      setStatus({ state: "waiting" });
    } catch (err: unknown) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const isLoading = ["building_tree", "proving", "sending", "waiting"].includes(status.state);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-lg">Cast Your Vote</h3>

      {/* Private key — demo only */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>Demo only</strong> — never enter a real private key holding funds.
        This is used only to generate the ZK proof locally; it never leaves your browser.
      </div>
      <input
        type="password"
        className="input font-mono"
        placeholder="Private key — with or without 0x prefix"
        value={privateKey}
        onChange={(e) => setPrivateKey(e.target.value.trim())}
        disabled={isLoading}
      />
      <p className="text-xs text-gray-500">
        64 hex characters, with or without <code>0x</code> prefix. Must correspond to a registered voter address.
      </p>

      {/* Candidate selection */}
      <div className="space-y-2">
        {candidateNames.slice(0, numCandidates).map((name, i) => (
          <label
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedChoice === i
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="candidate"
              value={i}
              checked={selectedChoice === i}
              onChange={() => setSelectedChoice(i)}
              disabled={isLoading}
              className="accent-indigo-600"
            />
            <span className="font-medium">{name || `Candidate ${i + 1}`}</span>
          </label>
        ))}
      </div>

      {/* Status messages */}
      {status.state === "building_tree" && (
        <p className="text-sm text-blue-600 animate-pulse">Building Merkle tree...</p>
      )}
      {status.state === "proving" && (
        <p className="text-sm text-blue-600 animate-pulse">
          Generating ZK proof... (~10–30 seconds)
        </p>
      )}
      {status.state === "sending" && (
        <p className="text-sm text-blue-600 animate-pulse">Sending transaction...</p>
      )}
      {status.state === "waiting" && (
        <p className="text-sm text-blue-600 animate-pulse">Waiting for confirmation...</p>
      )}
      {status.state === "success" && (
        <p className="text-sm text-green-600">
          Vote cast! Tx:{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${status.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {status.txHash}
          </a>
        </p>
      )}
      {status.state === "error" && (
        <p className="text-sm text-red-600">{status.message}</p>
      )}

      <button
        onClick={handleVote}
        disabled={isLoading || selectedChoice === null || status.state === "success"}
        className="btn-primary w-full"
      >
        {isLoading ? "Processing..." : "Generate Proof & Vote"}
      </button>
    </div>
  );
}
