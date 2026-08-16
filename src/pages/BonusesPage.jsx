import { useMemo, useState } from "react";
import { ArrowLeft, Award, CalendarIcon, Percent, Users, Wallet } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, percent } from "../services/format.js";
import BonusAssignmentsPanel from "./BonusAssignmentsPanel.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useSalesBonusLedger } from "../shared/hooks/useSalesBonusLedger.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function startOfYearIso(date = new Date()) {
  return `${date.getFullYear()}-01-01`;
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDateRange(start, end) {
  if (!start || !end) return "—";
  const fmt = new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt.format(new Date(`${start}T00:00:00`))} – ${fmt.format(new Date(`${end}T00:00:00`))}`;
}

function inRange(date, start, end) {
  const d = String(date || "").slice(0, 10);
  if (!d) return false;
  return (!start || d >= start) && (!end || d <= end);
}

export default function BonusesPage({ salesBonuses = [] }) {
  const { activeMembership } = useAuth();
  const bonusLedger = useSalesBonusLedger(activeMembership?.tenant_id);
  const effectiveBonusRows = bonusLedger.rows.length ? bonusLedger.rows : salesBonuses;
  const [startDate, setStartDate] = useState(() => startOfMonthIso());
  const [endDate, setEndDate] = useState(() => todayIso());
  const [seller, setSeller] = useState(null);

  function setRange(start, end) {
    setStartDate(start);
    setEndDate(end);
  }

  function resetToCurrentMonth() {
    setRange(startOfMonthIso(), todayIso());
  }

  function resetToLast7Days() {
    setRange(daysAgoIso(6), todayIso());
  }

  function resetToLast30Days() {
    setRange(daysAgoIso(29), todayIso());
  }

  function resetToCurrentYear() {
    setRange(startOfYearIso(), todayIso());
  }

  function resetToAll() {
    setRange("", "");
  }

  const periodRows = useMemo(
    () => effectiveBonusRows.filter((row) => inRange(row.date, startDate, endDate)),
    [effectiveBonusRows, startDate, endDate],
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
  const totalPaid = useMemo(() => {
    const seenPayments = new Set();
    return periodRows.reduce((sum, row, index) => {
      // One cash receipt creates one bonus row per assigned seller. The
      // company bonus base must count that receipt once, not once per seller.
      const paymentKey = row.paymentId
        || `${row.orderId || "order"}:${row.date || "date"}:${Number(row.paid || 0)}:${row.sourceId || index}`;
      if (seenPayments.has(paymentKey)) return sum;
      seenPayments.add(paymentKey);
      return sum + Number(row.paid || 0);
    }, 0);
  }, [periodRows]);
  const detailBonus = detailRows.reduce((sum, row) => sum + Number(row.bonusAmount || 0), 0);

  const dateRangeLabel = formatDateRange(startDate, endDate);

  if (seller) {
    return (
      <div className="stack">
        <section className="metric-grid four">
          <MetricCard label="Satıcı" value={seller} trend={dateRangeLabel} icon={Users} tone="primary" />
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

        <Panel>
          <PanelHeader title="Sifariş sıraları" subtitle="Hər sıra üzrə məbləğ və satıcı payı" icon={Award} />
          {detailLineItems.length ? (
            <DataTable
              columns={["Sifariş", "Müştəri", "Satıcı", "Məhsul", "Miqdar", "Qiymət", "Məbləğ"]}
              rows={detailLineItems.map((row) => [
                <strong>{row.orderId}</strong>,
                row.customer || "—",
                row.seller || "—",
                row.product,
                row.qty,
                money(row.price),
                <strong>{money(row.amount)}</strong>,
              ])}
            />
          ) : (
            <EmptyState title="Sifariş sırası tapılmadı" />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack">
      <BonusAssignmentsPanel />
      <section className="metric-grid four">
        <MetricCard label="Dövr" value={startDate || endDate ? dateRangeLabel : "Bütün dövrlər"} trend={`${periodRows.length} bonus sətri`} icon={Percent} tone="primary" />
        <MetricCard label="Ümumi bonus" value={money(totalBonus)} trend={`${sellerRows.length} satıcı`} icon={Award} tone="success" />
        <MetricCard label="Bonus bazası" value={money(totalPaid)} trend="Ödənilmiş məbləğ" icon={Wallet} tone="warning" />
        <MetricCard label="Orta bonus" value={money(sellerRows.length ? totalBonus / sellerRows.length : 0)} trend="Satıcı başına" icon={Users} tone="info" />
      </section>

      <Panel>
        <PanelHeader title="Satıcılar üzrə bonus" subtitle="Satıcının adına klik edərək detalları açın" icon={Award} />
        <div className="kpi-bonus-toolbar">
          <div className="bonus-period-picker">
            <CalendarIcon size={16} />
            <span>Başlanğıc</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="bonus-period-date-input"
            />
            <span>Bitmə</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="bonus-period-date-input"
            />
            <div className="bonus-period-quick-actions">
              <button className="secondary-btn compact" onClick={resetToCurrentMonth} type="button">Bu ay</button>
              <button className="secondary-btn compact" onClick={resetToLast7Days} type="button">Son 7 gün</button>
              <button className="secondary-btn compact" onClick={resetToLast30Days} type="button">Son 30 gün</button>
              <button className="secondary-btn compact" onClick={resetToCurrentYear} type="button">Bu il</button>
              <button className="secondary-btn compact" onClick={resetToAll} type="button">Hamısı</button>
            </div>
          </div>
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
          <EmptyState title="Seçilmiş tarix aralığında bonus hesablanmayıb" />
        )}
      </Panel>
    </div>
  );
}
