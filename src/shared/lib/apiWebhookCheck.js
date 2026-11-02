// The API page's webhook rules live in browser state and have no sender behind them, so the page
// can only check whether a rule is ready to send. Real signed HTTP delivery is the server's
// webhook-dispatch function (Integration ledger). Nothing here may report a response code,
// latency or retry outcome, since no request is made.
export function checkWebhookConfiguration(webhook, secrets = []) {
  const endpointActive = webhook?.status === "Aktiv";
  const secret = secrets.find((item) => item.key === webhook?.secretKey);
  const secretReady = webhook?.authType === "None" || secret?.status === "Aktiv";
  const hasTarget = /^https:\/\//i.test(String(webhook?.target || ""));
  const problems = [
    !endpointActive && "Endpoint aktiv deyil",
    !secretReady && "Secret/token aktiv deyil və ya tapılmadı",
    !hasTarget && "Hədəf ünvanı https:// ilə başlamır",
  ].filter(Boolean);
  return {
    ready: problems.length === 0,
    result: problems.length === 0 ? "Göndərişə hazırdır" : "Konfiqurasiya natamamdır",
    error: problems.join("; "),
  };
}
