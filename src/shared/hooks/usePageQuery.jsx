import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_NavigationContext, createSearchParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const PageQueryContext = createContext(null);

// BrowserRouter commits location changes inside a transition, so right after a sidebar click the new
// module can already be on screen while the router still reports the previous path. A relative "?q=..."
// navigation would then resolve against that previous path and pull the user back to the old module.
// Resolve page-query updates against the history's current URL instead (falls back to the rendered location).
function stripBasename(pathname, basename) {
  if (!basename || basename === '/') return pathname;
  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) return pathname;
  return pathname.slice(basename.length) || '/';
}

function useLatestPageQueryUpdater() {
  const navigate = useNavigate();
  const location = useLocation();
  const { navigator, basename } = useContext(UNSAFE_NavigationContext);
  const rendered = useRef(location);
  rendered.current = location;
  return useCallback((next, options) => {
    // BrowserRouter's navigator is the history object; data routers' navigator has no location.
    const historyLocation = /** @type {{ location?: { pathname: string, search: string, hash: string } }} */ (navigator)?.location;
    const current = historyLocation
      ? { pathname: stripBasename(historyLocation.pathname, basename), search: historyLocation.search, hash: historyLocation.hash }
      : rendered.current;
    const resolved = createSearchParams(typeof next === 'function' ? next(new URLSearchParams(current.search)) : next);
    const search = resolved.toString();
    navigate({ pathname: current.pathname, search: search ? `?${search}` : '', hash: current.hash }, options);
  }, [navigate, navigator, basename]);
}

export function PageQueryProvider({ children, scope }) {
  const [params] = useSearchParams();
  const setParams = useLatestPageQueryUpdater();
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
