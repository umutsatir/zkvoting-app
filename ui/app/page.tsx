'use client';
import { useState, useEffect } from 'react';
import styles from '../styles/Home.module.css';
import { useZkappContext } from './contexts/ZkappContext';
import { useRouter } from 'next/navigation';

import './reactCOIServiceWorker';

export default function Home() {
    const { 
        isWorkerReady, 
        isCompiling, 
        deployContract, 
        fetchAccount,
        connect,
        status
    } = useZkappContext();

    const router = useRouter();
    const [inputAddress, setInputAddress] = useState<string>("");
    const [savedContracts, setSavedContracts] = useState<string[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('zkvoting-contracts');
        if (saved) {
            try {
              setSavedContracts(JSON.parse(saved));
            } catch(e) { console.error("Failed to parse saved contracts", e); }
        }
    }, []);

    const [modalData, setModalData] = useState<{
        type: 'DEPLOY' | 'NOT_READY',
        hash?: string, 
        addr?: string,
        message?: string
    } | null>(null);

    const handleDeploy = async () => {
        const mina = (window as any).mina;
        if (!mina) return alert("Auro Wallet not found");
        const walletKey: string = (await mina.requestAccounts())[0];
        
        const resultJSON = await deployContract(walletKey);
        
        if (resultJSON) {
            // Sign and Send
            const { transaction, newAddr } = JSON.parse(resultJSON);
            const { hash } = await mina.sendTransaction({ transaction });
            console.log("Deployed:", hash);
            
            // Optimistic UX: Add to Recent Elections immediately
            const saved = localStorage.getItem('zkvoting-contracts');
            let contracts = saved ? JSON.parse(saved) : [];
            if (!contracts.includes(newAddr)) {
                contracts = [newAddr, ...contracts].slice(0, 5);
                localStorage.setItem('zkvoting-contracts', JSON.stringify(contracts));
                setSavedContracts(contracts);
            }
            
            // Show Modal
            setModalData({ type: 'DEPLOY', hash, addr: newAddr });
        }
    };

    const handleJoin = async (addr: string) => {
        try {
            await connect(addr);
            router.push(`/vote?contract=${addr}`);
        } catch (e: any) {
            console.error("Join Error:", e);
            const msg = e.message || JSON.stringify(e);
            if (msg.includes("does not exist") || msg.includes("fetchAccount")) {
                setModalData({ type: 'NOT_READY' });
            } else {
                alert("Connection failed: " + msg);
            }
        }
    };

    const clearRecent = () => {
        if(confirm("Are you sure you want to clear your recent elections history?")) {
            localStorage.removeItem('zkvoting-contracts');
            setSavedContracts([]);
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
                        
                        {modalData.type === 'DEPLOY' ? (
                            <>
                                <div style={{fontSize: '3rem', marginBottom: '10px'}}>🚀</div>
                                <h2 style={{color: '#00ff88', marginBottom: '10px'}}>Deployment Initiated!</h2>
                                <p style={{marginBottom: '20px', color: '#ccc'}}>
                                    Your election contract has been broadcast to the Mina network.
                                </p>
                                
                                <div style={{background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'left'}}>
                                    <div style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px'}}>Contract Address:</div>
                                    <div style={{fontFamily: 'monospace', wordBreak: 'break-all', color: 'white', marginBottom: '15px'}}>
                                        {modalData.addr}
                                    </div>
                                    
                                    <div style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px'}}>Transaction Hash:</div>
                                    <div style={{fontFamily: 'monospace', wordBreak: 'break-all', color: '#aaa'}}>
                                        {modalData.hash}
                                    </div>
                                </div>
                                
                                <div style={{fontSize: '0.9rem', color: '#ffaa00', marginBottom: '25px', background: 'rgba(255,170,0,0.1)', padding: '10px', borderRadius: '5px'}}>
                                    ⚠️ Please save these details. Wait approx 3-4 mins for block confirmation before joining.
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{fontSize: '3rem', marginBottom: '10px'}}>⏳</div>
                                <h2 style={{color: '#ffaa00', marginBottom: '10px'}}>Contract Not Ready</h2>
                                <p style={{marginBottom: '20px', color: '#ccc'}}>
                                    Verification key not found on-chain yet.
                                </p>
                                
                                <div style={{fontSize: '0.9rem', color: '#888', marginBottom: '25px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px'}}>
                                    If you just deployed this contract, it typically takes <strong>3-4 minutes</strong> for the block to be included in the blockchain.<br/><br/>
                                    Please wait a moment and try joining again.
                                </div>
                            </>
                        )}
                        
                        <button 
                            className={styles.voteBtn}
                            onClick={() => setModalData(null)}
                            style={{background: 'var(--primary)', color: 'black'}}
                        >
                            Got it, thanks!
                        </button>
                    </div>
                </div>
             )}

             <header className={styles.header}>
                <h1 onClick={() => router.push('/')} style={{cursor: 'pointer'}}>ZK Voting App</h1>
                <div className={styles.statusBadge}>
                    <div className={styles.statusDot} style={{background: isWorkerReady ? '#00ff88' : '#ffaa00'}}></div>
                    <span>{status}</span>
                </div>
            </header>
            
            {/* Rest of the component... */}
            <div className={styles.center}>
                <div className={styles.card} style={{width: '400px', cursor: 'default', height: 'auto', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                    {isCompiling || !isWorkerReady ? (
                        <div style={{textAlign: 'center', padding: '2rem'}}>
                            <div className={styles.spinner} style={{margin: '0 auto 20px auto'}}></div>
                            <h2 style={{fontSize: '1.5rem', marginBottom: '10px'}}>Processing...</h2>
                            <p style={{color: '#888', marginBottom: '20px'}}>
                                {status}
                            </p>
                        </div>
                    ) : (
                        <>
                            <h2>Welcome</h2>
                            <p style={{marginBottom: '20px'}}>Deploy a new ZK Election or join an existing one.</p>
                            
                            <button 
                                className={styles.voteBtn} 
                                onClick={handleDeploy}
                                disabled={isCompiling || !isWorkerReady}
                                style={{marginBottom: '1rem', background: 'var(--primary)', color: 'black', opacity: !isWorkerReady ? 0.5 : 1}}
                            >
                                Create New Election
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
                                     onClick={() => handleJoin(inputAddress.trim())}
                                     disabled={isCompiling || !inputAddress || !isWorkerReady}
                                     style={{width: 'auto', padding: '10px 20px', opacity: !isWorkerReady ? 0.5 : 1}}
                                >
                                    Join
                                </button>
                            </div>

                            {savedContracts.length > 0 && (
                                <div style={{marginTop: '2rem', width: '100%'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px'}}>
                                        <div style={{fontSize: '0.8rem', color: '#888'}}>Recent Elections:</div>
                                        <button 
                                            onClick={clearRecent} 
                                            style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 5px', opacity: 0.6, transition: 'opacity 0.2s'}}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                                            title="Clear List"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '5px'}}>
                                        {savedContracts.map(addr => (
                                            <button 
                                                key={addr}
                                                onClick={() => {
                                                    setInputAddress(addr);
                                                    if(isWorkerReady) handleJoin(addr);
                                                }}
                                                disabled={isCompiling || !isWorkerReady}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)', 
                                                    border: '1px solid rgba(255,255,255,0.1)', 
                                                    padding: '8px', 
                                                    borderRadius: '5px',
                                                    color: '#aaa',
                                                    cursor: (isCompiling || !isWorkerReady) ? 'wait' : 'pointer',
                                                    textAlign: 'left',
                                                    fontSize: '0.8rem',
                                                    transition: 'all 0.2s',
                                                    display: 'flex', justifyContent: 'space-between',
                                                    opacity: !isWorkerReady ? 0.5 : 1
                                                }}
                                            >
                                                <span>{addr.slice(0, 10)}...{addr.slice(-10)}</span>
                                                <span>→</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
