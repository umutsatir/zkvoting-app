# ZK Anonymous Voting

Anonymous on-chain voting for Ethereum (Sepolia) using client-side Zero-Knowledge proofs.
Voters prove membership in a registered-voter Merkle tree and cast a vote without
revealing their identity. A per-voter nullifier prevents double-voting.

## Architecture

```
circuits/   Noir ZK circuit (nargo 1.0.0-beta.13)
contracts/  Solidity smart contracts (Hardhat, Solidity 0.8.28)
frontend/   React + Vite + wagmi + bb.js (client-side proving)
scripts/    CLI tools: Merkle tree builder, proof generator, e2e test
```

### ZK Circuit (`circuits/`)

The circuit (`src/main.nr`) proves simultaneously:

1. **Voter membership** — the voter's Ethereum address is a leaf in the registered-voter
   Merkle tree (depth 10, Poseidon2 nodes, up to 1 024 voters).
2. **Key ownership** — an ECDSA signature over `blake2s(election_id)` ties the leaf
   address to the voter's private key.
3. **Nullifier correctness** — `nullifier = blake2s(sk || election_id)` is unique per
   (voter, election) and cannot be computed without the private key.
4. **Vote range** — `0 <= vote_choice < num_candidates <= 4`.

**Nullifier note:** Full PLUME (ERC-7524) nullifiers require `noir-bignum`, which is
incompatible with nargo 1.0.0-beta.13. The `blake2s`-based substitute has identical
security properties for this use case. A migration path to PLUME is documented in
`circuits/src/main.nr` and `circuits/Nargo.toml`.

### Smart Contracts (`contracts/`)

| Contract | Purpose |
|---|---|
| `HonkVerifier` | Auto-generated UltraHonk verifier (from `bb write_solidity_verifier`) |
| `ElectionManager` | Per-election contract: enforces time window, nullifier dedup, verifier call, tally |
| `ElectionFactory` | Deploys and tracks `ElectionManager` instances |

Public input layout passed to `ElectionManager.castVote()` (83 `bytes32` values):

| Index | Value |
|---|---|
| 0 | `merkle_root` |
| 1-32 | `nullifier` bytes (one `bytes32` per byte) |
| 33 | `vote_choice` |
| 34-65 | `election_id` bytes |
| 66 | `num_candidates` |
| 67-82 | UltraHonk pairing points (protocol-internal, supplied by prover) |

### Frontend (`frontend/`)

- Connect MetaMask, browse active elections, cast a vote
- Client-side proof generation via `@aztec/bb.js` + `@noir-lang/noir_js` (~10-30 s)
- Merkle tree built in-browser using `Barretenberg.poseidon2Permutation`
- Requires COOP/COEP headers for `SharedArrayBuffer` (configured in `vite.config.ts`)

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | >= 20 |
| nargo | 1.0.0-beta.13 |
| bb (Barretenberg) | >= 0.67.0 |

```bash
# Install nargo
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup --version 1.0.0-beta.13

# Install bb
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup --version 0.67.1
```

---

## Setup

```bash
git clone <repo>
cd zkvoting-app

(cd contracts && npm install)
(cd frontend  && npm install)
(cd scripts   && npm install)
```

---

## Circuits

```bash
cd circuits

# Compile
nargo compile

# Run all 13 tests
nargo test

# Regenerate proving/verification key (required if circuit changes)
bb write_vk -b target/vote.json -o target/vk

# Regenerate the Solidity verifier
bb write_solidity_verifier -s ultra_honk -k target/vk/vk -o ../contracts/src/Verifier.sol
```

---

## Contracts

```bash
cd contracts

# Compile
npx hardhat compile

# Run 10 Hardhat tests (uses MockVerifier — no ZK proof required)
npx hardhat test
```

---

## Frontend

```bash
cd frontend

cp .env.example .env   # fill in VITE_SEPOLIA_RPC_URL

npm run dev            # dev server with COOP/COEP headers
npm run build          # production build
```

After deploying contracts, copy `contracts/deployments/sepolia.json` to
`frontend/src/assets/deployments.json`.

---

## Deployment to Sepolia

```bash
export RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
export PRIVATE_KEY=0xYOUR_DEPLOYER_KEY

cd contracts
npx hardhat run scripts/deploy.ts --network sepolia
# Writes: contracts/deployments/sepolia.json

cp contracts/deployments/sepolia.json frontend/src/assets/deployments.json
```

---

## CLI Scripts

All scripts run from `scripts/` with `npx ts-node`.

### Build Merkle tree

```bash
cd scripts
npx ts-node create-election.ts
# VOTER_ADDRESSES=0xAbc...,0xDef... npx ts-node create-election.ts
# Output: scripts/output/election-setup.json
```

### Generate a ZK vote proof (Node.js)

```bash
cd scripts
VOTER_INDEX=0 VOTE_CHOICE=1 PRIVATE_KEY=0x... npx ts-node generate-test-proof.ts
# Output: scripts/output/proof.json  (~10-30 seconds)
```

### Submit proof to Sepolia

```bash
cd scripts
RPC_URL=https://... PRIVATE_KEY=0x... ELECTION_ADDRESS=0x... \
  npx ts-node verify-on-chain.ts
```

### End-to-end test on local Hardhat node

```bash
# Terminal 1
cd contracts && npx hardhat node

# Terminal 2
cd scripts && HARDHAT_RPC=http://127.0.0.1:8545 npx ts-node e2e-test.ts
```

Expected output:
```
PASS: vote 1 accepted (voter[0] -> candidate 1)
PASS: duplicate nullifier reverts
PASS: vote 2 accepted (voter[1] -> candidate 0)
PASS: tally[0] === 1
PASS: tally[1] === 1
PASS: tally[2] === 0
PASS: tally[3] === 0
All e2e checks passed.
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| **PLUME not yet integrated** | `blake2s(sk || election_id)` substitutes PLUME (ERC-7524). Migration path is documented in `circuits/src/main.nr`. Blocked on `noir-bignum` compatibility with nargo 1.0.0-beta.13. |
| **Proof generation time** | ~10-30 s client-side (UltraHonk over secp256k1 ECDSA + depth-10 Merkle). Acceptable for a demo; production would use a proving service. |
| **HonkVerifier size** | 25.5 KB — just over the 24.5 KB EIP-170 limit for Mainnet. Deployable on Sepolia/L2s without restriction. |
| **Max 1 024 voters** | Merkle tree depth is fixed at 10. Increase `DEPTH` in `main.nr` and regenerate the verifier to support more. |
| **Candidate names off-chain** | `ElectionManager` stores only the Merkle root and candidate count. Names are stored in `localStorage` keyed by `electionId`. |
| **Private key in browser** | The demo VotePanel prompts for a private key to generate the ECDSA signature locally. The key never leaves the browser, but production would use a hardware-wallet signing flow instead. |
