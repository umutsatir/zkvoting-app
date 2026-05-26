// Poseidon2-based binary Merkle tree helper.
//
// Leaf values are Ethereum addresses packed as Field elements (20 bytes,
// big-endian, fitting in a BN254 field element since 2^160 < p).
// Internal nodes: state = [left, right, 0, 0], one permutation, output = state[0].

/// Hash two field elements as a Poseidon2 2-to-1 node.
// state_length must equal array length -- use 4-element state (t=4 variant).
pub fn hash_node(left: Field, right: Field) -> Field {
    std::hash::poseidon2_permutation([left, right, 0, 0])[0]
}

/// Recompute the Merkle root from a leaf and its authentication path.
///
/// - leaf:    the leaf value (Ethereum address packed as Field)
/// - path:    sibling hashes from leaf level up to root
/// - indices: direction bits -- 0 means current node is LEFT child
///            (sibling is on the right); 1 means RIGHT child
pub fn compute_root<let DEPTH: u32>(
    leaf: Field,
    path: [Field; DEPTH],
    indices: [bool; DEPTH],
) -> Field {
    let mut current = leaf;
    for i in 0..DEPTH {
        let (left, right) = if !indices[i] {
            (current, path[i])
        } else {
            (path[i], current)
        };
        current = hash_node(left, right);
    }
    current
}
