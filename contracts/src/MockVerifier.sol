// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only verifier that always returns true.
contract MockVerifier {
    function verify(
        bytes calldata,
        bytes32[] calldata
    ) external pure returns (bool) {
        return true;
    }
}
