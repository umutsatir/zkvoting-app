import { useReadContract } from "wagmi";
import { electionManagerAbi } from "../lib/contracts";
import type { Address } from "viem";

const COLORS = [
  "from-violet-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

interface Props {
  address: Address;
  candidateNames: string[];
}

export default function ResultsChart({ address, candidateNames }: Props) {
  const { data: tally } = useReadContract({
    address,
    abi: electionManagerAbi,
    functionName: "getResults",
    query: { refetchInterval: 10_000 },
  });

  const counts = tally ? (tally as readonly bigint[]).map(Number) : Array(4).fill(0);
  const total = counts.reduce((a, b) => a + b, 0);
  const names = candidateNames.length > 0 ? candidateNames : ["A", "B", "C", "D"];
  const max = Math.max(...counts, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Live Results</h3>
        <span className="text-xs text-gray-500">{total} vote{total !== 1 ? "s" : ""} total</span>
      </div>

      <div className="space-y-3">
        {names.map((name, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
          const barWidth = max > 0 ? (counts[i] / max) * 100 : 0;
          const isLeading = counts[i] === max && total > 0 && counts.filter(c => c === max).length === 1;
          return (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${COLORS[i % COLORS.length]}`} />
                  <span className={isLeading ? "text-white font-medium" : "text-gray-300"}>{name}</span>
                  {isLeading && total > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      Leading
                    </span>
                  )}
                </div>
                <span className="text-gray-400 font-mono text-xs">
                  {counts[i]} <span className="text-gray-600">({pct}%)</span>
                </span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className={`bg-gradient-to-r ${COLORS[i % COLORS.length]} h-2 rounded-full transition-all duration-700`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-600">Refreshes every 10s</p>
    </div>
  );
}
