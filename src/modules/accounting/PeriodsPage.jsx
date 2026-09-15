import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAccountingPeriods } from "../../shared/hooks/useAccountingPeriods.js";
import { Badge, Button, Card, DataTable, FormGrid, Input, Notice, PageStack, StatCard, StatGrid, TableActions } from "../../shared/ui/primitives.jsx";

const STATUS_LABEL = { open: "Açıq", locked: "Bağlı", closed: "Yekunlaşıb" };
const STATUS_TONE = { open: "green", locked: "amber", closed: "gray" };

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    name: start.toLocaleDateString("az-AZ", { year: "numeric", month: "long" }),
    start_date: iso(start),
    end_date: iso(end),
  };
}

export default function PeriodsPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const isAdmin = ["owner", "admin"].includes(activeMembership?.role);
  const { periods, loading, create, setStatus, remove } = useAccountingPeriods(tenantId);
  const [form, setForm] = useState(() => monthRange(0));
  const [msg, setMsg] = useState("");

  const stats = useMemo(() => ({
    total: periods.length,
    open: periods.filter((p) => p.status === "open").length,
    locked: periods.filter((p) => p.status !== "open").length,
  }), [periods]);

  const run = async (fn) => {
    setMsg("");
    try { await fn(); } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  if (!tenantId) return <Card>Aktiv şirkət seçilməyib.</Card>;

  return (
    <PageStack>
      <StatGrid>
        <StatCard label="Dövr sayı" value={stats.total} />
        <StatCard label="Açıq" value={stats.open} />
        <StatCard label="Bağlı" value={stats.locked} />
      </StatGrid>

      {msg && <Notice tone="danger">{msg}</Notice>}

      <Card title="Dövr kilidi necə işləyir?">
        <p className="ui-help-text">
          Dövr <b>Bağlı</b> statusuna keçəndə həmin tarix aralığına düşən jurnal yazılışları və satış
          fakturaları üçün yaratma, dəyişdirmə və silmə əməliyyatları verilənlər bazası səviyyəsində
          bloklanır. Bu, keçmiş hesabat dövrlərinin sonradan dəyişdirilməsinin qarşısını alır.
        </p>
      </Card>

      {isAdmin && (
        <Card title="Yeni dövr">
          <FormGrid>
            <Input
              placeholder="Dövr adı"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
            <Button variant="secondary" onClick={() => setForm(monthRange(-1))}>Keçən ay</Button>
            <Button variant="secondary" onClick={() => setForm(monthRange(0))}>Bu ay</Button>
            <Button
              onClick={() => run(async () => {
                await create(form);
                setForm(monthRange(0));
              })}
            >
              + Dövr yarat
            </Button>
          </FormGrid>
        </Card>
      )}

      <Card title={`Mühasibat dövrləri (${periods.length})`}>
        <DataTable columns={[{ key: "name", label: "Dövr" }, { key: "start_date", label: "Başlanğıc" }, { key: "end_date", label: "Bitmə" }, { key: "status", label: "Status" }, { key: "locked_at", label: "Bağlanma" }, { key: "actions", label: "" }]} rows={periods} emptyText={loading ? "Yüklənir…" : "Dövr yaradılmayıb."} renderCell={(period, column) => ({
          name: <strong>{period.name}</strong>,
          start_date: new Date(period.start_date).toLocaleDateString("az-AZ"),
          end_date: new Date(period.end_date).toLocaleDateString("az-AZ"),
          status: <Badge tone={STATUS_TONE[period.status] === "green" ? "success" : STATUS_TONE[period.status] === "amber" ? "warning" : "neutral"}>{STATUS_LABEL[period.status] || period.status}</Badge>,
          locked_at: period.locked_at ? new Date(period.locked_at).toLocaleString("az-AZ") : "—",
          actions: isAdmin && <TableActions><Button variant="secondary" size="compact" onClick={() => run(() => setStatus(period.id, period.status === "open" ? "locked" : "open"))}>{period.status === "open" ? "Bağla" : "Aç"}</Button><Button variant="danger" size="compact" onClick={() => window.confirm("Dövr silinsin?") && run(() => remove(period.id))}>Sil</Button></TableActions>,
        })[column.key]} />
      </Card>
    </PageStack>
  );
}
