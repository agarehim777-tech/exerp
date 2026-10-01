export const protectedProjects = ['tcqdhwtnjrwpfdxoijmv', 'cvjctwgdyzhijhzhhjqd'];

export function validateRestoreTarget(env) {
  if (env.RESTORE_CONFIRMATION !== 'RESTORE') throw new Error("confirmation == 'RESTORE' required");
  const ref = env.RESTORE_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref ?? '') || protectedProjects.includes(ref)) {
    throw new Error('Restore target must be a separate disposable project, never production or CI staging');
  }
  const url = new URL(env.RESTORE_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password) throw new Error('Invalid restore database URL');
  if (protectedProjects.some((id) => url.hostname.includes(id) || decodeURIComponent(url.username).includes(id))) {
    throw new Error('Protected database cannot be a restore target');
  }
  if (url.hostname !== `db.${ref}.supabase.co` && decodeURIComponent(url.username) !== `postgres.${ref}`) {
    throw new Error('Unexpected restore target');
  }
  if (env.RESTORE_DATABASE_URL === env.SUPABASE_DB_URL) throw new Error('Refuse production as restore target');
  return ref;
}

if (process.argv[1]?.endsWith('restore-target-guard.mjs')) {
  validateRestoreTarget(process.env);
  console.log('Disposable restore target verified');
}
