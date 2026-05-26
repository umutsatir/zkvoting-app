import { useReadContract } from "wagmi";
import { electionManagerAbi } from "../lib/contracts";
import type { Address } from "viem";

interface Props {
  address: Address;
  candidateNames: string[];
}

export default function ResultsChart({ address, candidateNames }: Props) {
  const { data: tally } = useReadContract({
    address,
    abi: electionManagerAbi,
    functionName: "getResults",
    query: {
      refetchInterval: 10_000, // refresh every 10 s
    },
  });

  const counts = tally ? (tally as readonly bigint[]).map(Number) : Array(4).fill(0);
  const total = counts.reduce((a, b) => a + b, 0);
  const names = candidateNames.length > 0 ? candidateNames : ["A", "B", "C", "D"];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg">Live Results</h3>
      {names.map((name, i) => {
        const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span>{name}</span>
              <span>{counts[i]} vote{counts[i] !== 1 ? "s" : ""} ({pct}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-indigo-500 h-4 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-400 mt-1">Total: {total} vote{total !== 1 ? "s" : ""} — refreshes every 10 s</p>
    </div>
  );
}
