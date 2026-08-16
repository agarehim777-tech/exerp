import {
  Award,
  CircleAlert,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { MetricCard, Panel, PanelHeader } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useCashbook } from "../shared/hooks/useCashbook.js";
import { getOrderSellerBonuses, normalizeOrderProductLines } from "../shared/lib/appDomain.jsx";

export default function DashboardPage({
  stats,
  orders,
  onOpenPendingExpenses,
}) {
  const { activeMembership } = useAuth();
  const cashbook = useCashbook(activeMembership?.tenant_id);
  const chart = [
    { month: "Yan", value: 145 },
    { month: "Fev", value: 168 },
    { month: "Mar", value: 192 },
    { month: "Apr", value: 178 },
    { month: "May", value: 249 },
  ];
  const pending = cashbook.expenses.filter((expense) => ["pending", "draft"].includes(expense.status));
  const sellerPerformance = [...orders.reduce((map, order) => {
    const sellers = getOrderSellerBonuses(order).filter((row) => row.seller);
    const primarySeller = sellers[0];
    if (!primarySeller) return map;
    const current = map.get(primarySeller.seller) || {
      name: primarySeller.seller,
      orders: new Set(),
      sales: 0,
    };
    current.orders.add(order.id || `${primarySeller.seller}-primary`);
    current.sales += Math.max(0, Number(order.amount || 0));
    map.set(primarySeller.seller, current);
    return map;
  }, new Map()).values()]
    .map((row) => ({ ...row, orderCount: row.orders.size }))
    .sort((a, b) => b.sales - a.sales);
  const maxSellerSales = Math.max(1, ...sellerPerformance.map((row) => row.sales));
  const productPerformance = [...orders.reduce((map, order) => {
    const lines = normalizeOrderProductLines(order.productLines || []);
    lines.forEach((line) => {
      const current = map.get(line.product) || { name: line.product, quantity: 0, sales: 0, orders: new Set() };
      current.quantity += Number(line.qty || 0);
      current.sales += Number(line.qty || 0) * Number(line.price || 0);
      current.orders.add(order.id);
      map.set(line.product, current);
    });
    return map;
  }, new Map()).values()]
    .map((row) => ({ ...row, orderCount: row.orders.size }))
    .sort((a, b) => b.quantity - a.quantity || b.sales - a.sales);
  const maxProductQuantity = Math.max(1, ...productPerformance.map((row) => row.quantity));

  return (
    <div className="stack">
      <section className="metric-grid">
        <MetricCard
          label="Aylıq gəlir"
          value={money(stats.revenue)}
          trend="+18.4% keçən aya"
          icon={Wallet}
          tone="success"
        />
        <MetricCard
          label="Aktiv müştəri"
          value={stats.activeCustomers}
          trend="+62 bu ay"
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Açıq sifariş"
          value={stats.openOrders}
          trend="+12 bu həftə"
          icon={ShoppingCart}
          tone="info"
        />
        <MetricCard
          label="Təsdiq gözləyir"
          value={pending.length}
          trend={`${pending.length} maliyyə əməliyyatı`}
          icon={CircleAlert}
          tone="warning"
          onClick={onOpenPendingExpenses}
          title="Təsdiq gözləyən xərclərə keç"
        />
      </section>

      <section className="dashboard-grid">
        <Panel style={{ gridColumn: "1 / -1" }}>
          <PanelHeader
            title="Aylıq Satış Dinamikası"
            subtitle="Son 5 ay üzrə dövriyyə (min ₼)"
            icon={TrendingUp}
          />
          <div className="bar-chart" aria-label="Aylıq satış qrafiki">
            {chart.map((item) => {
              const height = Math.max(9, (item.value / 249) * 100);
              return (
                <div className="bar-item" key={item.month}>
                  <span>{item.value}k</span>
                  <svg className="bar-visual" viewBox="0 0 58 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="0" y={100 - height} width="58" height={height} rx="6" />
                  </svg>
                  <small>{item.month}</small>
                </div>
              );
            })}
          </div>
        </Panel>

      </section>

      <section className="dashboard-grid">
        <div className="dashboard-sales-performance" style={{ gridColumn: "1 / -1" }}>
          <Panel className="performance-card">
            <PanelHeader title="Əsas satıcılar üzrə satış performansı" subtitle="Sifarişdə birinci seçilən satıcıya aid tam satış məbləği" icon={Users} />
            {sellerPerformance.length ? <div className="performance-list">{sellerPerformance.slice(0, 8).map((seller, index) => (
              <div className="performance-row" key={seller.name}>
                <span className="seller-performance-rank">{index + 1}</span>
                <div className="performance-name"><strong>{seller.name}</strong><small>{seller.orderCount} sifariş</small><i><b style={{ width: `${(seller.sales / maxSellerSales) * 100}%` }} /></i></div>
                <strong>{money(seller.sales)}</strong>
              </div>
            ))}</div> : <div className="seller-performance-empty"><Users size={22} /><strong>Satıcı satış məlumatı yoxdur</strong><span>Sifarişə satıcı təyin edildikdə burada görünəcək.</span></div>}
          </Panel>

          <Panel className="performance-card">
            <PanelHeader title="Məhsullar üzrə satışlar" subtitle="Satılan miqdara görə ən çox satılan məhsullar" icon={Award} />
            {productPerformance.length ? <div className="performance-list">{productPerformance.slice(0, 8).map((product, index) => (
              <div className="performance-row" key={product.name}>
                <span className="seller-performance-rank product-rank">{index + 1}</span>
                <div className="performance-name"><strong>{product.name}</strong><small>{product.orderCount} sifariş · {product.quantity} ədəd</small><i><b style={{ width: `${(product.quantity / maxProductQuantity) * 100}%` }} /></i></div>
                <strong>{money(product.sales)}</strong>
              </div>
            ))}</div> : <div className="seller-performance-empty"><ShoppingCart size={22} /><strong>Məhsul satış məlumatı yoxdur</strong><span>Satış sifarişi yaradıldıqda məhsullar burada sıralanacaq.</span></div>}
          </Panel>
        </div>
      </section>
    </div>
  );
}
