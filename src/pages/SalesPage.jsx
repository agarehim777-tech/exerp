import { AvatarLine, DataTable, EmptyState, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../components/ui.jsx";
import { Check, ChevronRight, CircleAlert, Download, Filter, Pencil, RefreshCw, Search, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { buildCreditPlan, getCreditInitials } from "../shared/lib/credit.js";
import { money } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useMemo, useState } from "react";
import { WorkflowSteps, buildSalesBonusRows, getOrderBalance, getOrderBonusAmount, getOrderBonusText, getOrderDeliveryStatus, getOrderPaymentMethod, getOrderSellerBonuses, getSalesCashImpact, getSalesOrderRiskStatus, getShortSellerName, matchesSalesDateRange, matchesSalesOrderFilter, matchesSalesOrderSearch, summarizeOrderProducts } from "../shared/lib/appDomain.jsx";
export default function SalesPage({
  orders,
  stock,
  employees,
  selectedOrder,
  setSelectedOrder,
  advanceOrder,
  onEditOrder,
  onDeleteOrder,
}) {
  const [salesFilter, setSalesFilter] = useState("Hamısı");
  const [sellerFilter, setSellerFilter] = useState("Bütün satıcılar");
  const [warehouseFilter, setWarehouseFilter] = useState("Bütün anbarlar");
  const [salesSearch, setSalesSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const sellers = employees.filter((employee) => employee.department === "Satış");
  const salesBonusRows = useMemo(() => buildSalesBonusRows(orders), [orders]);
  const sellerOptions = [
    ...new Set([...sellers.map((seller) => seller.name), ...salesBonusRows.map((row) => row.seller)].filter(Boolean)),
  ];
  const warehouseOptions = [
    ...new Set(orders.map((order) => order.warehouseName || "Anbar seçilməyib").filter(Boolean)),
  ];
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const sellerNames = getOrderSellerBonuses(order).map((item) => item.seller);
        const matchesSeller = sellerFilter === "Bütün satıcılar" || sellerNames.includes(sellerFilter);
        const matchesWarehouse = warehouseFilter === "Bütün anbarlar" || (order.warehouseName || "Anbar seçilməyib") === warehouseFilter;
        return (
          matchesSalesOrderFilter(order, salesFilter) &&
          matchesSeller &&
          matchesWarehouse &&
          matchesSalesOrderSearch(order, salesSearch) &&
          matchesSalesDateRange(order, dateFrom, dateTo)
        );
      }),
    [orders, salesFilter, sellerFilter, warehouseFilter, salesSearch, dateFrom, dateTo],
  );
  const selected = orders.find((order) => order.id === selectedOrder) || filteredOrders[0] || orders[0];
  const selectedBonusRows = selected ? buildSalesBonusRows([selected]) : [];
  const selectedCreditPlan =
    selected?.paymentMethod === "Kredit"
      ? buildCreditPlan({
          total: selected.amount,
          initialPayment: selected.initialPayment ?? selected.paid ?? 0,
          months: selected.creditMonths || 12,
        })
      : null;
  const activeOrders = orders.filter((order) => order.status !== "Təhvil verilib");
  const creditOrders = orders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const balanceTotal = orders.reduce((sum, order) => sum + getOrderBalance(order), 0);
  const visibleSalesTotal = total(filteredOrders, "amount");
  const visibleCashIn = filteredOrders.reduce((sum, order) => sum + getSalesCashImpact(order), 0);
  const visibleBalance = filteredOrders.reduce((sum, order) => sum + getOrderBalance(order), 0);
  const visibleBonusTotal = filteredOrders.reduce((sum, order) => sum + getOrderBonusAmount(order), 0);
  const visibleDeliveryWaiting = filteredOrders.filter((order) => order.status !== "Təhvil verilib").length;
  const riskOrders = filteredOrders.filter((order) => getSalesOrderRiskStatus(order) !== "Sağlam" && getSalesOrderRiskStatus(order) !== "Tamamlanıb");
  const bonusTotal = total(salesBonusRows, "bonusAmount");
  const averageCheck = orders.length > 0 ? Math.round(total(orders, "amount") / orders.length) : 0;
  const deliveryWaiting = orders.filter((order) => order.status !== "Təhvil verilib").length;
  const salesFilterOptions = ["Hamısı", "Kredit", "Nağd", "Qalıqlı", "Təhvil gözləyən", "Tamamlanan", "Riskli"];
  const maxSellerBonus = Math.max(
    1,
    ...sellerOptions.map((seller) => total(salesBonusRows.filter((row) => row.seller === seller), "bonusAmount")),
  );
  const sellerBonusStats = sellerOptions.map((sellerName) => {
    const sellerProfile = sellers.find((seller) => seller.name === sellerName);
    const rows = salesBonusRows.filter((row) => row.seller === sellerName);
    return {
      name: sellerName,
      initials: sellerProfile?.initials || getCreditInitials(sellerName),
      bonusAmount: total(rows, "bonusAmount"),
      orderCount: new Set(rows.map((row) => row.orderId)).size,
      progress: (total(rows, "bonusAmount") / maxSellerBonus) * 100,
    };
  });
  const actionOrders = (riskOrders.length > 0 ? riskOrders : orders)
    .filter((order) => getOrderBalance(order) > 0 || order.status !== "Təhvil verilib")
    .slice(0, 4);
  const criticalStock = [...stock]
    .sort((a, b) => a.total - a.reserved - (b.total - b.reserved))
    .slice(0, 5);
  const resetSalesFilters = () => {
    setSalesFilter("Hamısı");
    setSellerFilter("Bütün satıcılar");
    setWarehouseFilter("Bütün anbarlar");
    setSalesSearch("");
    setDateFrom("");
    setDateTo("");
  };
  const exportVisibleSales = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Sifariş", "Tarix", "Müştəri", "FIN", "Məhsul", "Ödəniş tipi", "Anbar", "Müqavilə", "Kredit", "Məbləğ", "Daxil olub", "Qalıq", "Bonus", "Status"],
      ...filteredOrders.map((order) => [
        order.id,
        order.date,
        order.customer,
        order.fin,
        summarizeOrderProducts(order),
        getOrderPaymentMethod(order),
        order.warehouseName || "",
        order.contractId || "",
        order.creditId || "",
        order.amount,
        order.paid,
        getOrderBalance(order),
        getOrderBonusAmount(order),
        order.status,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `satis-reyestri-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktiv sifarişlər" value={activeOrders.length} icon={ShoppingCart} tone="primary" />
        <MetricCard label="Ümumi dövriyyə" value={money(total(orders, "amount"))} icon={Wallet} tone="success" />
        <MetricCard label="Daxil olan" value={money(total(orders, "paid"))} icon={Check} tone="info" />
        <MetricCard
          label="Qalıq"
          value={money(balanceTotal)}
          icon={CircleAlert}
          tone="warning"
        />
      </section>

      <Panel className="sales-control-panel">
        <PanelHeader
          title="Satış nəzarəti"
          subtitle="Ödəniş, təhvil və bonus üzrə operativ göstəricilər"
          icon={Filter}
        />
        <div className="sales-control-grid">
          <div className="sales-control-tile">
            <span>Kredit satışları</span>
            <strong>{creditOrders.length}</strong>
            <small>{money(total(creditOrders, "amount"))} portfel</small>
          </div>
          <div className="sales-control-tile">
            <span>Təhvil gözləyən</span>
            <strong>{deliveryWaiting}</strong>
            <small>Anbar çıxışı izlənir</small>
          </div>
          <div className="sales-control-tile">
            <span>Bonus fondu</span>
            <strong>{money(bonusTotal)}</strong>
            <small>{salesBonusRows.length} bonus sətri</small>
          </div>
          <div className="sales-control-tile">
            <span>Orta çek</span>
            <strong>{money(averageCheck)}</strong>
            <small>{orders.length} sifariş üzrə</small>
          </div>
        </div>
        <div className="sales-alert-list">
          {actionOrders.map((order) => (
            <button key={order.id} className="sales-alert-row" onClick={() => setSelectedOrder(order.id)}>
              <div>
                <strong>
                  {order.id} · {order.customer}
                </strong>
                <span>
                  {getOrderBalance(order) > 0
                    ? `${money(getOrderBalance(order))} qalıq`
                    : getOrderDeliveryStatus(order)}
                </span>
              </div>
              <StatusBadge status={order.status} />
            </button>
          ))}
        </div>
      </Panel>

      <section className="sales-registry-summary" aria-label="Satış filter nəticələri">
        <div>
          <span>Görünən satış</span>
          <strong>{money(visibleSalesTotal)}</strong>
          <small>{filteredOrders.length} sifariş</small>
        </div>
        <div>
          <span>Kassaya daxil olan</span>
          <strong>{money(visibleCashIn)}</strong>
          <small>Nağd/kart/ilkin ödəniş</small>
        </div>
        <div>
          <span>Qalıq borc</span>
          <strong>{money(visibleBalance)}</strong>
          <small>{riskOrders.length} risk siqnalı</small>
        </div>
        <div>
          <span>Bonus</span>
          <strong>{money(visibleBonusTotal)}</strong>
          <small>{salesBonusRows.length} bonus sətri</small>
        </div>
        <div>
          <span>Təhvil gözləyən</span>
          <strong>{visibleDeliveryWaiting}</strong>
          <small>Anbar rezervi izlənir</small>
        </div>
      </section>

      <section className="dashboard-grid">
        <Panel>
          <PanelHeader title="Satıcı bonus performansı" subtitle="Satış sifarişlərindən real bonus hesabı" />
          <div className="seller-bonus-list">
            {sellerBonusStats.length === 0 ? (
              <EmptyState title="Satıcı bonus datası yoxdur" />
            ) : (
              sellerBonusStats.map((seller) => (
                <div className="seller-bonus-row" key={seller.name}>
                  <div className="seller-bonus-main">
                    <AvatarLine initials={seller.initials} title={seller.name} subtitle={`${seller.orderCount} sifariş`} />
                    <strong>{money(seller.bonusAmount)}</strong>
                  </div>
                  <ProgressRow value={seller.progress} compact />
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Stok siqnalları" subtitle="Satış üçün ən həssas qalıqlar" />
          <div className="stock-stack">
            {criticalStock.map((item) => (
              <div className="stock-row stock-signal" key={item.product}>
                <span>{item.product}</span>
                <strong>{item.total - item.reserved}</strong>
                <small>{item.reserved} rezerv</small>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Sifariş Kartı" subtitle={selected?.id || "Sifariş seçilməyib"} />
          {selected ? (
            <div className="detail-card sales-order-card">
              <div className="sales-order-head">
                <div>
                  <span className="sales-order-id">{selected.id}</span>
                  <h3>{selected.customer}</h3>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <p>{selected.products}</p>
              <div className="order-detail-grid">
                <div>
                  <span>Ödəniş</span>
                  <strong>{getOrderPaymentMethod(selected)}</strong>
                  <small>{money(Number(selected.paid || 0))} daxil olub</small>
                </div>
                <div>
                  <span>Qalıq</span>
                  <strong>{money(getOrderBalance(selected))}</strong>
                  <small>{selected.paymentStatus || "Ödəniş izlənir"}</small>
                </div>
                <div>
                  <span>Anbar</span>
                  <strong>{selected.warehouseName || "Anbar qeyd edilməyib"}</strong>
                  <small>{getOrderDeliveryStatus(selected)}</small>
                </div>
                <div>
                  <span>Bonus</span>
                  <strong>{money(total(selectedBonusRows, "bonusAmount"))}</strong>
                  <small>{getOrderBonusText(selected)}</small>
                </div>
              </div>
              <div className="sales-context-grid">
                <div>
                  <span>Müqavilə</span>
                  <strong>{selected.contractId || "Yoxdur"}</strong>
                </div>
                <div>
                  <span>Kredit</span>
                  <strong>{selected.creditId || "Yoxdur"}</strong>
                </div>
                <div>
                  <span>Kassa təsiri</span>
                  <strong>{money(getSalesCashImpact(selected))}</strong>
                </div>
                <div>
                  <span>Risk</span>
                  <StatusBadge status={getSalesOrderRiskStatus(selected)} />
                </div>
              </div>
              {selectedCreditPlan && (
                <div className="selected-credit-summary">
                  <span>İlkin: {money(selectedCreditPlan.initialPayment)}</span>
                  <span>Qalıq: {money(selectedCreditPlan.balance)}</span>
                  <span>{selectedCreditPlan.months} ay · {money(selectedCreditPlan.monthly)}/ay</span>
                </div>
              )}
              {selectedBonusRows.length > 0 && (
                <div className="seller-bonus-chips">
                  {selectedBonusRows.map((row) => (
                    <span key={row.id}>
                      {getShortSellerName(row.seller)} <strong>{money(row.bonusAmount)}</strong>
                    </span>
                  ))}
                </div>
              )}
              <WorkflowSteps activeStage={selected.status} compact />
              <div className="operation-row-actions">
                <button className="secondary-btn" onClick={() => onEditOrder(selected.id)}>
                  <Pencil size={16} />
                  Redaktə
                </button>
                <button className="secondary-btn danger-outline" onClick={() => onDeleteOrder(selected.id)}>
                  <Trash2 size={16} />
                  Sil
                </button>
              </div>
              <button className="secondary-btn full" onClick={() => advanceOrder(selected.id)}>
                <ChevronRight size={16} />
                Növbəti mərhələ
              </button>
            </div>
          ) : (
            <EmptyState title="Sifariş seçilməyib" />
          )}
        </Panel>
      </section>

      <Panel className="sales-registry-panel">
        <PanelHeader title="Satış reyestri" subtitle="Filter edib sifariş, ödəniş, anbar və bonus vəziyyətini izləyin" />
        <div className="sales-filter-toolbar">
          <div className="tabs">
            {salesFilterOptions.map((item) => (
              <button key={item} className={salesFilter === item ? "active" : ""} onClick={() => setSalesFilter(item)}>
                <span>{item}</span>
                <strong>{orders.filter((order) => matchesSalesOrderFilter(order, item)).length}</strong>
              </button>
            ))}
          </div>
          <div className="sales-filter-controls">
            <label className="sales-search-field">
              <span>Axtarış</span>
              <div>
                <Search size={15} />
                <input
                  value={salesSearch}
                  onChange={(event) => setSalesSearch(event.target.value)}
                  placeholder="Sifariş, müştəri, FİN, cihaz..."
                />
              </div>
            </label>
            <label className="sales-seller-filter">
              <span>Satıcı</span>
              <select value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
                <option>Bütün satıcılar</option>
                {sellerOptions.map((seller) => (
                  <option key={seller}>{seller}</option>
                ))}
              </select>
            </label>
            <label className="sales-seller-filter">
              <span>Anbar</span>
              <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
                <option>Bütün anbarlar</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse}>{warehouse}</option>
                ))}
              </select>
            </label>
            <label className="sales-date-filter">
              <span>Başlanğıc</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="sales-date-filter">
              <span>Son</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button className="secondary-btn icon-only" type="button" title="Filterləri sıfırla" onClick={resetSalesFilters}>
              <RefreshCw size={16} />
            </button>
            <button className="secondary-btn sales-export-btn" type="button" onClick={exportVisibleSales}>
              <Download size={16} />
              Excel
            </button>
          </div>
        </div>
        <DataTable
          columns={["№", "Müştəri", "Məhsul", "Ödəniş", "Anbar", "Sənədlər", "Bonus", "Qalıq", "Status", "Əməliyyat"]}
          rows={filteredOrders.map((order) => [
            <button
              className={`row-link ${selected?.id === order.id ? "active" : ""}`}
              onClick={() => setSelectedOrder(order.id)}
            >
              {order.id}
            </button>,
            <TwoLine title={order.customer} subtitle={`FİN ${order.fin}`} />,
            <TwoLine title={summarizeOrderProducts(order)} subtitle={order.date} />,
            <TwoLine title={money(Number(order.paid || 0))} subtitle={order.paymentStatus || getOrderPaymentMethod(order)} />,
            <TwoLine title={order.warehouseName || "Anbar seçilməyib"} subtitle={getOrderDeliveryStatus(order)} />,
            <TwoLine title={order.contractId || "Müqavilə yoxdur"} subtitle={order.creditId || getSalesOrderRiskStatus(order)} />,
            <TwoLine title={money(getOrderBonusAmount(order))} subtitle={getOrderBonusText(order)} />,
            getOrderBalance(order) > 0 ? <strong>{money(getOrderBalance(order))}</strong> : <StatusBadge status="Ödənilib" />,
            <StatusBadge status={order.status} />,
            <div className="row-actions operation-table-actions">
              <button className="text-btn" onClick={() => onEditOrder(order.id)}>Redaktə</button>
              <button className="text-btn danger" onClick={() => onDeleteOrder(order.id)}>Sil</button>
            </div>,
          ])}
        />
      </Panel>
    </div>
  );
}