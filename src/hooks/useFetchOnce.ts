import { useEffect, useRef } from "react";

/**
 * Runs `fn` once when `deps` change.
 * Safe against React StrictMode double-invoke.
 * Use instead of bare useEffect for data fetching.
 *
 * Usage:
 *   useFetchOnce(fetchData, [token, storeId]);
 */
export function useFetchOnce(
  fn: () => void | Promise<void>,
  deps: unknown[]
) {
  const fnRef   = useRef(fn);
  const depsRef = useRef<unknown[]>([]);

  // Keep fnRef pointing at latest fn without triggering re-run
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    // Shallow compare to detect real dep changes
    const same =
      depsRef.current.length === deps.length &&
      deps.every((d, i) => Object.is(d, depsRef.current[i]));

    if (same) return;
    depsRef.current = deps;
    void fnRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
