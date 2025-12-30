import { SmartContract, state, State, method, Field, Bool, Permissions, DeployArgs } from 'o1js';
import { SettlementProgramProof, TallyState } from './SettlementProgram.js';

export class VotingContract extends SmartContract {
    // Top-level state
    @state(Field) resultsRoot = State<Field>(); // Merkle Root of Result Counts
    @state(Field) votersRoot = State<Field>();  // Merkle Root of Eligible Voters
    @state(Field) electionId = State<Field>();  // Unique ID for the election
    @state(Bool) isFinished = State<Bool>();    // Whether the election is closed

    async deploy(args?: DeployArgs) {
        await super.deploy(args);
        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async initElection(
        initialVotersRoot: Field, 
        initialResultsRoot: Field, 
        id: Field
    ) {
        this.requireSignature();
        // Can only be called once or if empty? 
        // For simplicity, we assume this is called after deploy.
        // In production, checking if already initialized or using permissions is better.
        this.resultsRoot.set(initialResultsRoot);
        this.votersRoot.set(initialVotersRoot);
        this.electionId.set(id);
        this.isFinished.set(Bool(false));
    }

    @method async settleVotes(proof: SettlementProgramProof) {
        // 1. Verify the ZK Proof
        proof.verify();

        // 2. Enforce Continuity
        // The proof must start from the CURRENT on-chain state (resultsRoot).
        // proof.publicInput is the OLD state.
        // proof.publicOutput is the NEW state.
        
        const currentResultsRoot = this.resultsRoot.getAndRequireEquals();
        
        proof.publicInput.resultsRoot.assertEquals(
            currentResultsRoot, 
            "Proof input does not match on-chain results root"
        );

        // 3. Update State
        this.resultsRoot.set(proof.publicOutput.resultsRoot);
    }
}
