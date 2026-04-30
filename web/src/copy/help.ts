// Re-export of shared/copy/help.js for web consumers.
// Source-of-truth migrated from .json → .js because WeApp `require()` cannot
// resolve `.json` extensions (same constraint that forced the earlier `.cjs → .js` rename).
// Vite + TS happily import the CommonJS default export through esModuleInterop.
// @ts-ignore — plain CJS module, no .d.ts shipped (data shape declared inline below).
import help from '../../../shared/copy/help.js'

export default help

export const expectations = (help as { expectations: { promise: string; title: string } }).expectations
