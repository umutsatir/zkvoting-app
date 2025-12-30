import { ZkProgram, Field, Struct, MerkleWitness, SelfProof } from 'o1js';
import { VoteProofProgramProof } from './VoteProofProgram.js';

export class MerkleWitness32 extends MerkleWitness(32) {}

export class TallyState extends Struct({
  resultsRoot: Field, 
}) {}

export const SettlementProgram = ZkProgram({
  name: 'settlement-program',
  publicInput: TallyState,
  publicOutput: TallyState,

  methods: {
    addVote: {
      privateInputs: [
        VoteProofProgramProof,
        Field, // currentVoteCount
        MerkleWitness32 // Path to Candidate in Results Tree
      ],
      async method(
        publicInput: TallyState, // This is the OLD state 
        voteProof: VoteProofProgramProof,
        currentVoteCount: Field,
        resultsWitness: MerkleWitness32
      ) {
         // 1. Verify Vote Proof
         voteProof.verify();

         // 2. Verify that `currentVoteCount` is at `voteProof.candidateID` in `publicInput.resultsRoot`
         resultsWitness.calculateIndex().assertEquals(
             voteProof.publicInput.candidateID, 
             "Witness Index mismatch with Candidate ID"
         );
         
         const calculatedOldRoot = resultsWitness.calculateRoot(currentVoteCount);
         calculatedOldRoot.assertEquals(publicInput.resultsRoot, "Invalid Previous Results Root");

         // 3. Update State
         const newVoteCount = currentVoteCount.add(1);
         const newRoot = resultsWitness.calculateRoot(newVoteCount);

         return {
             publicOutput: new TallyState({ resultsRoot: newRoot })
         };
      },
    },

    // Recursive aggregation of state transitions? 
    // Tally(StateA -> StateB) + Tally(StateB -> StateC) = Tally(StateA -> StateC).
    // This allows batching.
    mergeNodes: {
        privateInputs: [
            SelfProof,
            SelfProof
        ],
        async method(
            publicInput: TallyState, // Start State of Proof 1
            proof1: SelfProof<TallyState, TallyState>,
            proof2: SelfProof<TallyState, TallyState>
        ) {
            proof1.verify();
            proof2.verify();

            // Check Chain Continuity: Start1 == Input, End1 == Start2
            proof1.publicInput.resultsRoot.assertEquals(publicInput.resultsRoot, "Proof 1 Start Mismatch");
            proof1.publicOutput.resultsRoot.assertEquals(proof2.publicInput.resultsRoot, "Proof 1 End != Proof 2 Start");

            return {
                publicOutput: proof2.publicOutput // End State of Proof 2
            };
        }
    }
  },
});

export class SettlementProgramProof extends ZkProgram.Proof(SettlementProgram) {}

