// Optional self-hosted API session (VITE_API_BASE_URL), moved from App.jsx: restore the server session on load,
// save the whole state to the server 500 ms after it changes, and sign in with email and password.
// Logging out stays in App.jsx because it also signs out of Supabase and navigates.
import { useEffect, useRef, useState } from "react";
import { initialState, navItems } from "../../data.js";
import {
  getRemoteSession,
  getRemoteToken,
  loadRemoteState,
  loginRemote,
  remoteApiEnabled,
  saveRemoteState,
  setRemoteToken,
} from "../../remote-api.js";
import { hydrateState } from "../lib/stateHydration.ts";

type Row = Record<string, any>;

export function useRemoteApiSession({ activeTenantId, authUser, notify, setAuthError, setState, state, tenantStateReady }: {
  activeTenantId: string | null | undefined;
  authUser: { id?: string } | null | undefined;
  notify: (message: string, tone?: string) => void;
  setAuthError: (message: string) => void;
  setState: (update: Row | ((current: Row) => Row)) => void;
  state: Row;
  tenantStateReady: boolean;
}) {
  const [remoteAuthStatus, setRemoteAuthStatus] = useState(remoteApiEnabled ? "checking" : "local");
  const [remoteUser, setRemoteUser] = useState<Row | null>(null);
  const remoteSaveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!remoteApiEnabled) return undefined;
    let active = true;
    const token = getRemoteToken();

    if (!token) {
      setState((current) =>
        hydrateState({
          ...current,
          settings: { ...current.settings, sessionUserId: null },
        }),
      );
      setRemoteAuthStatus("signedOut");
      return undefined;
    }

    getRemoteSession()
      .then(async (session) => {
        if (!active) return;
        setRemoteUser(session.user);
        if (session.user.mustChangePassword) {
          setRemoteAuthStatus("signedIn");
          setAuthError("");
          return;
        }
        const payload = await loadRemoteState();
        if (!active) return;
        const tenantUsers = payload.state?.settings?.users || initialState.settings.users || [];
        const sessionUser = { ...session.user, moduleAccess: session.user.companyModules || navItems.map((item) => item.id) };
        const users = tenantUsers.some((user: Row) => user.id === session.user.id)
          ? tenantUsers.map((user: Row) => (user.id === session.user.id ? { ...user, ...sessionUser } : user))
          : [sessionUser, ...tenantUsers];
        setState(
          hydrateState({
            ...(payload.state || initialState),
            settings: {
              ...(payload.state?.settings || initialState.settings),
              users,
              sessionUserId: session.user.id,
              currentRole: session.user.role,
            },
          }),
        );
        setRemoteAuthStatus("signedIn");
        setAuthError("");
      })
      .catch((error) => {
        if (!active) return;
        setRemoteUser(null);
        setRemoteToken("");
        setState((current) =>
          hydrateState({
            ...current,
            settings: { ...current.settings, sessionUserId: null },
          }),
        );
        setRemoteAuthStatus("signedOut");
        setAuthError(error instanceof Error ? error.message : "Server sessiyası açılmadı.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!remoteApiEnabled || !getRemoteToken()) {
      return undefined;
    }
    window.clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = window.setTimeout(() => {
      saveRemoteState(state).catch((error) => {
        setAuthError(error instanceof Error ? error.message : "Serverə yazılış alınmadı.");
      });
    }, 500);
    return () => {
      window.clearTimeout(remoteSaveTimer.current);
    };
  }, [state, remoteUser?.role, activeTenantId, authUser?.id, tenantStateReady]);

  async function loginWithPassword({ email, password }: { email: string; password: string }) {
    if (!remoteApiEnabled) return;
    setRemoteAuthStatus("checking");
    setAuthError("");
    try {
      const login = await loginRemote(email, password);
      setRemoteToken(login.token);
      setRemoteUser(login.user);
      if (login.user.mustChangePassword) {
        setRemoteAuthStatus("signedIn");
        notify("İlk giriş üçün yeni parol təyin edin.");
        return;
      }
      const payload = await loadRemoteState();
      const tenantUsers = payload.state?.settings?.users || initialState.settings.users || [];
      const sessionUser = { ...login.user, moduleAccess: login.user.companyModules || navItems.map((item) => item.id) };
      const users = tenantUsers.some((user: Row) => user.id === login.user.id)
        ? tenantUsers.map((user: Row) => (user.id === login.user.id ? { ...user, ...sessionUser } : user))
        : [sessionUser, ...tenantUsers];
      setState(
        hydrateState({
          ...(payload.state || initialState),
          settings: {
            ...(payload.state?.settings || initialState.settings),
            users,
            sessionUserId: login.user.id,
            currentRole: login.user.role,
          },
        }),
      );
      setRemoteAuthStatus("signedIn");
      notify(`${login.user.name} kimi giriş edildi.`);
    } catch (error) {
      setRemoteToken("");
      setRemoteUser(null);
      setRemoteAuthStatus("signedOut");
      setAuthError(error instanceof Error ? error.message : "Giriş alınmadı.");
    }
  }

  return { remoteAuthStatus, setRemoteAuthStatus, remoteUser, setRemoteUser, loginWithPassword };
}
