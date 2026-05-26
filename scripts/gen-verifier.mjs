import { UltraHonkBackend } from "@aztec/bb.js";
import { readFileSync, writeFileSync } from "fs";
import { gunzipSync } from "zlib";

const circuitPath = process.argv[2];
const outputPath = process.argv[3];

const circuit = JSON.parse(readFileSync(circuitPath, "utf8"));
const bytecodeGz = Buffer.from(circuit.bytecode, "base64");
const bytecode = gunzipSync(bytecodeGz);

console.log("Loaded circuit, bytecode size:", bytecode.length);

const backend = new UltraHonkBackend(circuit.bytecode);

console.log("Instantiating backend (this may take a while)...");
const solidity = await backend.getSolidityVerifier();

writeFileSync(outputPath, solidity);
console.log("Wrote Solidity verifier to:", outputPath);
process.exit(0);
