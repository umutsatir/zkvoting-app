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

  const statusColor =
    activeStatus === "Active" ? "text-green-600" :
    activeStatus === "Ended" ? "text-gray-400" :
    "text-amber-600";

  return (
    <li>
      <Link
        to={`/election/${addr}`}
        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{displayName}</span>
            {activeStatus && <span className={`text-xs font-medium ${statusColor}`}>{activeStatus}</span>}
          </div>
          <span className="font-mono text-xs text-gray-400 truncate block">{addr}</span>
        </div>
        <span className="text-indigo-600 text-sm ml-4 shrink-0">View →</span>
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-700">ZK Voting</h1>
        {isConnected ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button onClick={() => disconnect()} className="btn-secondary text-sm">
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={() => connect({ connector: metaMask() })} className="btn-primary">
            Connect Wallet
          </button>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Active Elections</h2>
          {isConnected && (
            <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
              + Create Election
            </button>
          )}
        </div>

        {!FACTORY_ADDRESS ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            No deployment found. Deploy contracts to Sepolia first and update{" "}
            <code>src/assets/deployments.json</code>.
          </div>
        ) : list.length === 0 ? (
          <p className="text-gray-500 text-sm">No elections found. Create one to get started.</p>
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
