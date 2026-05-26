import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SharedArrayBuffer (required by Barretenberg WASM) needs COOP + COEP headers.
const wasmHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    exclude: ["@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/acvm_js", "@noir-lang/noirc_abi"],
  },

  server: {
    headers: wasmHeaders,
  },

  preview: {
    headers: wasmHeaders,
  },

  build: {
    target: "esnext",
  },
});
