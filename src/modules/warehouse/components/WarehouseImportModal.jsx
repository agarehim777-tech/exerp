import { useMemo, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import { DataTable } from "../../../components/ui.jsx";
import { money } from "../../../services/format.js";
import { parseWarehouseImportCsv, downloadWarehouseImportTemplate } from "../warehouseImportCsv.ts";

function WarehouseImportModal({ warehouses, onClose, onImport }) {
  const fileInputRef = useRef(null);
  const requestKey = useRef(crypto.randomUUID());
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState(null);
  const [readError, setReadError] = useState('');
  const analysis = useMemo(() => readError
    ? { rows: [], errors: [readError] }
    : csvText === null ? { rows: [], errors: [] } : parseWarehouseImportCsv(csvText, warehouses),
  [csvText, warehouses, readError]);
  const submittedRows = useRef(null);
  const [isReading, setIsReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function submitImport() {
    if (saving || isReading || analysis.errors.length || !analysis.rows.length) return;
    const signature = JSON.stringify(analysis.rows);
    if (submittedRows.current !== null && submittedRows.current !== signature) {
      requestKey.current = crypto.randomUUID();
    }
    submittedRows.current = signature;
    setSaving(true);
    setSaveError('');
    try { await onImport(analysis.rows, requestKey.current); }
    catch (error) { setSaveError(error.message || 'İmport saxlanılmadı.'); }
    finally { setSaving(false); }
  }

  async function readFile(file) {
    if (!file || saving) return;
    requestKey.current = crypto.randomUUID();
    submittedRows.current = null;
    setSaveError('');
    setReadError('');
    setCsvText(null);
    setIsReading(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvText(text);
    } catch {
      setReadError("CSV faylı oxunmadı.");
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card warehouse-import-card">
        <div className="modal-head">
          <div>
            <h2>Toplu stok importu</h2>
            <p>CSV faylından anbar qalıqlarını əlavə edin.</p>
          </div>
          <button className="icon-btn" disabled={saving} onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>

        <div className="warehouse-import-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            disabled={saving}
            aria-label="CSV faylı seçin"
            onChange={(event) => readFile(event.target.files?.[0])}
          />
          <button type="button" className="primary-btn" disabled={isReading || saving} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> {isReading ? "Oxunur..." : "CSV seçin"}
          </button>
          <button type="button" className="secondary-btn" onClick={downloadWarehouseImportTemplate}>
            <Download size={16} /> Şablon CSV
          </button>
          {fileName && <span>{fileName}</span>}
        </div>

        {(analysis.rows.length > 0 || analysis.errors.length > 0) && (
          <>
            <div className="warehouse-import-summary">
              <strong>{analysis.rows.length} etibarlı sətir</strong>
              <span>{analysis.errors.length} xəta</span>
            </div>
            {analysis.rows.length > 0 && (
              <DataTable
                columns={["Məhsul", "SKU", "Anbar", "Miqdar", "Satış", "Maya", "Minimum"]}
                rows={analysis.rows.slice(0, 8).map((row) => [
                  <strong>{row.product}</strong>,
                  row.sku || "Avtomatik",
                  row.warehouseName,
                  row.qty,
                  row.salePrice === null ? "—" : money(row.salePrice),
                  row.costPrice === null ? "—" : money(row.costPrice),
                  row.reorderLevel === null ? "—" : row.reorderLevel,
                ])}
              />
            )}
            {analysis.errors.length > 0 && (
              <div className="warehouse-import-errors">
                {analysis.errors.slice(0, 5).map((error) => <span key={error}>{error}</span>)}
                {analysis.errors.length > 5 && <span>və daha {analysis.errors.length - 5} xəta</span>}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-btn" disabled={saving} onClick={onClose}>Ləğv et</button>
          <button type="button" className="primary-btn" disabled={analysis.rows.length === 0 || analysis.errors.length > 0 || isReading || saving} onClick={submitImport}>
            <Upload size={16} /> {saving ? 'Saxlanılır...' : 'İmport et'}
          </button>
        </div>
        {saveError && <p role="alert">{saveError}</p>}
      </div>
    </div>
  );
}

export { WarehouseImportModal };
