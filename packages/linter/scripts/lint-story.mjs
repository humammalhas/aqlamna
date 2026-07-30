import { lint } from "../src/index.js";
import { readFileSync } from "node:fs";

const src = readFileSync("../../stories/العطر_المفقود.qalam", "utf-8");
const diags = lint(src);

console.log("Total diagnostics:", diags.length, "\n");

// Group by ruleId
const groups = {};
for (const d of diags) {
  if (!groups[d.ruleId]) {
    groups[d.ruleId] = { count: 0, messages: [], example: d.messageAr };
  }
  groups[d.ruleId].count++;
  if (groups[d.ruleId].messages.length < 3) {
    const line = src.split("\n")[d.line - 1] ?? "";
    const snippet = line.substring(Math.max(0, d.column - 1), d.column + d.length + 20).trim();
    groups[d.ruleId].messages.push(`  L${d.line}:${d.column} «${snippet}»`);
  }
}

for (const [id, g] of Object.entries(groups).sort()) {
  console.log(`${id}: ${g.count} occurrence(s)`);
  console.log(`  ${g.example}`);
  if (g.messages.length) console.log(g.messages.join("\n"));
  console.log("");
}
