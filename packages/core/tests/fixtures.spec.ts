import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { compile } from "../src/index.js";

const FIXTURES_DIR = join(__dirname, "fixtures");

function findFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => extname(f) === ".qalam")
    .map((f) => basename(f, ".qalam"));
}

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.qalam`), "utf-8");
}

function readExpected(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), "utf-8"),
  ) as Record<string, unknown>;
}

function stripMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const { metadata: _, ...rest } = obj;
  return rest;
}

const fixtureNames = findFixtures();

describe("Fixture tests", () => {
  for (const name of fixtureNames) {
    test(name, () => {
      const source = readFixture(name);
      const result = compile(source, join(FIXTURES_DIR, `${name}.qalam`));
      const stripped = stripMetadata(result as Record<string, unknown>);
      const expected = readExpected(name);

      expect(stripped).toEqual(expected);
    });
  }
});
