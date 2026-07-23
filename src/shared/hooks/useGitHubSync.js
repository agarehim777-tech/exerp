import { useEffect, useRef, useState } from "react";

const REPO = import.meta.env.VITE_GITHUB_REPO || "";
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || "main";
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN || "";
const POLL_MS = 60_000;

export function useGitHubSync({ enabled = true, onPush } = {}) {
  const [status, setStatus] = useState(REPO ? "idle" : "ok");
  const [lastSyncAt, setLastSyncAt] = useState(REPO ? null : new Date());
  const [lastCommit, setLastCommit] = useState(null);
  const [error, setError] = useState(null);
  const lastShaRef = useRef(null);
  const onPushRef = useRef(onPush);

  useEffect(() => {
    onPushRef.current = onPush;
  }, [onPush]);

  useEffect(() => {
    if (!enabled) return;

    // No GitHub repo configured: the project is synced through Lovable's
    // internal storage, so there is nothing to poll on GitHub. Show a calm
    // "ok" state without calling an external API.
    if (!REPO) {
      setStatus("ok");
      setLastSyncAt(new Date());
      setError(null);
      return;
    }

    let cancelled = false;
    let timer = null;

    async function check() {
      try {
        const headers = {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };
        if (TOKEN) {
          headers.Authorization = `Bearer ${TOKEN}`;
        }

        const res = await fetch(
          `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
          { headers }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`GitHub ${res.status}: ${body}`);
        }
        const data = await res.json();
        if (cancelled) return;

        const sha = data.sha?.slice(0, 7) ?? "?";
        const message = data.commit?.message?.split("\n")[0] ?? "";
        const date = data.commit?.committer?.date || data.commit?.author?.date;
        const committedAt = date ? new Date(date) : null;

        setLastCommit({ sha, message, committedAt });
        setLastSyncAt(new Date());
        setError(null);

        if (lastShaRef.current && lastShaRef.current !== sha) {
          setStatus("synced");
          onPushRef.current?.({ sha, message, committedAt });
        } else {
          setStatus("ok");
        }
        lastShaRef.current = sha;
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err.message);
        }
      }
    }

    check();
    timer = window.setInterval(check, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return {
    status,
    lastSyncAt,
    lastCommit,
    error,
    repo: REPO || "Lovable Cloud",
    branch: BRANCH,
    isLovableOnly: !REPO,
  };
}
