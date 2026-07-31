// Remove CUSTOM provider from providers.ts
import { readFileSync, writeFileSync } from "fs";
let src = readFileSync("packages/editor/src/lib/providers.ts", "utf8");

const marker = "export const CUSTOM: ProviderConfig = {";
const endMarker = "export const ALL_OPENAI_COMPATIBLE: ProviderConfig[] = [";
const start = src.indexOf(marker);
const end = src.indexOf(endMarker);
if (start === -1 || end === -1) { console.error("Markers not found"); process.exit(1); }
const block = src.slice(start, end);
const lastClose = block.lastIndexOf("};");
if (lastClose === -1) { console.error("Closing }; not found"); process.exit(1); }
const removeEnd = start + lastClose + 2;
src = src.slice(0, start) + "// CUSTOM provider removed — orphaned localStorage key handled by getProviderSafe() fallback\n" + src.slice(removeEnd);
writeFileSync("packages/editor/src/lib/providers.ts", src);
console.log("CUSTOM provider removed. Lines:", src.split("\n").length);
