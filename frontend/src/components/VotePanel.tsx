import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toBytes, type Address } from "viem";
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

const STEPS = [
  { key: "building_tree", label: "Building Merkle tree" },
  { key: "proving",       label: "Generating ZK proof" },
  { key: "sending",       label: "Sending transaction" },
  { key: "waiting",       label: "Waiting for confirmation" },
];

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
      const skHex = (privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey).trim();
      if (skHex.length !== 64) {
        setStatus({ state: "error", message: "Private key must be 32 bytes (64 hex chars)." });
        return;
      }
      const skBytes = Array.from(toBytes("0x" + skHex));

      const pubKey = secp256k1.getPublicKey(BigInt("0x" + skHex), false);
      const pk_x = Array.from(pubKey.slice(1, 33));
      const pk_y = Array.from(pubKey.slice(33, 65));

      const electionIdBytes = Array.from(toBytes(electionId as `0x${string}`, { size: 32 }));

      const { blake2s } = await import("@noble/hashes/blake2s");
      const msgHash = blake2s(new Uint8Array(electionIdBytes), { dkLen: 32 });
      const sig = secp256k1.sign(msgHash, BigInt("0x" + skHex), { lowS: true });
      const ecdsa_sig = Array.from(sig.toCompactRawBytes());

      const preimage = new Uint8Array([...skBytes, ...electionIdBytes]);
      const nullifier = Array.from(blake2s(preimage, { dkLen: 32 }));

      setStatus({ state: "building_tree" });
      const { tree } = await buildMerkleTree(voterAddresses);
      const voterProof = await getVoterProof(tree, voterAddresses, connectedAddress as Address);
      if (!voterProof) {
        setStatus({ state: "error", message: "Your address is not in the registered voter list." });
        return;
      }

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
  const currentStepIndex = STEPS.findIndex(s => s.key === status.state);

  return (
    <div className="card p-5 space-y-5">
      <h3 className="font-semibold text-lg text-white">Cast Your Vote</h3>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
        <strong>Demo only</strong> — never enter a real private key holding funds.
        The proof is generated entirely in your browser; the key never leaves your device.
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Private Key</label>
        <input
          type="password"
          className="input font-mono"
          placeholder="With or without 0x prefix"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value.trim())}
          disabled={isLoading}
        />
        <p className="text-xs text-gray-600">
          Must correspond to a registered voter address connected in MetaMask.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Candidate</label>
        {candidateNames.slice(0, numCandidates).map((name, i) => (
          <label
            key={i}
            className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedChoice === i
                ? "border-violet-500/40 bg-violet-500/10 text-white"
                : "border-white/[0.06] bg-white/[0.02] text-gray-300 hover:border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              selectedChoice === i ? "border-violet-500 bg-violet-500" : "border-gray-600"
            }`}>
              {selectedChoice === i && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <input
              type="radio"
              name="candidate"
              value={i}
              checked={selectedChoice === i}
              onChange={() => setSelectedChoice(i)}
              disabled={isLoading}
              className="sr-only"
            />
            <span className="font-medium text-sm">{name || `Candidate ${i + 1}`}</span>
          </label>
        ))}
      </div>

      {/* Progress steps */}
      {isLoading && (
        <div className="space-y-2">
          {STEPS.map((step, i) => {
            const done = i < currentStepIndex;
            const active = i === currentStepIndex;
            return (
              <div key={step.key} className={`flex items-center gap-2.5 text-sm transition-opacity ${
                done || active ? "opacity-100" : "opacity-25"
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  done ? "bg-emerald-500 text-white" :
                  active ? "bg-violet-500 text-white" :
                  "bg-white/10 text-gray-500"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <span className={active ? "text-violet-300" : done ? "text-emerald-400" : "text-gray-500"}>
                  {step.label}
                  {active && step.key === "proving" && " (~10–30s)"}
                  {active && <span className="ml-1 animate-pulse">…</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {status.state === "success" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-400">
          Vote cast successfully!{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${status.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-xs break-all"
          >
            {status.txHash.slice(0, 10)}…{status.txHash.slice(-6)}
          </a>
        </div>
      )}

      {status.state === "error" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 break-words">
          {status.message}
        </div>
      )}

      <button
        onClick={handleVote}
        disabled={isLoading || selectedChoice === null || status.state === "success"}
        className="btn-primary w-full"
      >
        {isLoading ? "Processing…" : "Generate Proof & Vote"}
      </button>
    </div>
  );
}
