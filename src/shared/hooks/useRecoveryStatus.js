import { useEffect, useState } from 'react';

const REPO = 'agarehim777-tech/exerp';
export function useRecoveryStatus() {
  const [status, setStatus] = useState({ loading: true, backup: null, restore: null, error: '' });
  useEffect(() => {
    let active = true;
    Promise.all(['backup-supabase.yml', 'restore-drill.yml'].map(async (workflow) => {
      const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=1`);
      if (!response.ok) throw new Error('GitHub workflow statusu alınmadı');
      return (await response.json()).workflow_runs?.[0] || null;
    })).then(([backup, restore]) => active && setStatus({ loading: false, backup, restore, error: '' }))
      .catch((error) => active && setStatus({ loading: false, backup: null, restore: null, error: error.message }));
    return () => { active = false; };
  }, []);
  return status;
}

