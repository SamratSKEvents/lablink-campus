// Bundle the API into one ESM file for Vercel's function runtime. Bundling resolves
// CommonJS-requires-ESM cases (firebase-admin -> jwks-rsa -> jose) at build time.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/app.ts"],
  outfile: "dist/api/app.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  // Google Cloud gRPC libraries read .proto files relative to __dirname, so they stay as
  // normal node_modules packages; everything else (incl. jwks-rsa -> jose) is bundled.
  external: ["@google-cloud/*", "google-gax", "@grpc/*", "protobufjs", "proto3-json-serializer"],
  logLevel: "warning",
  // Some CommonJS dependencies call require() for Node built-ins at runtime.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.info("built dist/api/app.mjs");
