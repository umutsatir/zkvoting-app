import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { electionFactoryAbi, electionManagerAbi, FACTORY_ADDRESS } from "../lib/contracts";
import CreateElectionModal from "../components/CreateElectionModal";
import type { Address } from "viem";

function ElectionCard({ addr, index }: { addr: string; index: number }) {
  const { data: info } = useReadContract({
    address: addr as Address,
    abi: electionManagerAbi,
    functionName: "getElectionInfo",
  });

  // tuple: [root, candidates, start, end, id]
  const now = Math.floor(Date.now() / 1000);
  const start = info ? Number(info[2]) : 0;
  const end = info ? Number(info[3]) : 0;
  const electionId = info ? (info[4] as string) : null;

  const names: Record<string, string> = JSON.parse(localStorage.getItem("zkvoting:names") ?? "{}");
  const displayName = (electionId && names[electionId]) ? names[electionId] : `Election #${index + 1}`;

  const activeStatus =
    !info ? "" :
    now < start ? "Upcoming" :
    now > end ? "Ended" : "Active";

  const statusStyle =
    activeStatus === "Active"
      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
      : activeStatus === "Ended"
      ? "bg-gray-500/15 text-gray-400 border border-gray-500/20"
      : "bg-amber-500/15 text-amber-400 border border-amber-500/20";

  return (
    <li>
      <Link
        to={`/election/${addr}`}
        className="flex items-center justify-between card px-5 py-4 hover:bg-white/10 hover:border-violet-500/40 transition-all group"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="font-semibold text-gray-100">{displayName}</span>
            {activeStatus && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>
                {activeStatus}
              </span>
            )}
          </div>
          <span className="font-mono text-xs text-gray-500 truncate block">{addr}</span>
        </div>
        <span className="text-violet-400 text-sm ml-4 shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
      </Link>
    </li>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [showModal, setShowModal] = useState(false);

  const { data: elections, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: electionFactoryAbi,
    functionName: "getElections",
    query: { enabled: !!FACTORY_ADDRESS },
  });

  const list = (elections as string[] | undefined) ?? [];

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-violet-950/20 via-transparent to-indigo-950/20 pointer-events-none" />

      <header className="relative bg-[#0f1117]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold">
            ZK
          </div>
          <span className="text-lg font-bold text-white">ZK Voting</span>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-sm text-gray-300 font-mono">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
            </div>
            <button onClick={() => disconnect()} className="btn-secondary text-xs py-1.5 px-3">
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={() => connect({ connector: metaMask() })} className="btn-primary">
            Connect Wallet
          </button>
        )}
      </header>

      <main className="relative max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Elections</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {list.length} election{list.length !== 1 ? "s" : ""} on Sepolia
            </p>
          </div>
          {isConnected && (
            <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
              + New Election
            </button>
          )}
        </div>

        {!FACTORY_ADDRESS ? (
          <div className="card p-4 text-sm text-amber-400 border-amber-500/20">
            No deployment found. Deploy contracts first and update{" "}
            <code className="font-mono text-amber-300">src/assets/deployments.json</code>.
          </div>
        ) : list.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-3xl mb-3">🗳️</p>
            <p className="text-gray-400 text-sm">No elections yet. Create one to get started.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((addr, i) => (
              <ElectionCard key={addr} addr={addr} index={i} />
            ))}
          </ul>
        )}
      </main>

      {showModal && (
        <CreateElectionModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
