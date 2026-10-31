import type { LedgerState } from './Ledger';

/** Shared with the WebGL loop; sections mutate it directly so scrolling never re-renders React. */
export const world: LedgerState = { morph: 0, sub: 0, track: 0.5 };
