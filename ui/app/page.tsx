'use client';
import Head from 'next/head';
import Image from 'next/image';
import {useCallback, useEffect, useState} from 'react';
import styles from '../styles/Home.module.css';
import ZkappWorkerClient from "./ZkappWorkerClient"

import './reactCOIServiceWorker';

export default function Home() {
  
  const [zkappWorkerClient, setZkappWorkerClient] = useState<null | ZkappWorkerClient>(null); 
  const [zkAppAddress, setZkAppAddress] = useState<string | null>(null);
  
  const [resultsRoot, setResultsRoot] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Initializing...");
  const [logs, setLogs] = useState<string[]>([]);
  const [isVoting, setIsVoting] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [inputAddress, setInputAddress] = useState<string>("");
  
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    (async () => {
      const zkappWorkerClient = new ZkappWorkerClient();
      setZkappWorkerClient(zkappWorkerClient);

      setStatus("Loading Contracts...");
      addLog("Loading Worker...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      await zkappWorkerClient.setActiveInstanceToDevnet();
      await zkappWorkerClient.loadContract();
      
      setStatus("Waiting for Compilation...");
      addLog("Contracts Loaded. Ready to Compile.");
    })();
  }, []);

  const compileAndInit = async (address: string) => {
      if(!zkappWorkerClient) return;
      
      setStatus("Compiling Circuits...");
      setIsCompiling(true);
      addLog("Compiling VoteProof & Settlement Circuits (Heavy Load)...");
      try {
        await zkappWorkerClient.compileContract();
        addLog("Compilation Complete.");
        
        setStatus("Syncing...");
        await zkappWorkerClient.initZkappInstance(address);
        const res = await zkappWorkerClient.fetchAccount(address);
        if (res.error) {
            throw new Error(`Fetch Account Error: ${res.error}`);
        }
        addLog("Account state fetched.");
        
        const root = await zkappWorkerClient.getResultsRoot();
        setResultsRoot(root);
        setZkAppAddress(address);
        setStatus("Connected");
        addLog(`Synced with Election at ${address.slice(0, 8)}...`);
      } catch(e: any) {
          console.error(e);
          setStatus("Connection Failed");
          addLog("Error connecting to contract: " + e.message);
      } finally {
          setIsCompiling(false);
      }
  };

  const onDeploy = async () => {
    if(!zkappWorkerClient) return;
    
    setStatus("Preparing Deployment...");
    setIsCompiling(true); // Treat as busy state
    
    try {
        const mina = (window as any).mina;
        if (!mina) throw new Error("Auro Wallet not found");
        const walletKey: string = (await mina.requestAccounts())[0];
        
        // 1. Compile First (if not already)
        addLog("Compiling Logic before Deployment...");
        await zkappWorkerClient.compileContract();
        addLog("Compiled.");
        
        // 2. Create Deploy Tx
        addLog("Creating Deployment Transaction...");
        const { transaction, zkAppAddress: newDetails } = await zkappWorkerClient.createDeployTransaction(walletKey);
        
        // 3. Send
        addLog("Requesting Signature for Deployment...");
        const { hash } = await mina.sendTransaction({ transaction });
        
        addLog(`Deploy Tx Sent: ${hash.slice(0, 8)}...`);
        addLog(`New Election Address: ${newDetails}`);
        
        // 4. Initialize
        await zkappWorkerClient.initZkappInstance(newDetails);
        setZkAppAddress(newDetails);
        setResultsRoot("0"); // Initial root
        setStatus("Connected");
        
    } catch(e: any) {
        console.error(e);
        addLog("Deployment Error: " + e.message);
        console.log(logs);
        setStatus("Error");
    } finally {
        setIsCompiling(false);
    }
  };

  // State
  const [viewMode, setViewMode] = useState<'voter' | 'aggregator'>('voter');
  const [pendingVotes, setPendingVotes] = useState<number>(0);
  
  // Checks
  const isReady = status === "Connected";
  const canVote = isReady && !isVoting && !hasVoted;

  const onFetchPending = async () => {
      if(!zkappWorkerClient) return;
      const pending: any[] = await zkappWorkerClient.fetchPendingVotes();
      setPendingVotes(pending.length);
      addLog(`Fetched ${pending.length} pending votes from mocked Celestia DA.`);
  };
  
  const onProcessAggregration = async () => {
      if(pendingVotes === 0) return;
      
      setStatus("Aggregating...");
      addLog("Starting Batch Aggregation (Recursive Proofs)...");
      try {
        const mina = (window as any).mina;
        if (!mina) throw new Error("Auro Wallet not found");
        const walletKey: string = (await mina.requestAccounts())[0];
          
        await zkappWorkerClient!.processPendingVotes();
        addLog("Batch Aggregation Complete. Generating Settlement Tx...");
        
        await zkappWorkerClient!.proveTransaction();
        const transactionJSON = await zkappWorkerClient!.getTransactionJSON();
        
        addLog("Requesting Settlement Signature...");
        const { hash } = await mina.sendTransaction({ transaction: transactionJSON });
        
        addLog(`Settlement Tx Sent: ${hash.slice(0, 8)}...`);
        setStatus("Results Updated");
        setPendingVotes(0); // Clear local pending view
        
      } catch(e: any) {
          console.error(e);
          setStatus("Aggregation Failed");
          addLog("Error: " + e.message);
      }
  };

  const onCastVote = useCallback(async (candidateId: number, name: string) => {
    if (isVoting || hasVoted) return;

    setIsVoting(true);
    setStatus(`Voting for ${name}...`);
    addLog(`Generating Proof for ${name}...`);

    try {
      await zkappWorkerClient!.castVote(candidateId);
      addLog(`Vote Proof Generated & Sent to DA Layer.`);
      setStatus("Proof Submitted");
      setHasVoted(true);
    } catch (e: any) {
      console.error(e);
      addLog(`Error: ${e.message}`);
      setStatus("Error");
    } finally {
        setIsVoting(false);
    }
  }, [zkappWorkerClient, hasVoted, isVoting]);

  return (
    <>
      <Head>
        <title>ZK Voting App</title>
        <meta name="description" content="Scalable ZK Voting on Mina" />
      </Head>
      
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
            <h1>ZK Voting App</h1>
            
             {/* View Switcher */}
            {isReady && (
                <div style={{display: 'flex', gap: '10px', marginLeft: '20px', background: 'rgba(255,255,255,0.1)', padding: '5px', borderRadius: '20px'}}>
                    <button 
                        onClick={() => setViewMode('voter')}
                        style={{
                            background: viewMode === 'voter' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'voter' ? 'black' : 'var(--text-muted)',
                            border: 'none', padding: '5px 15px', borderRadius: '15px', cursor: 'pointer'
                        }}
                    >
                        Voter View
                    </button>
                    <button 
                         onClick={() => setViewMode('aggregator')}
                         style={{
                            background: viewMode === 'aggregator' ? 'var(--secondary)' : 'transparent',
                            color: viewMode === 'aggregator' ? 'white' : 'var(--text-muted)',
                            border: 'none', padding: '5px 15px', borderRadius: '15px', cursor: 'pointer'
                        }}
                    >
                        Aggregator View
                    </button>
                </div>
            )}

            <div className={styles.statusBadge} style={{marginLeft: 'auto'}}>
                <div className={styles.statusDot} style={{background: isReady ? '#00ff88' : '#ffaa00', boxShadow: `0 0 10px ${isReady ? '#00ff88' : '#ffaa00'}`}}></div>
                <span>{status}</span>
            </div>
        </header>

        {/* Dynamic Content */}
        {!zkAppAddress ? (
            <div className={styles.center}>
                <div className={styles.card} style={{width: '400px', cursor: 'default', height: 'auto'}}>
                    <h2>Welcome</h2>
                    <p style={{marginBottom: '20px'}}>Deploy a new ZK Election or join an existing one.</p>
                    
                    <button 
                        className={styles.voteBtn} 
                        onClick={onDeploy}
                        disabled={isCompiling}
                        style={{marginBottom: '1rem', background: 'var(--primary)', color: 'black'}}
                    >
                        {isCompiling ? "Processing..." : "Create New Election"}
                    </button>
                    
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center', width: '100%'}}>
                        <input 
                            type="text" 
                            placeholder="Existing Contract Address..." 
                            value={inputAddress}
                            onChange={(e) => setInputAddress(e.target.value)}
                            style={{
                                flex: 1, 
                                padding: '10px', 
                                borderRadius: '8px', 
                                border: '1px solid var(--glass-border)', 
                                background: 'rgba(0,0,0,0.3)',
                                color: 'white'
                            }}
                        />
                        <button 
                             className={styles.voteBtn}
                             onClick={() => compileAndInit(inputAddress)}
                             disabled={isCompiling || !inputAddress}
                             style={{width: 'auto', padding: '10px 20px'}}
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            <>
                <div style={{textAlign: 'center', marginBottom: '1rem', color: '#666', fontSize: '0.8rem'}}>
                    Election Contract: {zkAppAddress}
                </div>
                
                {/* VOTER VIEW */}
                {viewMode === 'voter' && (
                <section className={styles.hero}>
                    <div 
                        className={`${styles.card} ${styles.cardA}`} 
                        onClick={() => canVote && onCastVote(1, "Alice")}
                        style={{
                            opacity: canVote ? 1 : 0.5, 
                            cursor: canVote ? 'pointer' : 'not-allowed',
                            pointerEvents: canVote ? 'auto' : 'none'
                        }}
                    >
                        <div className={styles.cardContent}>
                            <div className={styles.avatar} style={{borderColor: 'var(--primary)', color: 'var(--primary)'}}>
                                A
                            </div>
                            <h2>Alice</h2>
                            <p style={{marginBottom: '2rem'}}>The Visionary.<br/>Advocating for a decentralized future.</p>
                            <button className={styles.voteBtn} disabled={!canVote}>
                                {hasVoted ? "Proof Submitted" : isVoting ? "Proving..." : isReady ? "Vote for Alice" : "Loading..."}
                            </button>
                        </div>
                    </div>

                    <div 
                        className={`${styles.card} ${styles.cardB}`} 
                        onClick={() => canVote && onCastVote(2, "Bob")}
                        style={{
                            opacity: canVote ? 1 : 0.5, 
                            cursor: canVote ? 'pointer' : 'not-allowed',
                            pointerEvents: canVote ? 'auto' : 'none'
                        }}
                    >
                        <div className={styles.cardContent}>
                            <div className={styles.avatar} style={{borderColor: 'var(--secondary)', color: 'var(--secondary)'}}>
                                B
                            </div>
                            <h2>Bob</h2>
                            <p style={{marginBottom: '2rem'}}>The Builder.<br/>Focused on infrastructure and scale.</p>
                            <button className={styles.voteBtn} disabled={!canVote}>
                                {hasVoted ? "Proof Submitted" : isVoting ? "Proving..." : isReady ? "Vote for Bob" : "Loading..."}
                            </button>
                        </div>
                    </div>
                </section>
                )}
                
                {/* AGGREGATOR VIEW */}
                {viewMode === 'aggregator' && (
                    <section className={styles.hero} style={{flexDirection: 'column', alignItems: 'center'}}>
                         <div className={styles.card} style={{width: '600px', height: 'auto', cursor: 'default'}}>
                             <h2>🗳️ Election Aggregator</h2>
                             <p style={{marginBottom: '20px', color: '#888'}}>
                                 Fetch pending proofs from the Data Availability layer and settle them on Mina.
                             </p>
                             
                             <div style={{display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '20px'}}>
                                 <div style={{background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '10px', minWidth: '150px'}}>
                                     <h3>Pending</h3>
                                     <div style={{fontSize: '3rem', fontWeight: 'bold', color: 'var(--primary)'}}>{pendingVotes}</div>
                                     <div>Votes</div>
                                 </div>
                                  <div style={{background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '10px', minWidth: '150px'}}>
                                     <h3>On Chain</h3>
                                     <div style={{fontSize: '3rem', fontWeight: 'bold', color: 'white'}}>?</div>
                                     <div>Verified</div>
                                 </div>
                             </div>
                             
                             <div style={{display: 'flex', gap: '10px'}}>
                                 <button className={styles.voteBtn} onClick={onFetchPending}>
                                     🔄 Fetch from Celestia
                                 </button>
                                 <button 
                                     className={styles.voteBtn} 
                                     style={{background: 'var(--secondary)', color: 'white'}}
                                     onClick={onProcessAggregration}
                                     disabled={pendingVotes === 0}
                                 >
                                     ⚡ Aggregate & Settle
                                 </button>
                             </div>
                         </div>
                    </section>
                )}

                {/* Dashboard Bottom */}
                <section className={styles.dashboardGrid}>
                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Live Results (Simulation)</div>
                        {/* Visual Fake Bar for Demo */}
                        <div className={styles.resultsBar}>
                            <div className={styles.barSegment} style={{width: '50%', background: 'var(--primary)'}}>Alice 50%</div>
                            <div className={styles.barSegment} style={{width: '50%', background: 'var(--secondary)'}}>Bob 50%</div>
                        </div>
                        <div style={{marginTop: '1rem', fontSize: '0.8rem', color: '#666'}}>
                            On-Chain Root: {resultsRoot ? resultsRoot.slice(0, 16) + "..." : "Syncing..."}
                        </div>
                    </div>

                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Blockchain Logs</div>
                        <div className={styles.logs}>
                            {logs.map((log, i) => (
                                <div key={i} className={styles.logItem}>{log}</div>
                            ))}
                            {logs.length === 0 && <span style={{opacity: 0.3}}>Waiting for activity...</span>}
                        </div>
                    </div>
                </section>
            </>
        )}
      </main>
    </>
  );
}
