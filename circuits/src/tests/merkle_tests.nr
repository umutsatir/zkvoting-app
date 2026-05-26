// Unit tests for merkle::hash_node and merkle::compute_root.
// All tests use Poseidon2 internally; expected values are derived
// inside the tests themselves to avoid hardcoding permutation outputs.

use crate::merkle;

// hash_node(a, b) is deterministic and order-sensitive.
#[test]
fn test_hash_node_deterministic() {
    let h1 = merkle::hash_node(1, 2);
    let h2 = merkle::hash_node(1, 2);
    assert(h1 == h2);
}

#[test]
fn test_hash_node_not_symmetric() {
    let h_ab = merkle::hash_node(1, 2);
    let h_ba = merkle::hash_node(2, 1);
    assert(h_ab != h_ba);
}

// Depth-1 tree: root = hash_node(leaf, sibling) when index==0 (leaf is left).
#[test]
fn test_compute_root_depth1_left() {
    let leaf: Field = 42;
    let sibling: Field = 99;
    let expected = merkle::hash_node(leaf, sibling);
    let got = merkle::compute_root(leaf, [sibling], [false]);
    assert(got == expected);
}

// Depth-1 tree: root = hash_node(sibling, leaf) when index==1 (leaf is right).
#[test]
fn test_compute_root_depth1_right() {
    let leaf: Field = 42;
    let sibling: Field = 99;
    let expected = merkle::hash_node(sibling, leaf);
    let got = merkle::compute_root(leaf, [sibling], [true]);
    assert(got == expected);
}

// Depth-2 tree consistency check: build root two different ways.
// Tree:
//      root
//     /    \
//   h01    h23
//   / \    / \
//  L0  L1 L2  L3
//
// Prove L0 (indices=[0,0]), path=[L1, h23].
#[test]
fn test_compute_root_depth2_consistency() {
    let l0: Field = 10;
    let l1: Field = 20;
    let l2: Field = 30;
    let l3: Field = 40;

    let h01 = merkle::hash_node(l0, l1);
    let h23 = merkle::hash_node(l2, l3);
    let root = merkle::hash_node(h01, h23);

    // Prove L0: left child at level 0, left child at level 1
    let got0 = merkle::compute_root(l0, [l1, h23], [false, false]);
    assert(got0 == root);

    // Prove L1: right child at level 0, left child at level 1
    let got1 = merkle::compute_root(l1, [l0, h23], [true, false]);
    assert(got1 == root);

    // Prove L2: left child at level 0, right child at level 1
    let got2 = merkle::compute_root(l2, [l3, h01], [false, true]);
    assert(got2 == root);

    // Prove L3: right child at level 0, right child at level 1
    let got3 = merkle::compute_root(l3, [l2, h01], [true, true]);
    assert(got3 == root);
}

// Depth-10 tree: leaf at position 0 (all left), all siblings = 0.
// The root is computed and compared to itself -- verifies no panic/abort
// and that the output is deterministic over the full 10-level path.
#[test]
fn test_compute_root_depth10_leftmost() {
    let leaf: Field = 1210930943336347771396396330116102456817544228795; // addr field
    let path = [0 as Field; 10];
    let indices = [false; 10];

    let root1 = merkle::compute_root(leaf, path, indices);
    let root2 = merkle::compute_root(leaf, path, indices);
    assert(root1 == root2);

    // A different leaf should produce a different root (sanity check)
    let root_other = merkle::compute_root(leaf + 1, path, indices);
    assert(root1 != root_other);
}
