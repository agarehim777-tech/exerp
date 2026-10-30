import { useMemo } from "react";
import { buildGoLiveReadiness, buildHelpArticles, buildHelpModuleGuides, buildModuleReadiness, buildOnboardingRows, buildProductionHardeningReport, buildStateIntegrityReport } from "../lib/appHelpers.jsx";

// Integrity, go-live, hardening and module-readiness reports, plus onboarding and help content built on them.
export function useSystemReports({ state, creditRecords, apiWebhookRows, apiSecretRows, notificationProviderRows }) {
  const onboardingRows = useMemo(() => buildOnboardingRows(state.onboarding, state), [state.onboarding, state]);
  const integrityReport = useMemo(
    () => buildStateIntegrityReport(state, creditRecords),
    [state, creditRecords],
  );
  const goLiveReport = useMemo(
    () => buildGoLiveReadiness(state, integrityReport),
    [state, integrityReport],
  );
  const productionHardeningReport = useMemo(
    () =>
      buildProductionHardeningReport(state, {
        goLiveReport,
        apiWebhookRows,
        apiSecretRows,
        notificationProviderRows,
      }),
    [state, goLiveReport, apiWebhookRows, apiSecretRows, notificationProviderRows],
  );
  const moduleReadiness = useMemo(
    () => buildModuleReadiness(state, integrityReport),
    [state, integrityReport],
  );
  const helpModuleGuides = useMemo(
    () => buildHelpModuleGuides({ moduleReadiness, onboardingRows }),
    [moduleReadiness, onboardingRows],
  );
  const helpArticles = useMemo(
    () => buildHelpArticles(state.knowledgeBase || [], helpModuleGuides, onboardingRows),
    [state.knowledgeBase, helpModuleGuides, onboardingRows],
  );
  return { onboardingRows, integrityReport, goLiveReport, productionHardeningReport, moduleReadiness, helpModuleGuides, helpArticles };
}
