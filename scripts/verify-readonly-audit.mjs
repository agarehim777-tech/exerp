import { createAuditBackend, verifyRestrictedRoleAudit } from './supabase-audit-backend.mjs';
import { verifyWebhookAudit } from './verify-webhook-audit.mjs';

const backend = await createAuditBackend(process.env);
const evidence = await verifyRestrictedRoleAudit(process.env, backend.session.user.id);
console.log(JSON.stringify(evidence));
console.log(JSON.stringify(await verifyWebhookAudit(backend)));
