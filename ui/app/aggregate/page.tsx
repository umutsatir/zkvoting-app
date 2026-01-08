'use client';
import { useEffect, useState } from 'react';
import styles from '../../styles/Home.module.css';
import { useZkappContext } from '../contexts/ZkappContext';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AggregatePage() {
    const { 
        isWorkerReady, 
        zkAppAddress, 
        status, 
        isCompiling,
        fetchPendingVotes,
        processAggregation,
        voteCounts,
        resultsRoot,
        connect,
        logs,
        zkappWorkerClient // Destructure this
    } = useZkappContext();
    
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pendingVotesCount, setPendingVotesCount] = useState<number>(0);

    // Auto-connect logic (same as VotePage)
     useEffect(() => {
        if(isWorkerReady && !zkAppAddress && !isCompiling) {
             const contractParam = searchParams.get('contract');
             if(contractParam) {
                 connect(contractParam);
             } else {
                 router.push('/');
             }
        } else if (isWorkerReady && zkAppAddress) {
             // Auto-fetch pending votes when connected
             onFetchPending();
        }
    }, [isWorkerReady, zkAppAddress, isCompiling, searchParams, connect, router]);

    const onFetchPending = async () => {
        const pending = await fetchPendingVotes();
        setPendingVotesCount(pending.length);
    };

    const [modalData, setModalData] = useState<{hash: string} | null>(null);

    const handleAggregation = async () => {
         const mina = (window as any).mina;
         if (!mina) return alert("Auro Wallet not found");
         await mina.requestAccounts();
         
         if(!zkappWorkerClient) return;

         try {
             // 1. Process & Prove (Context updates status)
             await processAggregation(); 
             
             // 2. Get Transaction JSON directly from worker
             const transactionJSON = await zkappWorkerClient.getTransactionJSON();

             // 3. Send via Wallet
             const { hash } = await mina.sendTransaction({ transaction: transactionJSON });
             console.log("Tx Sent:", hash);
             
             // Show Success Modal
             setModalData({ hash });
             
             // 4. Reset Pending Count (Optimistic)
             setPendingVotesCount(0);
         } catch (e: any) {
             console.error(e);
             alert("Aggregation Error: " + e.message);
         }
    };

    return (
        <main className={styles.main}>
             {modalData && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                    background: 'rgba(0,0,0,0.8)', zIndex: 1000, 
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div className={styles.card} style={{width: '500px', height: 'auto', textAlign: 'center', position: 'relative', background: '#111'}}>
                        <button 
                            onClick={() => setModalData(null)}
                            style={{position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#666', fontSize: '1.2rem', cursor: 'pointer'}}
                        >✕</button>
                        
                        <div style={{fontSize: '3rem', marginBottom: '10px'}}>⚡</div>
                        <h2 style={{color: '#d0a0ff', marginBottom: '10px'}}>Settlement Sent!</h2>
                        <p style={{marginBottom: '20px', color: '#ccc'}}>
                            The aggregated proof has been submitted to the Mina network.
                        </p>
                        
                        <div style={{background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'left'}}>
                            <div style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px'}}>Transaction Hash:</div>
                            <div style={{fontFamily: 'monospace', wordBreak: 'break-all', color: '#aaa'}}>
                                {modalData.hash}
                            </div>
                        </div>
                        
                        <div style={{fontSize: '0.9rem', color: '#00ff88', marginBottom: '25px', background: 'rgba(0,255,136,0.1)', padding: '10px', borderRadius: '5px'}}>
                            ✅ Live Results have been updated!
                        </div>
                        
                        <button 
                            className={styles.voteBtn}
                            onClick={() => setModalData(null)}
                            style={{background: 'var(--secondary)', color: 'white'}}
                        >
                            Awesome!
                        </button>
                    </div>
                </div>
             )}
             <header className={styles.header}>
                <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                     <h1 
                        onClick={() => router.push('/')}
                        style={{fontSize: '1.5rem', margin: 0, cursor: 'pointer'}}
                     >
                        ZK Voting App
                     </h1>
                     <span className={styles.statusBadge} style={{background: 'rgba(157, 0, 255, 0.1)', color: '#d0a0ff', border: '1px solid rgba(157, 0, 255, 0.3)'}}>Aggregator View</span>
                </div>
                
                 <div style={{display: 'flex', gap: '10px'}}>
                    <button 
                        onClick={() => router.push(`/vote?contract=${zkAppAddress}`)}
                        className={styles.voteBtn}
                        style={{width: 'auto', padding: '8px 16px', fontSize: '0.8rem'}}
                    >
                        ← Switch to Voter
                    </button>
                    <div className={styles.statusBadge}>
                        <div className={styles.statusDot} style={{background: status === 'Connected' ? '#00ff88' : '#ffaa00'}}></div>
                        <span>{status}</span>
                    </div>
                </div>
            </header>

            {!zkAppAddress ? (
                 <div className={styles.center}>
                    <div className={styles.spinner}></div>
                    <p style={{marginTop: '20px'}}>Connecting...</p>
                 </div>
            ) : (
                <>
                <section className={styles.hero} style={{flexDirection: 'column', alignItems: 'center'}}>
                     <div className={styles.card} style={{width: '600px', height: 'auto', cursor: 'default'}}>
                         <h2>🗳️ Election Aggregator</h2>
                         <p style={{marginBottom: '20px', color: '#888'}}>
                             Fetch pending proofs from the Data Availability layer and settle them on Mina.
                         </p>
                         
                         <div style={{display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '20px'}}>
                             <div style={{background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '10px', minWidth: '150px'}}>
                                 <h3>Pending</h3>
                                 <div style={{fontSize: '3rem', fontWeight: 'bold', color: 'var(--primary)'}}>{pendingVotesCount}</div>
                                 <div>Votes</div>
                             </div>
                              <div style={{background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '10px', minWidth: '150px'}}>
                                 <h3>On Chain</h3>
                                 <div style={{fontSize: '3rem', fontWeight: 'bold', color: 'white'}}>{resultsRoot ? 'Synced' : '?'}</div>
                                 <div>Status</div>
                             </div>
                         </div>
                         
                         <div style={{display: 'flex', gap: '10px'}}>
                             <button className={styles.voteBtn} onClick={onFetchPending}>
                                 🔄 Fetch from Celestia
                             </button>
                             <button 
                                 className={styles.voteBtn} 
                                 style={{background: 'var(--secondary)', color: 'white'}}
                                 onClick={handleAggregation}
                                 disabled={pendingVotesCount === 0 || isCompiling}
                             >
                                 {isCompiling ? "Processing..." : "⚡ Aggregate & Settle"}
                             </button>
                         </div>
                     </div>
                </section>

                 <section className={styles.dashboardGrid}>
                    {/* Live Stats Panel */}
                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Live Results (Visual)</div>
                        <div className={styles.resultsBar}>
                            <div className={styles.barSegment} style={{
                                width: voteCounts.alice + voteCounts.bob > 0 ? `${(voteCounts.alice / (voteCounts.alice + voteCounts.bob)) * 100}%` : '50%', 
                                background: 'var(--primary)'
                            }}>
                                Alice {voteCounts.alice}
                            </div>
                            <div className={styles.barSegment} style={{
                                width: voteCounts.alice + voteCounts.bob > 0 ? `${(voteCounts.bob / (voteCounts.alice + voteCounts.bob)) * 100}%` : '50%',
                                background: 'var(--secondary)'
                            }}>
                                Bob {voteCounts.bob}
                            </div>
                        </div>
                         <div style={{marginTop: '1rem', fontSize: '0.8rem', color: '#666'}}>
                            Real-time state from off-chain storage.
                        </div>
                    </div>

                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Logs</div>
                        <div className={styles.logs}>
                            {logs.map((log, i) => (
                                <div key={i} className={styles.logItem}>{log}</div>
                            ))}
                        </div>
                    </div>
                </section>
                </>
            )}
        </main>
    );
}
