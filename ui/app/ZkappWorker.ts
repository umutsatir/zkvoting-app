import { Mina, PublicKey, fetchAccount, Field, JsonProof, Cache, MerkleTree, Poseidon, AccountUpdate, PrivateKey } from 'o1js';
import * as Comlink from "comlink";
import type { VoteProofProgram, VoteProofProgramProof, VotePublicInputs, VotePrivateInputs, MerkleWitness32 } from '../../contracts/src/VoteProofProgram';
import type { SettlementProgram, TallyState, SettlementProgramProof } from '../../contracts/src/SettlementProgram';
import type { VotingContract } from '../../contracts/src/VotingContract';

type Transaction = Awaited<ReturnType<typeof Mina.transaction>>;

const state = {
  VoteProofProgram: null as any,
  SettlementProgram: null as any,
  VotingContract: null as any,
  zkappInstance: null as null | VotingContract,
  transaction: null as null | Transaction,
  
  // Demo State (Mocking Backend)
  votersTree: null as null | MerkleTree,
  candidatesTree: null as null | MerkleTree,
  resultsTree: null as null | MerkleTree,
  votersRoot: null as null | Field,
  candidatesRoot: null as null | Field,
  electionId: Field(12345),
  pendingVoteProofs: [] as any[],
};

// ---------------------------------------------------------------------------------------

export const api = {
  async setActiveInstanceToDevnet() {
    const Network = Mina.Network(
      "https://api.minascan.io/node/devnet/v1/graphql"
    );
    console.log("Devnet network instance configured");
    Mina.setActiveInstance(Network);
  },

  async loadContract() {
    const { VoteProofProgram } = await import("../../contracts/build/src/VoteProofProgram.js");
    const { SettlementProgram } = await import("../../contracts/build/src/SettlementProgram.js");
    const { VotingContract } = await import("../../contracts/build/src/VotingContract.js");

    state.VoteProofProgram = VoteProofProgram;
    state.SettlementProgram = SettlementProgram;
    state.VotingContract = VotingContract;
  },

  async compileContract() {
    // Compile in order
    await state.VoteProofProgram!.compile();
    await state.SettlementProgram!.compile();
    await state.VotingContract!.compile();
  },

  async fetchAccount(publicKey58: string) {
    console.log(`Worker: Fetching account for ${publicKey58}`);
    const publicKey = PublicKey.fromBase58(publicKey58);
    const res = await fetchAccount({ publicKey });
    console.log(`Worker: Fetch result:`, res.error ? "Error" : "Success");
    return res;
  },

  async initZkappInstance(publicKey58: string) {
    const publicKey = PublicKey.fromBase58(publicKey58);
    state.zkappInstance = new state.VotingContract!(publicKey);
    
    // Initialize Mock Trees for Demo
    this.initTrees();
  },

  // Mock Data Setup
  initTrees() {
    // 1. Voters Tree
    const votersTree = new MerkleTree(32);
    // Add some dummy voters (using random secrets)
    // For demo, we'll use a fixed secret for "Current User"
    const userSecret = Field(1001); 
    votersTree.setLeaf(0n, Poseidon.hash([userSecret]));
    state.votersTree = votersTree;
    state.votersRoot = votersTree.getRoot();

    // 2. Candidates Tree (Index 1 & 2 Active)
    const candidatesTree = new MerkleTree(32);
    candidatesTree.setLeaf(1n, Field(1)); // Candidate A
    candidatesTree.setLeaf(2n, Field(1)); // Candidate B
    state.candidatesTree = candidatesTree;
    state.candidatesRoot = candidatesTree.getRoot();

    // 3. Results Tree
    const resultsTree = new MerkleTree(32);
    state.resultsTree = resultsTree;
  },

  async getResultsRoot() {
    const currentRoot = await state.zkappInstance!.resultsRoot.get();
    return JSON.stringify(currentRoot.toJSON());
  },

  // The Main Action: Vote -> Tally -> Settle
  // 4. Pending Votes Queue (Mock Celestia)
    pendingVoteProofs: [] as { proof: JsonProof, publicInput: any, candidateId: number }[],

  async fetchPendingVotes() {
    return state.pendingVoteProofs;
  },

  async processPendingVotes() {
    console.log("Processing Pending Votes...");
    const pending = state.pendingVoteProofs;
    if (pending.length === 0) throw new Error("No pending votes to process");

    const { VoteProofProgramProof, MerkleWitness32 } = await import("../../contracts/build/src/VoteProofProgram.js");
    const { TallyState, SettlementProgramProof } = await import("../../contracts/build/src/SettlementProgram.js");
    
    // We assume the local `resultsTree` is sync'd with the start state of the batch.
    // In a real app, we'd rebuild it from the on-chain root + pending log.
    
    let consolidatedProof: SettlementProgramProof | null = null;
    let accumulatedTallyState: TallyState | null = null;

    // We process sequentially
    for (const voteData of pending) {
        const candidateId = voteData.candidateId;
        console.log(`Processing Vote for Candidate ${candidateId}`);
        
        // Reconstruct Vote Proof
        const voteProof = await VoteProofProgramProof.fromJSON(voteData.proof);
        
        // Prepare Inputs for addVote
        // 1. Current State (Before this vote)
        const currentRoot = state.resultsTree!.getRoot();
        const currentCountField = Field(0); // TODO: In real app, fetch actual leaf value. For demo, we assume 0 or tracking.
        
        // @ts-ignore
        const resultsWitness = new MerkleWitness32(state.resultsTree!.getWitness(BigInt(candidateId)));
        
        // We need the `tallyInputState` which matches the CURRENT tree root
        const tallyInputState = new TallyState({ resultsRoot: currentRoot });
        
        // Run addVote
        const { proof: stepProof } = await state.SettlementProgram!.addVote(
            tallyInputState,
            voteProof,
            currentCountField,
            resultsWitness
        );
        
        // Update Local Tree to match the NEW state (so next iteration works)
        state.resultsTree!.setLeaf(BigInt(candidateId), currentCountField.add(1));
        
        // Accumulate
        if (!consolidatedProof) {
            consolidatedProof = stepProof;
        } else {
            // Merge: Previous(A->B) + Current(B->C) = Consolidated(A->C)
            const { proof: merged } = await state.SettlementProgram!.mergeNodes(
                consolidatedProof!.publicInput, // Start of A
                consolidatedProof,
                stepProof
            );
            consolidatedProof = merged as SettlementProgramProof;
        }
    }
    
    // Clear Queue
    state.pendingVoteProofs = [];
    
    // Create Transaction
    console.log("Creating Settlement Transaction...");
    state.transaction = await Mina.transaction(async () => {
      await state.zkappInstance!.settleVotes(consolidatedProof!);
    });
  },

  async castVote(candidateId: number) {
    const { VotePublicInputs, VotePrivateInputs, MerkleWitness32 } = await import("../../contracts/build/src/VoteProofProgram.js");

    const candidateField = Field(candidateId);
    const userSecret = Field(1001); 
    
    console.log("Creating Vote Proof...");
    // @ts-ignore
    const witnessVoter = new MerkleWitness32(state.votersTree!.getWitness(0n));
    // @ts-ignore
    const witnessCandidate = new MerkleWitness32(state.candidatesTree!.getWitness(BigInt(candidateId)));

    const nullifier = Poseidon.hash([userSecret, state.electionId]);
    const commitment = Poseidon.hash([candidateField, state.electionId]);

    const votePublicInput = new VotePublicInputs({
      electionId: state.electionId,
      merkleRoot: state.votersRoot!,
      candidatesRoot: state.candidatesRoot!,
      nullifier: nullifier,
      voteCommitment: commitment,
      candidateID: candidateField
    });

    const votePrivateInput = new VotePrivateInputs({
      voterSecret: userSecret,
      merklePath: witnessVoter,
      candidatePath: witnessCandidate,
      candidate: candidateField
    });

    const { proof: voteProof } = await state.VoteProofProgram!.vote(votePublicInput, votePrivateInput);
    console.log("Vote Proof created. Sending to DA Layer...");

    // Store in Pending
    state.pendingVoteProofs.push({
        proof: voteProof.toJSON(),
        publicInput: votePublicInput, // JSON?
        candidateId: candidateId
    });
    
    return "Proof Submitted to Storage (Simulated Celestia). Pending Aggregation.";
  },

  async proveTransaction() {
    await state.transaction!.prove();
  },

  async getTransactionJSON() {
    return state.transaction!.toJSON();
  },

  async createDeployTransaction(senderKey58: string) {
    const senderPublicKey = PublicKey.fromBase58(senderKey58);
    const res = await fetchAccount({ publicKey: senderPublicKey });
    
    if(res.error) {
        throw new Error("Fetch Account Failed: " + JSON.stringify(res.error));
    }
    console.log("Sender Account State Fetched. Nonce:", res.account?.nonce.toString());
    
    // 1. Generate Keypair for new Contract
    const zkAppPrivateKey = PrivateKey.random();
    const zkAppPublicKey = zkAppPrivateKey.toPublicKey();
    
    // 2. Initialize Contract Instance
    const votingContract = new state.VotingContract!(zkAppPublicKey);
    
    // 3. Create Transaction
    const transaction = await Mina.transaction(senderPublicKey, async () => {
        AccountUpdate.fundNewAccount(senderPublicKey);
        await votingContract.deploy();
        
        // Initial State
        const emptyTree = new MerkleTree(32);
        const root = emptyTree.getRoot();
        await votingContract.initElection(root, root, Field(12345));
    });
    
    // 4. Sign with the new zkApp Key (Required for deployment)
    transaction.sign([zkAppPrivateKey]);
    
    return {
        transaction: transaction.toJSON(),
        zkAppAddress: zkAppPublicKey.toBase58()
    };
  }
};

Comlink.expose(api);