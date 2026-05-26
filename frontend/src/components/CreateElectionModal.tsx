import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { encodeAbiParameters, keccak256, toBytes, type Address } from "viem";
import { electionFactoryAbi, FACTORY_ADDRESS, VERIFIER_ADDRESS } from "../lib/contracts";
import { computeMerkleRoot } from "../lib/merkle";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateElectionModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState(["", "", "", ""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [voterList, setVoterList] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && txHash) onCreated();
  }, [isSuccess, txHash]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const addresses = voterList
        .split(/[\n,]+/)
        .map((a) => a.trim())
        .filter((a) => a.startsWith("0x") && a.length === 42) as Address[];

      if (addresses.length === 0) {
        setStatus("Enter at least one voter address.");
        setLoading(false);
        return;
      }

      const filledCandidates = candidates.filter((c) => c.trim() !== "");
      if (filledCandidates.length < 1) {
        setStatus("Enter at least one candidate name.");
        setLoading(false);
        return;
      }

      setStatus("Building Merkle tree…");
      const merkleRoot = await computeMerkleRoot(addresses);

      const startTs = BigInt(Math.floor(new Date(startDate).getTime() / 1000));
      const endTs = BigInt(Math.floor(new Date(endDate).getTime() / 1000));

      const electionId = keccak256(
        encodeAbiParameters(
          [{ type: "string" }, { type: "uint256" }],
          [name, startTs]
        )
      );

      // Persist metadata locally
      const stored = JSON.parse(localStorage.getItem("zkvoting:names") ?? "{}");
      stored[electionId] = name;
      localStorage.setItem("zkvoting:names", JSON.stringify(stored));
      localStorage.setItem(`election_voters_${electionId}`, JSON.stringify(addresses));
      localStorage.setItem(`election_names_${electionId}`, JSON.stringify(filledCandidates));

      setStatus("Sending transaction…");
      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: electionFactoryAbi,
        functionName: "createElection",
        args: [
          merkleRoot as `0x${string}`,
          filledCandidates.length as unknown as number,
          startTs,
          endTs,
          VERIFIER_ADDRESS,
          electionId,
        ],
      });
      setTxHash(hash);
      setStatus("Waiting for confirmation…");
    } catch (err: unknown) {
      setStatus("Error: " + (err instanceof Error ? err.message : String(err)));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#16181f] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-white">Create Election</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Election Name
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Student Council 2026"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Candidates (up to 4)
            </label>
            <div className="space-y-1.5">
              {candidates.map((c, i) => (
                <input
                  key={i}
                  className="input"
                  value={c}
                  onChange={(e) => {
                    const next = [...candidates];
                    next[i] = e.target.value;
                    setCandidates(next);
                  }}
                  placeholder={`Candidate ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Start</label>
              <input type="datetime-local" className="input" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">End</label>
              <input type="datetime-local" className="input" value={endDate}
                onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Voter Addresses
            </label>
            <textarea
              className="input h-28 resize-none font-mono text-xs"
              value={voterList}
              onChange={(e) => setVoterList(e.target.value)}
              placeholder={"0xAbc...\n0xDef..."}
              required
            />
            <p className="text-xs text-gray-600 mt-1">One per line or comma-separated</p>
          </div>

          {status && (
            <p className={`text-sm ${status.startsWith("Error") ? "text-red-400" : "text-violet-400"}`}>
              {status}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating…" : "Create Election"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
