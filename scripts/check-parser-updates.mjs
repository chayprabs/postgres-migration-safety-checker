#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "packages", "pg-migration-analyzer", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.dependencies["@supabase/pg-parser"];

const response = await fetch("https://registry.npmjs.org/@supabase/pg-parser/latest");
const latest = (await response.json()).version;

console.log(`@supabase/pg-parser pinned: ${current}`);
console.log(`@supabase/pg-parser latest:  ${latest}`);

if (current !== latest) {
  console.log("\nA newer pg-parser release is available. Review release notes before upgrading.");
  process.exitCode = 0;
} else {
  console.log("\nPinned version matches npm latest.");
}
