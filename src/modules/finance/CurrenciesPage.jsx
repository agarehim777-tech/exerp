import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useCurrencies } from "../../shared/hooks/useCurrencies.js";
import { Badge, Button, Card, DataTable, Field, FormGrid, Input, Notice, PageStack, Select } from "../../shared/ui/primitives.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function CurrenciesPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const fx = useCurrencies(tenantId);
  const [form, setForm] = useState({ code: "", name: "", symbol: "" });
  const [rateForm, setRateForm] = useState({ currency_code: "", rate_date: today(), rate: "" });
  const [msg, setMsg] = useState(null);

  if (!tenantId) return <Card>Aktiv şirkət seçilməyib.</Card>;

  const run = async (fn, ok) => {
    try { await fn(); setMsg({ type: "ok", text: ok }); }
    catch (e) { setMsg({ type: "err", text: e.message || String(e) }); }
  };

  return (
    <PageStack>
      {msg && <Notice tone={msg.type === "err" ? "danger" : "info"}>{msg.text}</Notice>}
      {fx.degraded && <Notice tone="warning">Canlı yenilənmə kəsildi — məlumatlar avtomatik yenidən sinxronlaşdırılır…</Notice>}
      {fx.error && <Notice tone="danger">Xəta: {fx.error}</Notice>}

      <Card title="Valyutalar">
        <p className="ui-help-text">
          Əsas valyuta: <strong>{fx.baseCurrency?.code || "—"}</strong>. Digər valyutalar məzənnə ilə əsas valyutaya çevrilir.
        </p>
        <FormGrid className="ui-form-surface ui-spacer-top">
          <Field label="Kod">
            <Input value={form.code} placeholder="USD"
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Ad">
            <Input value={form.name} placeholder="ABŞ dolları"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Simvol">
            <Input value={form.symbol} placeholder="$"
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} />
          </Field>
          <Button disabled={!form.code}
            onClick={() => run(async () => { await fx.addCurrency(form); setForm({ code: "", name: "", symbol: "" }); }, "Valyuta əlavə olundu.")}>
            Əlavə et
          </Button>
        </FormGrid>

        <DataTable columns={[{ key: "code", label: "Kod" }, { key: "name", label: "Ad" }, { key: "symbol", label: "Simvol" }, { key: "rate", label: "Cari məzənnə", align: "right" }, { key: "status", label: "Status" }, { key: "actions", label: "" }]} rows={fx.currencies} emptyText="Valyuta yoxdur." renderCell={(c, column) => ({
          code: <strong>{c.code}</strong>, name: c.name, symbol: c.symbol || "—",
          rate: c.is_base ? "1.000000 (əsas)" : fx.rateFor(c.code).toFixed(6),
          status: <><Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Aktiv" : "Deaktiv"}</Badge>{c.is_base && <Badge tone="warning">Əsas</Badge>}</>,
          actions: !c.is_base && <Button variant="secondary" size="compact" onClick={() => run(() => fx.toggleActive(c.id, !c.is_active), "Yeniləndi.")}>{c.is_active ? "Deaktiv et" : "Aktiv et"}</Button>,
        })[column.key]} />
      </Card>

      <Card title="Məzənnə tarixçəsi">
        <FormGrid className="ui-form-surface">
          <Field label="Valyuta">
            <Select value={rateForm.currency_code}
              onChange={(e) => setRateForm((f) => ({ ...f, currency_code: e.target.value }))}>
              <option value="">Seçin</option>
              {fx.currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
            </Select>
          </Field>
          <Field label="Tarix">
            <Input type="date" value={rateForm.rate_date}
              onChange={(e) => setRateForm((f) => ({ ...f, rate_date: e.target.value }))} />
          </Field>
          <Field label={`Məzənnə (${fx.baseCurrency?.code || "əsas"})`}>
            <Input type="number" step="0.000001" value={rateForm.rate}
              onChange={(e) => setRateForm((f) => ({ ...f, rate: e.target.value }))} />
          </Field>
          <Button
            disabled={!rateForm.currency_code || !Number(rateForm.rate)}
            onClick={() => run(async () => { await fx.setRate(rateForm); setRateForm((f) => ({ ...f, rate: "" })); }, "Məzənnə yadda saxlanıldı.")}>
            Yadda saxla
          </Button>

        </FormGrid>
        <DataTable columns={[{ key: "rate_date", label: "Tarix" }, { key: "currency_code", label: "Valyuta" }, { key: "rate", label: "Məzənnə", align: "right" }, { key: "source", label: "Mənbə" }]} rows={fx.rates} emptyText="Məzənnə qeydi yoxdur." renderCell={(r, column) => column.key === "rate" ? Number(r.rate).toFixed(6) : r[column.key]} />
      </Card>
    </PageStack>
  );
}
