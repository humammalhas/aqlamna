import { parse } from "./parser/parser.js";
import { compileStory } from "./compiler/compiler.js";
import { validateStory } from "./parser/errors.js";
import { tokenize } from "./parser/tokenizer.js";

export { tokenize };
export type { Token, TokenKind } from "./parser/tokenizer.js";

export function compile(source: string, filename: string): Record<string, unknown> {
  const ast = parse(source, filename);
  const errors = validateStory(ast);
  if (errors.length > 0) {
    throw errors[0]!;
  }
  return compileStory(ast, filename);
}
