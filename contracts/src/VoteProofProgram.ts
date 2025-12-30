import { ZkProgram, Field, Struct, MerkleWitness, Poseidon, Provable } from 'o1js';

export class MerkleWitness32 extends MerkleWitness(32) {}

export class VotePublicInputs extends Struct({
  electionId: Field,
  merkleRoot: Field, // Voters Tree Root
  candidatesRoot: Field, // Candidates Tree Root
  nullifier: Field,
  voteCommitment: Field,
  candidateID: Field, // The chosen candidate index (Publicly revealed to Aggregator)
}) {}

export class VotePrivateInputs extends Struct({
  voterSecret: Field,
  merklePath: MerkleWitness32, // Path for Voter
  candidatePath: MerkleWitness32, // Path for Candidate Validity
  candidate: Field, // Candidate Index (Matches candidateID)
}) {}

export const VoteProofProgram = ZkProgram({
  name: 'vote-proof-program',
  publicInput: VotePublicInputs,

  methods: {
    vote: {
      privateInputs: [VotePrivateInputs],
      async method(
        publicInput: VotePublicInputs,
        privateInput: VotePrivateInputs
      ) {
        // 1. Verify Voter Membership
        const voterLeaf = Poseidon.hash([privateInput.voterSecret]);
        const calculatedVoterRoot = privateInput.merklePath.calculateRoot(voterLeaf);
        calculatedVoterRoot.assertEquals(publicInput.merkleRoot, 'Invalid Voter Root');

        // 2. Derive Nullifier
        const derivedNullifier = Poseidon.hash([
          privateInput.voterSecret,
          publicInput.electionId,
        ]);
        derivedNullifier.assertEquals(publicInput.nullifier, 'Invalid Nullifier');

        // 3. Verify Candidate Validity (Membership in Candidates Tree)
        // We assume active candidates have leaf value = Field(1).
        // The index of the leaf is the Candidate ID.
        // We check if the leaf at `privateInput.candidate` (index) is Field(1).
        const activeCandidateLeaf = Field(1);
        
        // Ensure the witness path corresponds to the claimed candidate ID
        privateInput.candidatePath.calculateIndex().assertEquals(
          privateInput.candidate, 
          "Candidate Witness does not match Candidate ID"
        );

        const calculatedCandidateRoot = privateInput.candidatePath.calculateRoot(
            activeCandidateLeaf
        );
        calculatedCandidateRoot.assertEquals(publicInput.candidatesRoot, 'Invalid Candidate Root');

        // 4. Validate Candidate ID Match
        privateInput.candidate.assertEquals(publicInput.candidateID, "Candidate ID mismatch");

        // 5. Derive Vote Commitment (Optional now that ID is public, but good for consistency)
        const derivedCommitment = Poseidon.hash([
          privateInput.candidate,
          publicInput.electionId,
        ]);
        derivedCommitment.assertEquals(
          publicInput.voteCommitment,
          'Invalid Vote Commitment'
        );
      },
    },
  },
});

export class VoteProofProgramProof extends ZkProgram.Proof(VoteProofProgram) {}

