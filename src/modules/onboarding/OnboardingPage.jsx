import { Building2, Check, ChevronRight, ShieldCheck, Users } from "lucide-react";
import {
  DataTable,
  MetricCard,
  Panel,
  PanelHeader,
  ProgressRow,
  StatusBadge,
  TwoLine,
} from "../../components/ui.jsx";
import { pageMeta } from "../../config/page-meta.js";
import { percent } from "../../services/format.js";

export function OnboardingPage({ onboarding = {}, rows, onOpenModule }) {
  const activeStep = rows.nextStep;
  const checklistGroups = [
    { title: "Əsas qurulum", steps: rows.steps.filter((step) => ["ONB-1", "ONB-2", "ONB-3", "ONB-4"].includes(step.id)) },
    { title: "Əməliyyat UAT", steps: rows.steps.filter((step) => ["ONB-5", "ONB-6", "ONB-7", "ONB-8"].includes(step.id)) },
    { title: "Go-live", steps: rows.steps.filter((step) => ["ONB-9", "ONB-10"].includes(step.id)) },
  ];

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Qurulum mərhələsi" value={onboarding.companyStage || "Go-live hazırlığı"} icon={ShieldCheck} tone="primary" />
        <MetricCard label="Biznes sahəsi" value={onboarding.businessArea || "Təyin edilməyib"} icon={Building2} tone="info" />
        <MetricCard label="Açıq addım" value={rows.steps.length - rows.completed} icon={Users} tone={rows.completed === rows.steps.length ? "success" : "warning"} />
        <MetricCard label="Tamamlanma" value={percent(rows.progress)} icon={Check} tone="success" />
      </section>
      <section className="onboarding-command-grid" data-testid="onboarding-command-panel">
        <div>
          <span>Növbəti addım</span>
          <strong>{activeStep?.title || "Hamısı tamamdır"}</strong>
          <small>{activeStep?.detail || "Sistem real istifadə üçün checklist-i bağlayıb"}</small>
        </div>
        <div>
          <span>Məsul</span>
          <strong>{activeStep?.owner || "Komanda"}</strong>
          <small>{activeStep?.module ? pageMeta[activeStep.module]?.title : "Go-live"}</small>
        </div>
        <button className="primary-btn" disabled={!activeStep?.module} onClick={() => activeStep?.module && onOpenModule(activeStep.module)}>
          <ChevronRight size={16} />
          Modula keç
        </button>
      </section>
      <Panel className="onboarding-panel">
        <PanelHeader title="Yeni şirkət onboarding wizard" subtitle="Şirkət, anbar, rol, maliyyə, bildiriş və təlim addımları" icon={ShieldCheck} />
        <div className="onboarding-progress">
          <ProgressRow value={rows.progress} caption={`${rows.completed}/${rows.steps.length} addım tamamlandı`} />
          {rows.nextStep && <TwoLine title="Növbəti addım" subtitle={`${rows.nextStep.title} · ${rows.nextStep.owner}`} />}
        </div>
        <DataTable
          columns={["Addım", "Məsul", "Modul", "Detal", "Status", "Aç"]}
          rows={rows.steps.map((step) => [
            <TwoLine title={step.title} subtitle={step.id} />,
            step.owner,
            pageMeta[step.module]?.title || step.module,
            step.detail,
            <StatusBadge status={step.status} />,
            <button className="text-btn" onClick={() => onOpenModule(step.module)}>
              Aç
            </button>,
          ])}
        />
      </Panel>
      <section className="onboarding-checklist-grid">
        {checklistGroups.map((group) => (
          <Panel key={group.title} className="onboarding-checklist-panel">
            <PanelHeader title={group.title} subtitle={`${group.steps.filter((step) => step.completed).length}/${group.steps.length} tamamlandı`} />
            <div className="onboarding-step-list">
              {group.steps.map((step) => (
                <button key={step.id} className={`onboarding-step-card ${step.completed ? "is-complete" : ""}`} onClick={() => onOpenModule(step.module)}>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <StatusBadge status={step.status} />
                </button>
              ))}
            </div>
          </Panel>
        ))}
      </section>
    </div>
  );
}
