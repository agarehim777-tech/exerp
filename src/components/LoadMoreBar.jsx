/**
 * Səhifələnmiş siyahılar üçün "Daha çox yüklə" zolağı.
 * Server-side limit ilə işləyən hook-larda (useOrders, useProducts, useCustomers,
 * useSalesInvoices) qalan sətirləri istək üzrə gətirmək üçün istifadə olunur.
 */
export default function LoadMoreBar({ hasMore, onLoadMore, loading, label = "Daha çox yüklə" }) {
  if (!hasMore) return null;
  return (
    <div className="u-display-flex u-justify-content-center u-padding-12px_0">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className={`sx-1eb2246 sx-63585d6 sx-3153e0f sx-df3930f sx-1eb7905 ${loading ? "sx-50b0de5" : "sx-b202c6d"} sx-83e4487 sx-3044b60`}
 >
        {loading ? "Yüklənir…" : label}
      </button>
    </div>
  );
}
