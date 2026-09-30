/**
 * Minimal typing of `node:fs` for renderer unit tests, which run in Node (Vitest).
 * The renderer tsconfig intentionally excludes `@types/node`; this merges cleanly
 * with it should it ever be added. Never import `node:fs` from production code.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
