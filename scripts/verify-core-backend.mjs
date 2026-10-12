import { readEnvironment } from './read-environment.mjs';
import { probeBackend } from './backend-probe.mjs';
import { checkCoreBackend } from './core-backend-contract.mjs';

const env = readEnvironment();
try {
  const report = await checkCoreBackend(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, probeBackend,
    { expectedProjectRef: process.env.EXPECTED_SUPABASE_PROJECT_REF });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
