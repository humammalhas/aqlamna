// Types for bidi-isolate.mjs — the build scripts are plain ESM JavaScript,
// but the editor's test suite imports this module and typechecks it.

/** Regex source for a maximal run of printable ASCII. */
export declare const ASCII_RUN_SOURCE: string;

/** Wrap every printable-ASCII run of an already-escaped string in an LTR isolate. */
export declare function isolateAscii(escaped: string): string;
