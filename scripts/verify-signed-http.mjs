import { createAuditBackend } from './supabase-audit-backend.mjs';
import { verifyWebhookAudit } from './verify-webhook-audit.mjs';

const backend = await createAuditBackend(process.env);
console.log(JSON.stringify(await verifyWebhookAudit(backend)));
