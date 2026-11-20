// Audit entry for a record created from the page's create modal, moved from App.jsx.
import { money } from "../../services/format.js";

type Row = Record<string, any>;

export function getCreateAudit(type: string, values: Row) {
  const auditByType: Record<string, { module: string; action: string; detail: string }> = {
    crm: { module: "CRM", action: "Müştəri yaradıldı", detail: values.name },
    sales: {
      module: "Satış",
      action: values.paymentMethod === "Kredit" ? "Kredit satış yaradıldı" : "Satış yaradıldı",
      detail: `${values.customer || "Müştəri"} · ${money(Number(values.orderTotal ?? values.amount ?? 0))}`,
    },
    dashboard: {
      module: "Satış",
      action: values.paymentMethod === "Kredit" ? "Kredit satış yaradıldı" : "Satış yaradıldı",
      detail: `${values.customer || "Müştəri"} · ${money(Number(values.orderTotal ?? values.amount ?? 0))}`,
    },
    finance: {
      module: "Maliyyə",
      action: "Xərc yaradıldı",
      detail: `${values.description || "Xərc"} · ${money(Number(values.amount || 0))}`,
    },
    credits: {
      module: "Kredit",
      action: "Manual kredit yaradıldı",
      detail: `${values.customer || "Müştəri"} · ${money(Number(values.total || 0))}`,
    },
    vendors: { module: "Vendor", action: "Vendor yaradıldı", detail: values.name },
    product: { module: "Məhsul", action: "Məhsul yaradıldı", detail: values.name },
    hr: { module: "HR", action: "Əməkdaş yaradıldı", detail: values.name },
    contracts: { module: "Müqavilə", action: "Müqavilə yaradıldı", detail: values.customer },
  };

  return auditByType[type] || { module: "Sistem", action: "Qeyd yaradıldı", detail: type };
}
