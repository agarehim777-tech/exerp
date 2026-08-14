import { useMemo, useState } from "react";
import { ArrowLeft, Award, Percent, Users, Wallet } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, percent } from "../services/format.js";

function monthKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("az-AZ", { month: "long", year: "numeric" }).format(date);
}

export default function BonusesPage({ salesBonuses = [] }) {
  const months = useMemo(() => {
    const set = new Set(salesBonuses.map((row) => monthKey(row.date)).filter(Boolean));
    set.add(monthKey(new Date().toISOString()));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [salesBonuses]);

  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()));
  const [seller, setSeller] = useState(null);

  const periodRows = useMemo(
    () => (month === "all" ? salesBonuses : salesBonuses.filter((row) => monthKey(row.date) === month)),
    [salesBonuses, month],
  );

  const sellerRows = useMemo(() => {
    const map = new Map();
    periodRows.forEach((row) => {
      const name = row.seller || "Təyin edilməyib";
      const current = map.get(name) || { seller: name, bonus: 0, paid: 0, orders: new Set(), customers: new Set(), rate: 0, lines: 0 };
      current.bonus += Number(row.bonusAmount || 0);
      current.paid += Number(row.paid || 0);
      current.rate += Number(row.rate || 0);
      current.lines += 1;
      if (row.orderId) current.orders.add(row.orderId);
      if (row.customer) current.customers.add(row.customer);
      map.set(name, current);
    });
    return [...map.values()]
      .map((row) => ({
        ...row,
        orders: row.orders.size,
        customers: row.customers.size,
        avgRate: row.lines ? row.rate / row.lines : 0,
      }))
      .sort((a, b) => b.bonus - a.bonus);
  }, [periodRows]);

  const detailRows = useMemo(
    () => (seller ? periodRows.filter((row) => (row.seller || "Təyin edilməyib") === seller) : []),
    [periodRows, seller],
  );

  const detailLineItems = useMemo(() => {
    const rows = [];
    detailRows.forEach((row) => {
      (row.productLines || []).forEach((line) => {
        const qty = Number(line.qty || 0);
        const price = Number(line.price || 0);
        rows.push({
          orderId: row.orderId,
          customer: row.customer,
          seller: row.seller,
          product: line.product,
          qty,
          price,
          amount: qty * price,
        });
      });
    });
    return rows.sort((a, b) => b.amount - a.amount);
  }, [detailRows]);

  const detailByCustomer = useMemo(() => {
    const map = new Map();
    detailRows.forEach((row) => {
      const name = row.customer || "Müştəri yoxdur";
      const current = map.get(name) || { customer: name, bonus: 0, paid: 0, orders: 0 };
      current.bonus += Number(row.bonusAmount || 0);
      current.paid += Number(row.paid || 0);
      current.orders += 1;
      map.set(name, current);
    });
    return [...map.values()].sort((a, b) => b.bonus - a.bonus);
  }, [detailRows]);

  const totalBonus = sellerRows.reduce((sum, row) => sum + row.bonus, 0);
  const totalPaid = sellerRows.reduce((sum, row) => sum + row.paid, 0);
  const detailBonus = detailRows.reduce((sum, row) => sum + Number(row.bonusAmount || 0), 0);

  if (seller) {
    return (
      <div className="stack">
        <section className="metric-grid four">
          <MetricCard label="Satıcı" value={seller} trend={monthLabel(month)} icon={Users} tone="primary" />
          <MetricCard label="Bonus (dövr üzrə)" value={money(detailBonus)} trend={`${detailRows.length} bonus sətri`} icon={Award} tone="success" />
          <MetricCard label="Bonus bazası" value={money(detailRows.reduce((s, r) => s + Number(r.paid || 0), 0))} trend="Ödənilmiş məbləğ" icon={Wallet} tone="warning" />
          <MetricCard label="Müştəri sayı" value={detailByCustomer.length} trend="Bonus gətirən müştərilər" icon={Percent} tone="info" />
        </section>

        <Panel>
          <PanelHeader
            title={`${seller} — müştərilər üzrə bonus`}
            subtitle="Bonusun kimdən nə qədər gəldiyi"
            icon={Users}
          />
          <div className="kpi-bonus-toolbar">
            <button className="secondary-btn compact" onClick={() => setSeller(null)}>
              <ArrowLeft size={15} /> Satıcılara qayıt
            </button>
            <div className="kpi-bonus-total"><span>Cəmi bonus</span><strong>{money(detailBonus)}</strong></div>
          </div>
          {detailByCustomer.length ? (
            <DataTable
              columns={["Müştəri", "Sifariş sayı", "Ödəniş bazası", "Bonus"]}
              rows={detailByCustomer.map((row) => [
                <strong>{row.customer}</strong>,
                row.orders,
                money(row.paid),
                <strong>{money(row.bonus)}</strong>,
              ])}
            />
          ) : (
            <EmptyState title="Bu dövr üzrə bonus yoxdur" />
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Sifariş detalları" subtitle="Hər sifariş üzrə bonus hesablanması" icon={Award} />
          {detailRows.length ? (
            <DataTable
              columns={["Sifariş", "Tarix", "Müştəri", "Məhsul", "Ödəniş", "% bonus", "Bonus", "Status"]}
              rows={detailRows.map((row) => [
                <strong>{row.orderId}</strong>,
                row.date || "—",
                <TwoLine title={row.customer || "—"} subtitle={row.paymentMethod || ""} />,
                row.product || "—",
                money(row.paid),
                percent(row.rate),
                <strong>{money(row.bonusAmount)}</strong>,
                <StatusBadge status={row.status} />,
              ])}
            />
          ) : (
            <EmptyState title="Sifariş tapılmadı" />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Dövr" value={month === "all" ? "Bütün dövrlər" : monthLabel(month)} trend={`${periodRows.length} bonus sətri`} icon={Percent} tone="primary" />
        <MetricCard label="Ümumi bonus" value={money(totalBonus)} trend={`${sellerRows.length} satıcı`} icon={Award} tone="success" />
        <MetricCard label="Bonus bazası" value={money(totalPaid)} trend="Ödənilmiş məbləğ" icon={Wallet} tone="warning" />
        <MetricCard label="Orta bonus" value={money(sellerRows.length ? totalBonus / sellerRows.length : 0)} trend="Satıcı başına" icon={Users} tone="info" />
      </section>

      <Panel>
        <PanelHeader title="Satıcılar üzrə bonus" subtitle="Satıcının adına klik edərək detalları açın" icon={Award} />
        <div className="kpi-bonus-toolbar">
          <label>
            <span>Dövr</span>{" "}
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((key) => (
                <option key={key} value={key}>{monthLabel(key)}</option>
              ))}
              <option value="all">Bütün dövrlər</option>
            </select>
          </label>
          <div className="kpi-bonus-total"><span>Cəmi bonus</span><strong>{money(totalBonus)}</strong></div>
        </div>
        {sellerRows.length ? (
          <DataTable
            columns={["Satıcı", "Sifariş", "Müştəri", "Ödəniş bazası", "Orta %", "Bonus", ""]}
            rows={sellerRows.map((row) => [
              <strong>{row.seller}</strong>,
              row.orders,
              row.customers,
              money(row.paid),
              percent(row.avgRate),
              <strong>{money(row.bonus)}</strong>,
              <button className="secondary-btn compact" onClick={() => setSeller(row.seller)}>Detallar</button>,
            ])}
          />
        ) : (
          <EmptyState title="Seçilmiş dövrdə bonus hesablanmayıb" />
        )}
      </Panel>
    </div>
  );
}
