import { createAuditBackend, verifyRestrictedRoleAudit } from './supabase-audit-backend.mjs';

const backend = await createAuditBackend(process.env);
const evidence = await verifyRestrictedRoleAudit(process.env, backend.session.user.id);
console.log(JSON.stringify(evidence));
