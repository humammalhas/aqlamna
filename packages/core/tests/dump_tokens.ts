import { dumpTokens } from "../src/parser/tokenizer.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

const names = ["01_minimal", "02_choices", "03_variables"];
for (const name of names) {
  console.log("=== Fixture " + name + " ===");
  const source = readFileSync(join(fixturesDir, name + ".qalam"), "utf-8");
  console.log(dumpTokens(source));
  console.log("");
}
