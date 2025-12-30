import { Field, PrivateKey, AccountUpdate, Mina, MerkleTree, fetchAccount } from 'o1js';
import { VotingContract } from '../VotingContract.js';

// Setup Mina Network
const network = Mina.Network('https://api.minascan.io/node/devnet/v1/graphql');
Mina.setActiveInstance(network);

// Constants
const FEE = 100_000_000; // 0.1 Mina

async function deploy() {
    try {
        console.log("Compiling VotingContract...");
        await VotingContract.compile();

        // 1. Create Keys
        //Ideally, load from env or file. For demo, we generate random or use a fixed seed if provided
        // const deployerKey = PrivateKey.fromBase58('YOUR_PRIVATE_KEY'); 
        // For now, we'll ask user to provide key or just error if no funds
        
        const deployerKeyStr = process.env.DEPLOYER_KEY;
        if (!deployerKeyStr) {
            console.error("Please set DEPLOYER_KEY env variable with your Devnet Private Key.");
            process.exit(1);
        }
        const deployerKey = PrivateKey.fromBase58(deployerKeyStr);
        const deployerAddress = deployerKey.toPublicKey();
        
        console.log(`Deploying from: ${deployerAddress.toBase58()}`);
        console.log("Fetching account...");
        await fetchAccount({ publicKey: deployerAddress });

        // 2. Setup zkApp Keys
        const zkAppPrivateKey = PrivateKey.random();
        const zkAppAddress = zkAppPrivateKey.toPublicKey();
        const contract = new VotingContract(zkAppAddress);

        console.log(`Target zkApp Address: ${zkAppAddress.toBase58()}`);

        // 3. Initial State
        const emptyTree = new MerkleTree(32);
        const initialResultsRoot = emptyTree.getRoot();
        const votersRoot = emptyTree.getRoot(); // Using empty tree for 'mock' voters for now
        const electionId = Field(12345);

        // 4. Deploy Transaction
        console.log("Creating Deploy Transaction...");
        const tx = await Mina.transaction({ sender: deployerAddress, fee: FEE }, async () => {
             AccountUpdate.fundNewAccount(deployerAddress);
             await contract.deploy();
             await contract.initElection(votersRoot, initialResultsRoot, electionId);
        });

        console.log("Proving...");
        await tx.prove();

        console.log("Signing and Sending...");
        tx.sign([deployerKey, zkAppPrivateKey]);
        const sentTx = await tx.send();

        console.log("Transaction Sent!");
        console.log(`Tx Hash: ${sentTx.hash}`);
        console.log(`\nSUCCESS! Update 'page.tsx' with:\nconst zkAppAddress = "${zkAppAddress.toBase58()}";`);

    } catch (err) {
        console.error(err);
    }
}

deploy();
