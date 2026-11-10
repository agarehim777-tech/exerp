import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { canonicalPath, moduleFromPath, pathForModule } from '../../config/routes.js';

/** Preserve module URLs, historical aliases and query clearing in one place. */
export function useModuleNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActiveState] = useState<string>(() => moduleFromPath(location.pathname));
  const setActive = useCallback((id: string) => {
    setActiveState(id);
    const target = pathForModule(id);
    if (location.search || (location.pathname !== target && !location.pathname.startsWith(target + '/'))) {
      navigate(target);
    }
  }, [navigate, location.pathname, location.search]);

  useEffect(() => {
    const fromUrl = moduleFromPath(location.pathname);
    setActiveState(previous => previous === fromUrl ? previous : fromUrl);
    const target = canonicalPath(location.pathname);
    if (target && target !== '/') {
      navigate(target + location.search + location.hash, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return { active, setActive, location, navigate };
}