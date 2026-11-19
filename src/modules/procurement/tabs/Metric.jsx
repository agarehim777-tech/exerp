
export function Metric({ icon: Icon, label, value, hint, tone }) {
  return (
    <article className="procurement-page-styles-metric-card">
      <div className={`procurement-page-styles-metric-icon procurement-page-styles-metric-${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <span className="procurement-page-styles-metric-label">{label}</span>
        <strong className="procurement-page-styles-metric-value">{value}</strong>
        <small className="procurement-page-styles-metric-hint">{hint}</small>
      </div>
    </article>
  );
}
