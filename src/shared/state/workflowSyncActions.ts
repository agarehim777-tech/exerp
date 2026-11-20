// HR and communication workflow sync moved from moduleActions.js: mirror an HR record or a message thread into
// enterprise workflow records. Failures only warn; the local state change has already happened.
import { saveWorkflowRecord as saveWorkflowRecordJs } from "../../services/enterpriseWorkflows.js";

type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };
// enterpriseWorkflows.js is untyped JavaScript, so TypeScript would treat its optional approvals as required.
const saveWorkflowRecord = saveWorkflowRecordJs as (input: { tenantId: string | null | undefined; module: string; record: Row; approvals?: unknown }) => Promise<unknown>;

export function createWorkflowSyncActions({ activeTenantId, notify }: {
  activeTenantId: string | null | undefined;
  notify: (message: string, tone?: string) => void;
}) {
  function syncHrWorkflow(recordType: string, item: Row | null | undefined, status: string, approvals?: unknown) {
    if (!activeTenantId || !item?.id) return;
    const employeeName = item.employeeName || item.name || "HR qeydi";
    void saveWorkflowRecord({
      tenantId: activeTenantId,
      module: "hr",
      record: {
        record_type: recordType,
        record_no: item.id,
        status,
        title: `${employeeName} - ${recordType}`,
        due_at: item.to ? `${item.to}T18:00:00` : null,
        amount: Number(item.netSalary || item.salary || 0),
        completed_at: ["approved", "paid", "completed", "rejected"].includes(status) ? new Date().toISOString() : null,
        payload: item,
      },
      approvals,
    }).catch((error) => notify(`HR workflow sinxronlaşmadı: ${error.message}`, "warning"));
  }

  function syncCommunicationWorkflow(thread: Row | null | undefined, status = "active") {
    if (!activeTenantId || !thread?.id) return;
    void saveWorkflowRecord({
      tenantId: activeTenantId,
      module: "communications",
      record: {
        record_type: thread.type === "group" ? "group_thread" : "direct_thread",
        record_no: thread.id,
        status,
        title: thread.title || thread.person || "Daxili yazışma",
        payload: {
          participant_ids: thread.participantIds || [],
          participants: thread.participants || [],
          team: thread.team || "",
          ticket_id: thread.ticketId || null,
          order_id: thread.orderId || null,
          credit_id: thread.creditId || null,
          customer_fin: thread.customerFin || null,
          message_count: (thread.messages || []).length,
          last_message: thread.preview || "",
          messages: thread.messages || [],
        },
      },
    }).catch((error) => notify(`Mesaj workflow sinxronlaşmadı: ${error.message}`, "warning"));
  }

  return { syncHrWorkflow, syncCommunicationWorkflow };
}
