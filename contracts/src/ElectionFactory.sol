// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ElectionManager.sol";

/// @notice Deploys and tracks ElectionManager instances.
contract ElectionFactory {
    address[] private elections;

    event ElectionCreated(address indexed election, bytes32 indexed electionId);

    /// @notice Deploy a new ElectionManager.
    /// @param merkleRoot     Root of the registered-voter Merkle tree.
    /// @param numCandidates  Number of valid candidates (1-4).
    /// @param startTime      Unix timestamp when voting opens.
    /// @param endTime        Unix timestamp when voting closes.
    /// @param verifier       Address of the deployed HonkVerifier contract.
    /// @param electionId     32-byte unique election identifier.
    /// @return addr  Address of the newly deployed ElectionManager.
    function createElection(
        bytes32 merkleRoot,
        uint8 numCandidates,
        uint256 startTime,
        uint256 endTime,
        address verifier,
        bytes32 electionId
    ) external returns (address addr) {
        ElectionManager mgr = new ElectionManager(
            merkleRoot,
            numCandidates,
            startTime,
            endTime,
            verifier,
            electionId
        );
        addr = address(mgr);
        elections.push(addr);
        emit ElectionCreated(addr, electionId);
    }

    /// @notice Returns addresses of all deployed elections.
    function getElections() external view returns (address[] memory) {
        return elections;
    }
}
