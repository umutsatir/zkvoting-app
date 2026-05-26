import { useParams, Link } from "react-router-dom";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { electionManagerAbi } from "../lib/contracts";
import ResultsChart from "../components/ResultsChart";
import VotePanel from "../components/VotePanel";

function loadCandidateNames(electionId: string): string[] {
  try {
    const raw = localStorage.getItem(`election_names_${electionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadVoterAddresses(electionId: string): Address[] {
  try {
    const raw = localStorage.getItem(`election_voters_${electionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

export default function Election() {
  const { address } = useParams<{ address: string }>();
  const electionAddress = address as Address;

  const { data: info, isLoading } = useReadContract({
    address: electionAddress,
    abi: electionManagerAbi,
    functionName: "getElectionInfo",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          Loading election...
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <p className="text-red-400">Could not load election data.</p>
      </div>
    );
  }

  const [root, candidates, startTime, endTime, electionId] = info as [
    `0x${string}`,
    number,
    bigint,
    bigint,
    `0x${string}`
  ];

  const now = Math.floor(Date.now() / 1000);
  const startTs = Number(startTime);
  const endTs = Number(endTime);
  const isActive = now >= startTs && now < endTs;
  const hasStarted = now >= startTs;
  const secondsLeft = endTs - now;

  const candidateNames = loadCandidateNames(electionId);
  const voterAddresses = loadVoterAddresses(electionId);
  const numCandidates = Number(candidates);

  const names: Record<string, string> = JSON.parse(localStorage.getItem("zkvoting:names") ?? "{}");
  const electionName = names[electionId] ?? "Election";

  const displayNames = candidateNames.length >= numCandidates
    ? candidateNames.slice(0, numCandidates)
    : Array.from({ length: numCandidates }, (_, i) => candidateNames[i] ?? `Candidate ${i + 1}`);

  const statusLabel = isActive ? "Active" : hasStarted ? "Ended" : "Upcoming";
  const statusStyle = isActive
    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
    : hasStarted
    ? "bg-gray-500/15 text-gray-400 border border-gray-500/20"
    : "bg-amber-500/15 text-amber-400 border border-amber-500/20";

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="fixed inset-0 bg-gradient-to-br from-violet-950/20 via-transparent to-indigo-950/20 pointer-events-none" />

      <header className="relative bg-[#0f1117]/80 backdrop-blur-md px-6 py-4 flex items-center gap-4 border-b border-white/[0.04]">
        <Link to="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
          ← Back
        </Link>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold">
            ZK
          </div>
          <span className="text-lg font-bold text-white">ZK Voting</span>
        </div>
      </header>

      <main className="relative max-w-2xl mx-auto px-4 py-10 space-y-5">
        {/* Election info card */}
        <div className="card p-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-xl font-bold text-white">{electionName}</h1>
              <p className="font-mono text-xs text-gray-500 mt-1 break-all">{electionAddress}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-3 ${statusStyle}`}>
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>{numCandidates} candidate{numCandidates !== 1 ? "s" : ""}</span>
            <span className="text-white/10">·</span>
            <span>
              {isActive
                ? `Closes in ${formatCountdown(secondsLeft)}`
                : hasStarted
                ? `Ended ${new Date(endTs * 1000).toLocaleString()}`
                : `Opens ${new Date(startTs * 1000).toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="card p-5">
          <ResultsChart address={electionAddress} candidateNames={displayNames} />
        </div>

        {/* Vote panel */}
        {isActive && (
          <VotePanel
            electionAddress={electionAddress}
            electionId={electionId}
            merkleRoot={root}
            numCandidates={numCandidates}
            candidateNames={displayNames}
            voterAddresses={voterAddresses}
          />
        )}
      </main>
    </div>
  );
}
