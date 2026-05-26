import { useParams, Link } from "react-router-dom";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { electionManagerAbi } from "../lib/contracts";
import ResultsChart from "../components/ResultsChart";
import VotePanel from "../components/VotePanel";

// Candidate names aren't stored on-chain in this design.
// In a real app you'd store them in an event or off-chain index.
// Here we fall back to generic names — the ElectionPage can be extended
// to accept names stored in localStorage keyed by electionId.
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading election...</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Could not load election data.</p>
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
  const displayNames = candidateNames.length >= numCandidates
    ? candidateNames.slice(0, numCandidates)
    : Array.from({ length: numCandidates }, (_, i) => candidateNames[i] ?? `Candidate ${i + 1}`);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-indigo-600 hover:underline text-sm">← Back</Link>
        <h1 className="text-xl font-bold text-indigo-700">Election</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Election info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-400 font-mono break-all">{electionAddress}</p>
              <p className="text-sm mt-1">
                <span className="font-medium">{numCandidates}</span> candidate{numCandidates !== 1 ? "s" : ""}
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                isActive
                  ? "bg-green-100 text-green-700"
                  : hasStarted
                  ? "bg-gray-100 text-gray-600"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {isActive ? "Active" : hasStarted ? "Ended" : "Upcoming"}
            </span>
          </div>

          <p className="text-sm text-gray-600">
            {hasStarted
              ? isActive
                ? `Closes in ${formatCountdown(secondsLeft)}`
                : `Ended ${new Date(endTs * 1000).toLocaleString()}`
              : `Opens ${new Date(startTs * 1000).toLocaleString()}`}
          </p>
        </div>

        {/* Results */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
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
