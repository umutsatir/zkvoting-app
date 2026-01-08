'use client';
import { useEffect } from 'react';
import styles from '../../styles/Home.module.css';
import { useZkappContext } from '../contexts/ZkappContext';
import { useRouter, useSearchParams } from 'next/navigation';

export default function VotePage() {
    const { 
        isWorkerReady, 
        zkAppAddress, 
        status, 
        isCompiling, 
        hasVoted, 
        castVote, 
        voteCounts,
        resultsRoot,
        logs,
        connect,
        hasCompiled,
        compile,
        lastVoteProof
    } = useZkappContext();
    
    const router = useRouter();
    const searchParams = useSearchParams();

    // Auto-connect if refreshing on this page with contract param
    useEffect(() => {
        if(isWorkerReady && !zkAppAddress && !isCompiling) {
             const contractParam = searchParams.get('contract');
             if(contractParam) {
                 connect(contractParam);
             } else {
                 // If no contract, redirect to home
                 router.push('/');
             }
        }
    }, [isWorkerReady, zkAppAddress, isCompiling, searchParams, connect, router]);

    const onCastVote = async (candidateId: number, name: string) => {
        if (!zkAppAddress) return;
        await castVote(candidateId, name);
    };

    const isReady = status === "Connected" || status === "Proof Submitted" || status === "Results Updated";
    const canVote = isReady && !hasVoted && !isCompiling;

    return (
        <main className={styles.main}>
             <header className={styles.header}>
                <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                     <h1 
                        onClick={() => router.push('/')}
                        style={{fontSize: '1.5rem', margin: 0, cursor: 'pointer'}}
                     >
                        ZK Voting App
                     </h1>
                     <span className={styles.statusBadge} style={{background: 'rgba(255,255,255,0.05)', color: '#aaa', border: '1px solid #333'}}>Voter View</span>
                </div>
                
                 <div style={{display: 'flex', gap: '10px'}}>
                    <button 
                        onClick={() => router.push(`/aggregate?contract=${zkAppAddress}`)}
                        className={styles.voteBtn}
                        style={{width: 'auto', padding: '8px 16px', fontSize: '0.8rem'}}
                    >
                        Switch to Aggregator →
                    </button>
                    <div className={styles.statusBadge}>
                        <div className={styles.statusDot} style={{background: isReady ? '#00ff88' : '#ffaa00', boxShadow: `0 0 10px ${isReady ? '#00ff88' : '#ffaa00'}`}}></div>
                        <span>{status}</span>
                    </div>
                </div>
            </header>

            {!zkAppAddress ? (
                <div className={styles.center}>
                    <div className={styles.card} style={{height: 'auto', minHeight: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                         {isCompiling || !isWorkerReady ? (
                             <div style={{textAlign: 'center'}}>
                                <div className={styles.spinner} style={{margin: '0 auto 20px auto'}}></div>
                                <p>Connecting to Election...</p>
                             </div>
                         ) : (
                             <p>Initializing...</p>
                         )}
                    </div>
                </div>
            ) : !hasCompiled ? (
                <div className={styles.center}>
                    <div className={styles.card} style={{height: 'auto', minHeight: '300px', padding: '40px', textAlign: 'center', justifyContent: 'center'}}>
                        {isCompiling ? (
                             <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                <div className={styles.spinner} style={{marginBottom: '20px'}}></div>
                                <h2>Compiling Circuits</h2>
                                <p style={{color: '#888'}}>This may take 1-2 minutes...</p>
                                <p style={{fontSize: '0.8rem', marginTop: '10px', color: '#666'}}>Please do not close the tab.</p>
                             </div>
                        ) : (
                             <>
                                <h2>Enable Voting</h2>
                                <p style={{marginBottom: '20px', color: '#888'}}>
                                    Zero-Knowledge Proof generation requires compiling circuits in your browser. This happens once per session.
                                </p>
                                <button 
                                    className={styles.voteBtn} 
                                    onClick={compile}
                                    style={{background: 'var(--primary)', color: 'black'}}
                                >
                                    ⚡ Enable Voting (Compile)
                                </button>
                             </>
                        )}
                    </div>
                </div>
            ) : (
                <>
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
                                {hasVoted ? "Proof Submitted" : isCompiling ? "Processing..." : "Vote for Alice"}
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
                                {hasVoted ? "Proof Submitted" : isCompiling ? "Processing..." : "Vote for Bob"}
                            </button>
                        </div>
                    </div>
                </section>

                <section className={styles.dashboardGrid} style={{marginTop: 'auto'}}>
                     {/* Results Panel */}
                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Live Results (Simulation)</div>
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
                            Total Votes: {voteCounts.alice + voteCounts.bob} | On-Chain Root: {resultsRoot ? resultsRoot.slice(0, 16) + "..." : "Syncing..."}
                        </div>
                    </div>

                    {/* Logs Panel */}
                    <div className={styles.panel}>
                        <div className={styles.panelTitle}>Logs</div>
                        <div className={styles.logs}>
                            {logs.map((log, i) => (
                                <div key={i} className={styles.logItem}>{log}</div>
                            ))}
                        </div>
                    </div>

                    {/* Proof Visualization Panel (New) */}
                    {hasVoted && (
                        <div className={styles.panel} style={{gridColumn: '1 / -1'}}>
                            <div className={styles.panelTitle}>
                                🔐 Zero-Knowledge Proof (Generated Locally)
                            </div>
                            <div style={{
                                background: '#000', borderRadius: '5px', padding: '10px', 
                                maxHeight: '200px', overflow: 'auto', 
                                fontFamily: 'monospace', fontSize: '0.7rem', color: '#0f0'
                            }}>
                                {lastVoteProof ? (
                                    <pre>{JSON.stringify(lastVoteProof, null, 2)}</pre>
                                ) : (
                                    <div style={{color: '#666'}}>Waiting for proof generation...</div>
                                )}
                            </div>
                            <div style={{marginTop: '5px', fontSize: '0.7rem', color: '#888'}}>
                                This proof verifies your vote is valid without revealing who you voted for.
                            </div>
                        </div>
                    )}
                </section>
                </>
            )}
        </main>
    );
}
