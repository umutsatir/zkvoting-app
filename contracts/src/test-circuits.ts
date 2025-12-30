import { Field, MerkleTree, Poseidon, Mina, PrivateKey, AccountUpdate } from 'o1js';
import { VoteProofProgram, VotePrivateInputs, VotePublicInputs, MerkleWitness32 } from './VoteProofProgram.js';
import { SettlementProgram, TallyState } from './SettlementProgram.js';
import { VotingContract } from './VotingContract.js';

async function main() {
  console.log('Compiling VoteProofProgram...');
  await VoteProofProgram.compile();
  console.log('Compiling SettlementProgram...');
  await SettlementProgram.compile();
  console.log('Compiling VotingContract...');
  await VotingContract.compile();

  // 1. Setup Trees
  const votersTree = new MerkleTree(32);
  const candidatesTree = new MerkleTree(32);
  const resultsTree = new MerkleTree(32); // Initial Results (All zeros)

  // Voters
  const voter1Secret = Field.random();
  const voter2Secret = Field.random();
  votersTree.setLeaf(0n, Poseidon.hash([voter1Secret]));
  votersTree.setLeaf(1n, Poseidon.hash([voter2Secret]));
  const votersRoot = votersTree.getRoot();

  // Candidates (Indices 1 and 2 are active)
  // Active = Field(1)
  candidatesTree.setLeaf(1n, Field(1)); // Candidate A
  candidatesTree.setLeaf(2n, Field(1)); // Candidate B
  const candidatesRoot = candidatesTree.getRoot();

  const electionId = Field(12345);

  // 2. Generate Vote 1
  console.log('Generating Vote 1...');
  const witnessVoter1 = new MerkleWitness32(votersTree.getWitness(0n));
  const witnessCandidate1 = new MerkleWitness32(candidatesTree.getWitness(1n)); 
  const nullifier1 = Poseidon.hash([voter1Secret, electionId]);
  const commitment1 = Poseidon.hash([Field(1), electionId]);

  const votePublicInput1 = new VotePublicInputs({
    electionId,
    merkleRoot: votersRoot,
    candidatesRoot: candidatesRoot,
    nullifier: nullifier1,
    voteCommitment: commitment1,
    candidateID: Field(1)
  });
  const votePrivateInput1 = new VotePrivateInputs({
    voterSecret: voter1Secret,
    merklePath: witnessVoter1,
    candidatePath: witnessCandidate1,
    candidate: Field(1)
  });
  const { proof: voteProof1 } = await VoteProofProgram.vote(votePublicInput1, votePrivateInput1);
  console.log('Vote 1 proof created.');

  // 3. Generate Vote 2
  console.log('Generating Vote 2...');
  const witnessVoter2 = new MerkleWitness32(votersTree.getWitness(1n));
  const witnessCandidate2 = new MerkleWitness32(candidatesTree.getWitness(2n));
  const nullifier2 = Poseidon.hash([voter2Secret, electionId]);
  const commitment2 = Poseidon.hash([Field(2), electionId]);

  const votePublicInput2 = new VotePublicInputs({
    electionId,
    merkleRoot: votersRoot,
    candidatesRoot: candidatesRoot,
    nullifier: nullifier2,
    voteCommitment: commitment2,
    candidateID: Field(2)
  });
  const votePrivateInput2 = new VotePrivateInputs({
    voterSecret: voter2Secret,
    merklePath: witnessVoter2,
    candidatePath: witnessCandidate2,
    candidate: Field(2)
  });
  const { proof: voteProof2 } = await VoteProofProgram.vote(votePublicInput2, votePrivateInput2);
  console.log('Vote 2 proof created.');

  // 4. Sequential Tallying (Off-Chain)
  console.log('Starting Off-Chain Tallying...');
  
  let currentResultsRoot = resultsTree.getRoot();
  const initialResultsRoot = currentResultsRoot; // Save for contract init
  
  // Tally Vote 1
  const resultsWitness1 = new MerkleWitness32(resultsTree.getWitness(1n));
  const currentCount1 = Field(0); 

  const tallyState1Input = new TallyState({ resultsRoot: currentResultsRoot });
  
  const { proof: tallyProof1 } = await SettlementProgram.addVote(
      tallyState1Input,
      voteProof1,
      currentCount1,
      resultsWitness1
  );
  
  resultsTree.setLeaf(1n, Field(1)); 
  currentResultsRoot = resultsTree.getRoot();
  tallyProof1.publicOutput.resultsRoot.assertEquals(currentResultsRoot);
  console.log('Vote 1 tallied.');

  // Tally Vote 2
  const resultsWitness2 = new MerkleWitness32(resultsTree.getWitness(2n));
  const currentCount2 = Field(0);
  
  const tallyState2Input = new TallyState({ resultsRoot: currentResultsRoot });

  const { proof: tallyProof2 } = await SettlementProgram.addVote(
      tallyState2Input,
      voteProof2,
      currentCount2,
      resultsWitness2
  );

  resultsTree.setLeaf(2n, Field(1)); 
  currentResultsRoot = resultsTree.getRoot();
  tallyProof2.publicOutput.resultsRoot.assertEquals(currentResultsRoot);
  console.log('Vote 2 tallied.');

  // 5. Recursive Merge (Off-Chain Batching)
  console.log('Starting Recursive Merge...');
  
  // Merge Tally 1 (Init -> State1) and Tally 2 (State1 -> State2)
  // Public Input: TallyState(InitRoot)
  // Public Output: TallyState(State2Root)
  
  const mergeInputState = new TallyState({ resultsRoot: initialResultsRoot });
  
  const { proof: mergedProof } = await SettlementProgram.mergeNodes(
      mergeInputState,
      tallyProof1,
      tallyProof2
  );
  
  mergedProof.publicOutput.resultsRoot.assertEquals(currentResultsRoot);
  console.log('Merged Proof created (Start -> End).');

  // 6. On-Chain Settlement (Batch Submission)
  console.log('--- Starting On-Chain Settlement (Batch) ---');
  const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
  Mina.setActiveInstance(Local);
  
  const deployerAccount = Local.testAccounts[0];
  const deployerKey = deployerAccount.key;
  
  const zkAppPrivateKey = PrivateKey.random();
  const zkAppAddress = zkAppPrivateKey.toPublicKey();
  const contract = new VotingContract(zkAppAddress);

  console.log('Deploying Contract...');
  const deployTx = await Mina.transaction(deployerAccount, async () => {
    AccountUpdate.fundNewAccount(deployerAccount);
    await contract.deploy();
    await contract.initElection(votersRoot, initialResultsRoot, electionId);
  });
  await deployTx.prove();
  await deployTx.sign([deployerKey, zkAppPrivateKey]).send();
  console.log('Contract Deployed.');

  // Submit ONE Merged Proof
  console.log('Submitting Merged Proof...');
  const tx1 = await Mina.transaction(deployerAccount, async () => {
      await contract.settleVotes(mergedProof);
  });
  await tx1.prove();
  await tx1.sign([deployerKey]).send();
  console.log('Merged Proof settled on-chain.');
  
  // Verify On-Chain State
  const chainRoot = contract.resultsRoot.get();
  chainRoot.assertEquals(currentResultsRoot);
  console.log('Final On-Chain Root matches Expected Results!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
