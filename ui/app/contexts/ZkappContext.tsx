'use client';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import ZkappWorkerClient from '../ZkappWorkerClient';

interface VoteCounts {
  alice: number;
  bob: number;
}

interface ZkappContextType {
  zkappWorkerClient: ZkappWorkerClient | null;
  zkAppAddress: string | null;
  isWorkerReady: boolean;
  isCompiling: boolean;
  status: string;
  logs: string[];
  resultsRoot: string | null;
  localResultsRoot: string | null;
  voteCounts: VoteCounts;
  hasVoted: boolean;
  hasCompiled: boolean;
  lastVoteProof: any | null;
  
  // Actions
  loadWorker: () => Promise<void>;
  compileAndInit: (address: string) => Promise<void>;
  compile: () => Promise<void>; // Explicit compile action
  deployContract: (walletKey: string) => Promise<string | null>;
  fetchAccount: (address: string) => Promise<any>;
  connect: (address: string) => Promise<void>;
  castVote: (candidateId: number, name: string) => Promise<void>;
  processAggregation: () => Promise<void>;
  fetchPendingVotes: () => Promise<any[]>;
  
  // Setters (if needed directly, otherwise handled by actions)
  setZkAppAddress: (addr: string | null) => void;
  addLog: (msg: string) => void;
}

const ZkappContext = createContext<ZkappContextType | null>(null);

export function ZkappProvider({ children }: { children: ReactNode }) {
  const [zkappWorkerClient, setZkappWorkerClient] = useState<null | ZkappWorkerClient>(null);
  const [zkAppAddress, setZkAppAddress] = useState<string | null>(null);
  const [isWorkerReady, setIsWorkerReady] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Initializing...");
  const [logs, setLogs] = useState<string[]>([]);
  const [resultsRoot, setResultsRoot] = useState<string | null>(null);
  const [localResultsRoot, setLocalResultsRoot] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({ alice: 0, bob: 0 });
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [lastVoteProof, setLastVoteProof] = useState<any | null>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  }, []);

  // 1. Initialize Worker
  const loadWorker = useCallback(async () => {
      if (zkappWorkerClient) return;
      
      setStatus("Loading Worker...");
      const client = new ZkappWorkerClient();
      setZkappWorkerClient(client);

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await client.setActiveInstanceToDevnet();
      await client.loadContract();
      
      setIsWorkerReady(true);
      setStatus("Worker Ready");
      addLog("Worker loaded and contracts imported.");
  }, [zkappWorkerClient, addLog]);

  // 1b. Lazy Compilation state
  const [hasCompiled, setHasCompiled] = useState<boolean>(false);

  const compile = useCallback(async () => {
    if (!zkappWorkerClient || hasCompiled) return;
    
    setStatus("Compiling...");
    setIsCompiling(true);
    try {
        addLog("Compiling circuits (Heavy Load)...");
        await zkappWorkerClient.compileContract();
        addLog("Compilation complete.");
        setHasCompiled(true);
        setStatus("Connected");
    } catch (e: any) {
        console.error(e);
        setStatus("Compilation Failed");
        addLog(`Error: ${e.message}`);
    } finally {
        setIsCompiling(false);
    }
  }, [zkappWorkerClient, hasCompiled, addLog]);

  useEffect(() => {
     loadWorker();
  }, [loadWorker]);

  // Helper: Save to local storage
  const saveContractAddress = (address: string) => {
      const saved = localStorage.getItem('zkvoting-contracts');
      let contracts = saved ? JSON.parse(saved) : [];
      if (!contracts.includes(address)) {
          contracts = [address, ...contracts].slice(0, 5);
          localStorage.setItem('zkvoting-contracts', JSON.stringify(contracts));
      }
  };

  const refreshState = async (client: ZkappWorkerClient, address: string) => {
      const root = await client.getResultsRoot();
      setResultsRoot(root);

      try {
          const compiled = await client.getIsCompiled();
          setHasCompiled(compiled);
      } catch (e) {
          console.warn("Could not fetch compiled status", e);
      }

      try {
        const local = await client.getLocalResultsRoot();
        setLocalResultsRoot(local);
        
        // Determine sync status for vote counts
        const isSynced = root === local; 
        const counts = await client.getVoteCounts(isSynced);
        setVoteCounts(counts);
        
        // Save newest counts to persist (Mock Indexer)
        if (counts) {
            localStorage.setItem(`zkvoting-counts-${address}`, JSON.stringify(counts));
        }
      } catch (e) {
          console.warn("Could not fetch local root or counts", e);
      }
  };

  const connect = useCallback(async (address: string) => {
      if (!zkappWorkerClient) return;
      
      setStatus("Connecting...");
      setIsCompiling(true);
      try {
          await zkappWorkerClient.initZkappInstance(address);
          
          // Restore State from Local Storage (Mock Indexer)
          const savedCounts = localStorage.getItem(`zkvoting-counts-${address}`);
          if (savedCounts) {
              const { alice, bob } = JSON.parse(savedCounts);
              await zkappWorkerClient.restoreState(alice, bob);
              addLog(`Restored state: Alice ${alice}, Bob ${bob}`);
          }
          
          // Restore Pending Votes (Mock DA Layer)
          const savedPending = localStorage.getItem(`zkvoting-pending-${address}`);
          if (savedPending) {
               try {
                   const pending = JSON.parse(savedPending);
                   // Note: BigInts are strings here. restorePendingVotes in client/worker needs to handle this.
                   if(pending.length > 0) {
                       await zkappWorkerClient.restorePendingVotes(pending);
                       addLog(`Restored ${pending.length} pending votes.`);
                   }
               } catch(e) { console.error("Failed to parse pending votes", e); }
          }
          
          const res = await zkappWorkerClient.fetchAccount(address);
          if (res.error) throw new Error(JSON.stringify(res.error));
          
          setZkAppAddress(address);
          saveContractAddress(address);
          await refreshState(zkappWorkerClient, address);
          
          setStatus("Connected");
          addLog(`Connected to ${address.slice(0,8)}...`);
      } catch (e: any) {
          console.error(e);
          setStatus("Connection Failed");
          addLog(`Error: ${e.message}`);
          throw e;
      } finally {
          setIsCompiling(false);
      }
  }, [zkappWorkerClient, addLog]);

  const compileAndInit = useCallback(async (address: string) => {
      if (!zkappWorkerClient) return;
      
      setStatus("Compiling...");
      setIsCompiling(true);
      try {
          addLog("Compiling circuits (this may take a while)...");
          await zkappWorkerClient.compileContract();
          addLog("Compilation complete.");
          setHasCompiled(true); // <--- Fix: Mark as compiled
          
          await connect(address);
      } catch (e: any) {
          console.error(e);
          setStatus("Compilation/Connection Failed");
          addLog(`Error: ${e.message}`);
      } finally {
          setIsCompiling(false);
      }
  }, [zkappWorkerClient, connect, addLog]);

  const deployContract = useCallback(async (walletKey: string) => {
      if (!zkappWorkerClient) return null;
      
      setStatus("Deploying...");
      setIsCompiling(true);
      try {
          addLog("Compiling before deployment...");
          await zkappWorkerClient.compileContract();
          setHasCompiled(true); // <--- Fix: Mark as compiled
          
          addLog("Generating deployment transaction...");
          const { transaction, zkAppAddress: newAddr } = await zkappWorkerClient.createDeployTransaction(walletKey);
          
          // We return the transaction to be signed by the caller (page logic)
          // Actually, we can just return the details and let the component handle the wallet signing 
          // OR handle it here if we pass the mina object.
          // Let's keep the mina object usage in the component or pass it in? 
          // Since usage of 'window.mina' is checking for the extension, it is side-effecty.
          // Better to return the transaction JSON and let component sign it.
          
          // But wait, the component needs to sign it.
          // Let's do the signing in the component for now to keep Context pure of UI-specific wallet interaction if possible, 
          // BUT for convenience, let's just return the necessary data.
          
          return JSON.stringify({ transaction, newAddr }); 
          // Actually, let's just return the transaction object and address directly?
          // The previous code returned { transaction, zkAppAddress }
          
      } catch (e: any) {
          console.error(e);
          setStatus("Deployment Failed");
          addLog(`Error: ${e.message}`);
          return null;
      } finally {
          setIsCompiling(false);
      }
  }, [zkappWorkerClient, addLog]);
  
  // ... We can add castVote and processAggregation here similar to page.tsx
  
  const castVote = useCallback(async (candidateId: number, name: string) => {
      if (!zkappWorkerClient || !zkAppAddress) return;
      
      setStatus(`Voting for ${name}...`);
      try {
          const proofJSON = await zkappWorkerClient.castVote(candidateId);
          setLastVoteProof(proofJSON);
          setHasVoted(true);
          setStatus("Proof Submitted");
          addLog(`Vote processed for ${name}.`);
          
          // Save Pending Votes to LocalStorage (Mock DA Layer)
          // Save Pending Votes to LocalStorage (Mock DA Layer)
          const pending = await zkappWorkerClient.fetchPendingVotes();
          localStorage.setItem(`zkvoting-pending-${zkAppAddress}`, JSON.stringify(pending, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
          ));
          
          // Refresh counts (though they won't update on-chain yet)
          await refreshState(zkappWorkerClient, zkAppAddress);
      } catch (e: any) {
          console.error(e);
          setStatus("Voting Failed");
          addLog(`Error: ${e.message}`);
      }
  }, [zkappWorkerClient, zkAppAddress, addLog]);

  const fetchPendingVotes = useCallback(async () => {
      if (!zkappWorkerClient) return [];
      return await zkappWorkerClient.fetchPendingVotes();
  }, [zkappWorkerClient]);

  const processAggregation = useCallback(async () => {
     if (!zkappWorkerClient || !zkAppAddress) return;
     
     setStatus("Aggregating...");
     try {
         await zkappWorkerClient.processPendingVotes();
         await zkappWorkerClient.proveTransaction();
         // The transaction JSON needs to be sent to wallet.
         // We'll return it or handle wallet here? 
         // Let's handle wallet in component to keep it simple.
     } catch (e: any) {
         console.error(e);
         setStatus("Aggregation Failed");
         addLog("Error aggregating: " + e.message);
         throw e;
     } 
     
     
     // Update UI with new counts
     await refreshState(zkappWorkerClient, zkAppAddress);
     setStatus("Aggregation Complete");

     // Clear Mock DA Cache on success (Optimistic)
     localStorage.removeItem(`zkvoting-pending-${zkAppAddress}`); 
  }, [zkappWorkerClient, zkAppAddress, addLog]);

  return (
    <ZkappContext.Provider value={{
        zkappWorkerClient,
        zkAppAddress,
        isWorkerReady,
        isCompiling,
        status,
        logs,
        resultsRoot,
        localResultsRoot,
        voteCounts,
        hasVoted,
        hasCompiled,
        lastVoteProof,
        loadWorker,
        compileAndInit,
        compile,
        deployContract,
        fetchAccount: async (address: string) => { 
            if(!zkappWorkerClient) return { error: "Worker not loaded" };
            return await zkappWorkerClient.fetchAccount(address);
        },
        connect,
        setZkAppAddress,
        addLog,
        castVote,
        fetchPendingVotes,
        processAggregation
    }}>
      {children}
    </ZkappContext.Provider>
  );
}

export function useZkappContext() {
  const context = useContext(ZkappContext);
  if (!context) {
    throw new Error('useZkappContext must be used within a ZkappProvider');
  }
  return context;
}
