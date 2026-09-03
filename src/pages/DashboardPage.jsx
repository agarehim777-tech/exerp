import {
  Award,
  BadgeDollarSign,
  CircleAlert,
  PackageSearch,
  Plus,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MetricCard, Panel, PanelHeader } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useCashbook } from "../shared/hooks/useCashbook.js";
import { getOrderSellerBonuses, normalizeOrderProductLines } from "../shared/lib/appDomain.jsx";

const monthLabels = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];
const closedOrderStatuses = new Set(["delivered", "cancelled", "təhvil verilib", "ləğv edilib"]);

function orderDate(order) {
  const value = order.order_date || order.date || order.created_at;
  const date = value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function orderAmount(order) {
  return Math.max(0, Number(order.total ?? order.amount ?? 0));
}

function isCancelled(order) {
  return String(order.status || "").toLocaleLowerCase("az-AZ").includes("ləğv") || String(order.status || "").toLowerCase() === "cancelled";
}

function monthStart(date, offset = 0) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function buildRealtimeDashboard(orders = [], customers = [], now = new Date()) {
  const currentStart = monthStart(now);
  const nextStart = monthStart(now, 1);
  const previousStart = monthStart(now, -1);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const validOrders = orders.filter((order) => !isCancelled(order));
  const revenueFor = (from, to) => validOrders.reduce((sum, order) => {
    const date = orderDate(order);
    return date && date >= from && date < to ? sum + orderAmount(order) : sum;
  }, 0);
  const revenue = revenueFor(currentStart, nextStart);
  const previousRevenue = revenueFor(previousStart, currentStart);
  const revenueChange = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : revenue > 0 ? 100 : 0;
  const newCustomers = customers.filter((customer) => {
    const value = customer.created_at || customer.createdAt;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) && date >= currentStart && date < nextStart;
  }).length;
  const openOrders = orders.filter((order) => !closedOrderStatuses.has(String(order.status || "").toLocaleLowerCase("az-AZ"))).length;
  const weeklyOrders = validOrders.filter((order) => {
    const date = orderDate(order);
    return date && date >= weekStart && date <= now;
  }).length;
  const chart = Array.from({ length: 5 }, (_, index) => {
    const start = monthStart(now, index - 4);
    const end = monthStart(now, index - 3);
    const amount = revenueFor(start, end);
    return { month: monthLabels[start.getMonth()], amount, value: amount / 1000 };
  });

  return { revenue, revenueChange, activeCustomers: customers.length, newCustomers, openOrders, weeklyOrders, chart };
}

export default function DashboardPage({
  orders,
  customers,
  onOpenPendingExpenses,
}) {
  const navigate = useNavigate();
  const { activeMembership } = useAuth();
  const cashbook = useCashbook(activeMembership?.tenant_id);
  const dashboard = buildRealtimeDashboard(orders, customers);
  const chart = dashboard.chart;
  const chartMax = Math.max(1, ...chart.map((item) => item.value));
  const pending = cashbook.expenses.filter((expense) => ["pending", "draft"].includes(expense.status));
  const activeOrders = orders.filter((order) => !isCancelled(order));
  const sellerPerformance = [...activeOrders.reduce((map, order) => {
    const sellers = getOrderSellerBonuses(order).filter((row) => row.seller);
    const primarySeller = sellers[0];
    if (!primarySeller) return map;
    const current = map.get(primarySeller.seller) || {
      name: primarySeller.seller,
      orders: new Set(),
      sales: 0,
    };
    current.orders.add(order.id || `${primarySeller.seller}-primary`);
    current.sales += orderAmount(order);
    map.set(primarySeller.seller, current);
    return map;
  }, new Map()).values()]
    .map((row) => ({ ...row, orderCount: row.orders.size }))
    .sort((a, b) => b.sales - a.sales);
  const maxSellerSales = Math.max(1, ...sellerPerformance.map((row) => row.sales));
  const productPerformance = [...activeOrders.reduce((map, order) => {
    const lines = normalizeOrderProductLines(order.productLines || order.items || []);
    lines.forEach((line) => {
      const current = map.get(line.product) || { name: line.product, quantity: 0, sales: 0, orders: new Set() };
      current.quantity += Number(line.qty || 0);
      current.sales += Number(line.qty || 0) * Number(line.price ?? line.unit_price ?? 0);
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
      <section className="mobile-operations" aria-label="Sürətli əməliyyatlar">
        <button type="button" onClick={() => navigate('/satis/sifarisler')}><Plus size={18} /><span>Satış</span></button>
        <button type="button" onClick={() => navigate('/maliyye/kassa')}><BadgeDollarSign size={18} /><span>Ödəniş</span></button>
        <button type="button" onClick={() => navigate('/anbar/qaliqlar')}><PackageSearch size={18} /><span>Stok</span></button>
        <button type="button" onClick={() => navigate('/sistem/barisdirma')}><CircleAlert size={18} /><span>Nəzarət</span></button>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="Aylıq gəlir"
          value={money(dashboard.revenue)}
          trend={`${dashboard.revenueChange >= 0 ? "+" : ""}${dashboard.revenueChange.toFixed(1)}% keçən aya`}
          icon={Wallet}
          tone="success"
        />
        <MetricCard
          label="Aktiv müştəri"
          value={dashboard.activeCustomers}
          trend={`+${dashboard.newCustomers} bu ay`}
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Açıq sifariş"
          value={dashboard.openOrders}
          trend={`+${dashboard.weeklyOrders} bu həftə`}
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
            subtitle="Son 5 ay üzrə canlı dövriyyə (min ₼)"
            icon={TrendingUp}
          />
          <div className="bar-chart" aria-label="Aylıq satış qrafiki">
            {chart.map((item) => {
              const height = item.value > 0 ? Math.max(9, (item.value / chartMax) * 100) : 2;
              return (
                <div className="bar-item" key={item.month}>
                  <span>{item.value >= 1 ? `${item.value.toFixed(item.value >= 100 ? 0 : 1)}k` : money(item.amount)}</span>
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

