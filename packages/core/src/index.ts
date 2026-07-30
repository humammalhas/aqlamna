import { parse } from "./parser/parser.js";
import { compileStory } from "./compiler/compiler.js";
import { validateStory } from "./parser/errors.js";

export function compile(source: string, filename: string): Record<string, unknown> {
  const ast = parse(source, filename);
  const errors = validateStory(ast);
  if (errors.length > 0) {
    throw errors[0]!;
  }
  return compileStory(ast, filename);
}
