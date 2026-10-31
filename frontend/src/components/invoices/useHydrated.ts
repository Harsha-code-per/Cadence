"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 * Role-dependent buttons stay out of the first paint so the server HTML and the
 * hydrated tree agree, then appear once /auth/me/ is available.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
