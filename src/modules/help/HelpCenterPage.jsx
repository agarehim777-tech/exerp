import { Check, FileText, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  DataTable,
  EmptyState,
  MetricCard,
  Panel,
  PanelHeader,
  StatusBadge,
  TwoLine,
} from "../../components/ui.jsx";

export function HelpCenterPage({ articles, guides = [], onboardingRows = { steps: [] }, snapshot = null, onOpenModule }) {
  const categories = [...new Set(articles.map((article) => article.category))];
  const readyGuides = guides.filter((guide) => guide.readiness === "Hazır").length;
  const activeOnboarding = onboardingRows.steps.filter((step) => step.status !== "Tamamlandı").length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Məqalə" value={articles.length} icon={FileText} tone="primary" />
        <MetricCard label="Modul təlimatı" value={guides.length} trend={`${readyGuides} hazır`} icon={SlidersHorizontal} tone="info" />
        <MetricCard label="Onboarding açıq" value={activeOnboarding} icon={ShieldCheck} tone={activeOnboarding ? "warning" : "success"} />
        <MetricCard label="Təlim snapshot" value={snapshot ? "Hazır" : "Gözləyir"} trend={snapshot?.generatedAt || "Yenilə"} icon={Check} tone={snapshot ? "success" : "warning"} />
      </section>
      <Panel className="help-module-guide-panel" data-testid="help-module-guide-panel">
        <PanelHeader title="Modul təlimatları" subtitle="Hər modulun məqsədi, əsas əməliyyatı, permission-u və növbəti addımı" icon={SlidersHorizontal} />
        <DataTable
          columns={["Modul", "Məqsəd", "Əsas əməliyyat", "Permission", "Hazırlıq", "Növbəti addım", "Aç"]}
          rows={guides.map((guide) => [
            <TwoLine title={guide.module} subtitle={guide.title} />,
            guide.purpose,
            guide.action,
            guide.permission,
            <StatusBadge status={guide.readiness} />,
            guide.next,
            <button className="text-btn" onClick={() => onOpenModule(guide.id)}>
              Aç
            </button>,
          ])}
        />
      </Panel>
      <Panel className="help-center-panel">
        <PanelHeader title="Kömək mərkəzi və FAQ" subtitle="Modul izahları, istifadə qaydaları və komandaya təlim materialları" icon={FileText} />
        <div className="help-category-strip">
          {categories.map((category) => (
            <StatusBadge key={category} status={category} />
          ))}
        </div>
        <div className="help-article-grid">
          {articles.map((article) => (
            <article className="help-article" key={article.id}>
              <div>
                <StatusBadge status={article.category} />
                <h3>{article.title}</h3>
                <p>{article.answer}</p>
              </div>
              <div className="help-tags">
                {article.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
          {articles.length === 0 && <EmptyState title="Axtarışa uyğun təlimat tapılmadı" />}
        </div>
      </Panel>
    </div>
  );
}
