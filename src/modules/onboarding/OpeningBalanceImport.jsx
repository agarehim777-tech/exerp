import { useMemo, useRef, useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { Panel, PanelHeader, SimpleTable as DataTable } from "../../shared/ui/primitives.tsx";
import { importOpeningBalances } from "../../services/openingImport.js";
import { downloadOpeningImportTemplate, openingImportKinds, parseOpeningImportCsv } from "./openingImportCsv.ts";

// Opening balances for a company moving from another system: customers first, then vendors, cash/bank
// accounts and active credits (credits look customers up by FİN/VÖEN). Products and stock use the warehouse
// import. Each file goes to the server as one all-or-nothing import.
/** @typedef {import("./openingImportCsv.ts").OpeningImportKind} OpeningImportKind */
/** @type {OpeningImportKind[]} */
const ORDER = ["customers", "vendors", "cash_accounts", "credits"];
const PERMISSION = { customers: "crm.manage", vendors: "vendors.manage", cash_accounts: "finance.manage", credits: "credits.manage" };
const PREVIEW_ROWS = 8;

/**
 * @param {{ tenantId: string, can?: (permission: string) => boolean, notify?: (message: string) => void,
 *   onImported?: (kind: string) => void, onOpenModule?: (module: string) => void }} props
 */
export function OpeningBalanceImport({ tenantId, can = () => true, notify = () => {}, onImported = () => {}, onOpenModule = () => {} }) {
  const [kind, setKind] = useState(/** @type {OpeningImportKind} */ ("customers"));
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const requestKey = useRef(crypto.randomUUID());
  const fileInputRef = useRef(null);
  const config = openingImportKinds[kind];
  const allowed = can(PERMISSION[kind]);
  const analysis = useMemo(() => (csvText === null ? { rows: [], errors: [] } : parseOpeningImportCsv(kind, csvText)), [kind, csvText]);

  /** @param {OpeningImportKind} next */
  function selectKind(next) {
    if (saving) return;
    setKind(next);
    setCsvText(null);
    setFileName("");
    setMessage(null);
    requestKey.current = crypto.randomUUID();
  }

  async function readFile(file) {
    if (!file || saving) return;
    setMessage(null);
    requestKey.current = crypto.randomUUID();
    setFileName(file.name);
    try { setCsvText(await file.text()); }
    catch { setCsvText(null); setMessage({ tone: "error", text: "CSV faylı oxunmadı." }); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (saving || !allowed || analysis.errors.length || !analysis.rows.length) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await importOpeningBalances(tenantId, kind, analysis.rows, requestKey.current);
      const text = `${config.label}: ${result.created} yeni qeyd yaradıldı${result.skipped ? `, ${result.skipped} artıq sistemdə olduğu üçün keçildi` : ""}.`;
      setMessage({ tone: "success", text });
      notify(text);
      setCsvText(null);
      setFileName("");
      requestKey.current = crypto.randomUUID();
      onImported(kind);
    } catch (error) {
      setMessage({ tone: "error", text: error.message || "İdxal alınmadı." });
    } finally {
      setSaving(false);
    }
  }

  const previewColumns = config.columns.map((column) => column.header);
  const previewRows = analysis.rows.slice(0, PREVIEW_ROWS).map((row) => config.columns.map((column) => String(row[column.key] ?? "")));

  return (
    <Panel className="opening-import-panel" data-testid="opening-balance-import">
      <PanelHeader
        title="Başlanğıc qalıqların idxalı"
        subtitle="Köhnə sistemdən məlumatı CSV ilə köçürün: əvvəlcə müştərilər, sonra təchizatçılar, kassa/bank və aktiv kreditlər"
        icon={FileUp}
      />
      <div className="opening-import-steps" role="tablist" aria-label="İdxal növü">
        {ORDER.map((item, index) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={kind === item}
            className={`opening-import-step${kind === item ? " is-active" : ""}`}
            disabled={saving}
            onClick={() => selectKind(item)}
          >
            <span>{index + 1}</span>
            {openingImportKinds[item].label}
          </button>
        ))}
        <button type="button" className="opening-import-step" onClick={() => onOpenModule("stock")}>
          <span>5</span>
          Məhsul və anbar qalıqları
        </button>
      </div>
      <p className="opening-import-hint">{config.hint}</p>
      <div className="opening-import-actions">
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          aria-label={`${config.label} CSV faylı`}
          disabled={saving || !allowed}
          onChange={(event) => readFile(event.target.files?.[0])}
        />
        <button type="button" className="secondary-btn" onClick={() => downloadOpeningImportTemplate(kind)}>
          <Download size={16} /> Şablon CSV
        </button>
        <button type="button" className="secondary-btn" disabled={saving || !allowed} onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} /> {fileName || "CSV seçin"}
        </button>
        <button
          type="button"
          className="primary-btn"
          disabled={saving || !allowed || !analysis.rows.length || analysis.errors.length > 0}
          onClick={submit}
        >
          {saving ? "İdxal edilir..." : `İdxal et${analysis.rows.length ? ` (${analysis.rows.length} sətir)` : ""}`}
        </button>
      </div>
      {!allowed && <p className="opening-import-message is-error">Bu siyahını idxal etmək üçün icazəniz yoxdur.</p>}
      {message && <p className={`opening-import-message is-${message.tone}`} role="status">{message.text}</p>}
      {analysis.errors.length > 0 && (
        <ul className="opening-import-errors" aria-label="Fayldakı xətalar">
          {analysis.errors.slice(0, 20).map((error) => <li key={error}>{error}</li>)}
          {analysis.errors.length > 20 && <li>və daha {analysis.errors.length - 20} xəta</li>}
        </ul>
      )}
      {previewRows.length > 0 && (
        <>
          <DataTable columns={previewColumns} rows={previewRows} />
          {analysis.rows.length > PREVIEW_ROWS && <p className="opening-import-hint">İlk {PREVIEW_ROWS} sətir göstərilir, cəmi {analysis.rows.length}.</p>}
        </>
      )}
    </Panel>
  );
}
