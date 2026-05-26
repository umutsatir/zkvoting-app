// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVerifier {
    function verify(
        bytes calldata _proof,
        bytes32[] calldata _publicInputs
    ) external view returns (bool);
}

/// @notice Manages a single anonymous election using ZK proofs for vote privacy.
///
/// Public input layout (67 total, indices 0-66):
///   [0]     merkle_root    (Field)
///   [1..32] nullifier      ([u8;32], one bytes32 per byte)
///   [33]    vote_choice    (Field)
///   [34..65] election_id   ([u8;32], one bytes32 per byte)
///   [66]    num_candidates (Field)
contract ElectionManager {
    // -- immutable election parameters --
    IVerifier public immutable verifier;
    bytes32 public immutable merkleRoot;
    uint8 public immutable numCandidates;
    uint256 public immutable startTime;
    uint256 public immutable endTime;
    bytes32 public immutable electionId;

    // -- mutable vote state --
    mapping(bytes32 => bool) public usedNullifiers;
    uint256[4] private voteTally;

    event VoteCast(bytes32 indexed nullifier, uint8 indexed choice);

    constructor(
        bytes32 _merkleRoot,
        uint8 _numCandidates,
        uint256 _startTime,
        uint256 _endTime,
        address _verifier,
        bytes32 _electionId
    ) {
        require(_numCandidates >= 1 && _numCandidates <= 4, "invalid candidate count");
        require(_endTime > _startTime, "end must be after start");
        merkleRoot = _merkleRoot;
        numCandidates = _numCandidates;
        startTime = _startTime;
        endTime = _endTime;
        verifier = IVerifier(_verifier);
        electionId = _electionId;
    }

    /// @notice Cast an anonymous vote backed by a ZK proof.
    /// @param proof  Serialised UltraHonk proof bytes.
    /// @param publicInputs  67-element bytes32 array as described above.
    function castVote(
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        require(block.timestamp >= startTime, "Election not started");
        require(block.timestamp < endTime, "Election ended");
        require(publicInputs.length == 67, "wrong public input count");

        // Verify on-chain Merkle root matches
        require(publicInputs[0] == merkleRoot, "merkle root mismatch");

        // Extract and check nullifier (indices 1..32)
        bytes32 nullifierHash = _extractNullifier(publicInputs);
        require(!usedNullifiers[nullifierHash], "nullifier already used");

        // Verify election_id (indices 34..65) matches this contract's id
        require(_extractElectionId(publicInputs) == electionId, "election id mismatch");

        // Verify num_candidates (index 66)
        require(
            uint8(uint256(publicInputs[66])) == numCandidates,
            "num_candidates mismatch"
        );

        // Vote choice (index 33)
        uint8 choice = uint8(uint256(publicInputs[33]));
        require(choice < numCandidates, "choice out of range");

        // Run the ZK verifier
        require(verifier.verify(proof, publicInputs), "invalid proof");

        // Record the vote
        usedNullifiers[nullifierHash] = true;
        voteTally[choice] += 1;

        emit VoteCast(nullifierHash, choice);
    }

    /// @notice Returns the vote tally for each candidate (in order).
    function getResults() external view returns (uint256[4] memory) {
        return voteTally;
    }

    /// @notice Returns core election metadata.
    function getElectionInfo()
        external
        view
        returns (
            bytes32 root,
            uint8 candidates,
            uint256 start,
            uint256 end,
            bytes32 id
        )
    {
        return (merkleRoot, numCandidates, startTime, endTime, electionId);
    }

    // -- internal helpers --

    /// Pack nullifier bytes (public inputs 1-32) into a single bytes32 key.
    function _extractNullifier(bytes32[] calldata pi) internal pure returns (bytes32) {
        bytes memory b = new bytes(32);
        for (uint256 i = 0; i < 32; i++) {
            b[i] = bytes1(uint8(uint256(pi[1 + i])));
        }
        return bytes32(b);
    }

    /// Pack election_id bytes (public inputs 34-65) into a single bytes32.
    function _extractElectionId(bytes32[] calldata pi) internal pure returns (bytes32) {
        bytes memory b = new bytes(32);
        for (uint256 i = 0; i < 32; i++) {
            b[i] = bytes1(uint8(uint256(pi[34 + i])));
        }
        return bytes32(b);
    }
}
