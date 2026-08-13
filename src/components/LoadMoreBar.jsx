/**
 * Səhifələnmiş siyahılar üçün "Daha çox yüklə" zolağı.
 * Server-side limit ilə işləyən hook-larda (useOrders, useProducts, useCustomers,
 * useSalesInvoices) qalan sətirləri istək üzrə gətirmək üçün istifadə olunur.
 */
export default function LoadMoreBar({ hasMore, onLoadMore, loading, label = "Daha çox yüklə" }) {
  if (!hasMore) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        style={{
          background: "transparent",
          border: "1px solid #d7e0dc",
          color: "#0d7a5f",
          padding: "8px 18px",
          borderRadius: 999,
          cursor: loading ? "progress" : "pointer",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {loading ? "Yüklənir…" : label}
      </button>
    </div>
  );
}
