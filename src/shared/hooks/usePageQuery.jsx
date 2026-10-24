import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const PageQueryContext = createContext(null);

export function PageQueryProvider({ children, scope }) {
  const [params, setParams] = useSearchParams();
  const previousScope = useRef(scope);
  const scopeChanged = previousScope.current !== scope;
  useEffect(() => {
    if (!scopeChanged) return;
    previousScope.current = scope;
    setParams(new URLSearchParams(), { replace: true });
  }, [scope, scopeChanged, setParams]);
  const value = useMemo(() => ({ params: scopeChanged ? new URLSearchParams() : params, setParams }), [params, setParams, scopeChanged]);
  return <PageQueryContext.Provider value={value}>{children}</PageQueryContext.Provider>;
}

// Standalone component previews use local state; the app persists the same state in its URL.
export function usePageQuery(defaults) {
  const context = useContext(PageQueryContext);
  const [local, setLocal] = useState(defaults);
  const read = params => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, params.get(key) ?? fallback]));
  const value = context ? read(context.params) : local;
  const update = (patch, options = {}) => {
    if (!context) {
      setLocal(previous => ({ ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) }));
      return;
    }
    context.setParams(previous => {
      const next = new URLSearchParams(previous);
      const changes = typeof patch === 'function' ? patch(read(previous)) : patch;
      for (const [key, entry] of Object.entries(changes)) {
        if (entry == null || entry === '' || String(entry) === String(defaults[key])) next.delete(key);
        else next.set(key, String(entry));
      }
      return next;
    }, options);
  };
  return [value, update];
}
