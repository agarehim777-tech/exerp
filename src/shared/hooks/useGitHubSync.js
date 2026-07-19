import { useEffect, useRef, useState } from "react";

const REPO = "agarehim777-tech/ERP--LOVABLE";
const BRANCH = "main";
const POLL_MS = 60_000;

export function useGitHubSync({ enabled = true, onPush } = {}) {
  const [status, setStatus] = useState("idle");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [lastCommit, setLastCommit] = useState(null);
  const [error, setError] = useState(null);
  const lastShaRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer = null;

    async function check() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
          {
            headers: { Accept: "application/vnd.github+json" },
          }
        );
        if (!res.ok) {
          throw new Error(`GitHub ${res.status}`);
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
          onPush?.({ sha, message, committedAt });
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
  }, [enabled, onPush]);

  return { status, lastSyncAt, lastCommit, error, repo: REPO, branch: BRANCH };
}
