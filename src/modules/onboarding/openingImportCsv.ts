// CSV templates and parsing for opening balances (import_opening_balances). Excel saves CSV with ";" or ","
// and a UTF-8 BOM; the shared warehouse parser handles both. Each row keeps its spreadsheet line number so
// the server can name the line it rejects.
import { normalize } from "../../services/format.js";
import { getWarehouseImportCell, parseDelimitedCsv, parseWarehouseImportNumber } from "../warehouse/warehouseImportCsv.ts";

export type OpeningImportKind = "customers" | "vendors" | "cash_accounts" | "credits";
type Row = Record<string, unknown> & { line: number };
type Column = { key: string; header: string; aliases: string[]; required?: boolean; number?: boolean; date?: boolean };

type KindConfig = {
  label: string;
  fileName: string;
  hint: string;
  columns: Column[];
  example: string[];
};

const col = (key: string, header: string, aliases: string[], extra: Partial<Column> = {}): Column => ({ key, header, aliases: [header, ...aliases], ...extra });

export const openingImportKinds: Record<OpeningImportKind, KindConfig> = {
  customers: {
    label: "Müştərilər",
    fileName: "baslangic-musteriler.csv",
    hint: "FİN və ya VÖEN-i sistemdə olan müştəri ikinci dəfə yaradılmır.",
    columns: [
      col("name", "Ad soyad / Şirkət", ["ad", "müştəri", "name"], { required: true }),
      col("fin", "FİN", ["fin"]),
      col("taxId", "VÖEN", ["voen", "vöen", "tax id"]),
      col("phone", "Telefon", ["phone", "mobil"]),
      col("email", "E-poçt", ["email", "e-mail"]),
      col("address", "Ünvan", ["address"]),
      col("note", "Qeyd", ["note", "qeydlər"]),
    ],
    example: ["Əli Məmmədov", "5ABC123", "", "+994501112233", "", "Bakı, Nəsimi r.", ""],
  },
  vendors: {
    label: "Təchizatçılar",
    fileName: "baslangic-techizatcilar.csv",
    hint: "Adı və ya VÖEN-i sistemdə olan təchizatçı ikinci dəfə yaradılmır.",
    columns: [
      col("name", "Təchizatçı", ["ad", "name", "vendor"], { required: true }),
      col("taxId", "VÖEN", ["voen", "vöen", "tax id"]),
      col("phone", "Telefon", ["phone"]),
      col("email", "E-poçt", ["email", "e-mail"]),
      col("address", "Ünvan", ["address"]),
    ],
    example: ["Texno Təchizat MMC", "1234567891", "+994124445566", "", "Bakı"],
  },
  cash_accounts: {
    label: "Kassa və bank hesabları",
    fileName: "baslangic-kassa-bank.csv",
    hint: "Növ: kassa və ya bank. Açılış qalığı keçid günündəki qalıqdır.",
    columns: [
      col("code", "Kod", ["code"], { required: true }),
      col("name", "Ad", ["name", "hesab"], { required: true }),
      col("type", "Növ", ["type"]),
      col("currency", "Valyuta", ["currency"]),
      col("accountNo", "Hesab nömrəsi", ["iban", "account no"]),
      col("openingBalance", "Açılış qalığı", ["qalıq", "opening balance"], { number: true }),
    ],
    example: ["KASSA-2", "Filial kassası", "kassa", "AZN", "", "1250.50"],
  },
  credits: {
    label: "Aktiv kreditlər",
    fileName: "baslangic-kreditler.csv",
    hint: "Əvvəlcə müştəriləri idxal edin. Qrafik ilk ödəniş tarixindən aylıq qurulur, ödənilmiş əsas borc ilk aylara yazılır.",
    columns: [
      col("contractNo", "Müqavilə nömrəsi", ["müqavilə", "contract"], { required: true }),
      col("fin", "Müştəri FİN", ["fin"]),
      col("taxId", "Müştəri VÖEN", ["voen", "vöen"]),
      col("initialPayment", "İlkin ödəniş", ["beh", "initial payment"], { number: true }),
      col("financed", "Kreditə verilən məbləğ", ["kredit məbləği", "financed"], { required: true, number: true }),
      col("termMonths", "Müddət (ay)", ["müddət", "ay", "term"], { required: true, number: true }),
      col("firstDueDate", "İlk ödəniş tarixi", ["ilk ödəniş", "first due date"], { required: true, date: true }),
      col("paidPrincipal", "Ödənilmiş əsas borc", ["ödənilib", "paid"], { number: true }),
    ],
    example: ["K-2024-015", "5ABC123", "", "200", "1800", "12", "10.01.2026", "750"],
  },
};

// 10.01.2026, 10/01/2026 and 2026-01-10 are accepted; the result is ISO (yyyy-mm-dd).
export function parseOpeningImportDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw))) [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cashTypes: Record<string, string> = { kassa: "cash", nağd: "cash", cash: "cash", bank: "bank" };

export function parseOpeningImportCsv(kind: OpeningImportKind, text: unknown): { rows: Row[]; errors: string[] } {
  const config = openingImportKinds[kind];
  const csvRows = parseDelimitedCsv(text);
  if (csvRows.length < 2) return { rows: [], errors: ["CSV faylında başlıqdan sonra sətir yoxdur."] };
  const header = csvRows[0].map((value) => normalize(value));
  const missing = config.columns.filter((column) => column.required && !column.aliases.some((alias) => header.includes(normalize(alias))));
  if (missing.length) return { rows: [], errors: [`CSV başlığında bu sütunlar yoxdur: ${missing.map((column) => column.header).join(", ")}.`] };

  const rows: Row[] = [];
  const errors: string[] = [];
  csvRows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const record = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] || ""]));
    const row: Row = { line };
    for (const column of config.columns) {
      const raw = String(getWarehouseImportCell(record, column.aliases)).trim();
      if (!raw) {
        if (column.required) errors.push(`Sətir ${line}: "${column.header}" boşdur.`);
        continue;
      }
      if (column.number) {
        const value = parseWarehouseImportNumber(raw);
        if (value === null || value < 0) errors.push(`Sətir ${line}: "${column.header}" mənfi olmayan rəqəm olmalıdır.`);
        else row[column.key] = value;
      } else if (column.date) {
        const value = parseOpeningImportDate(raw);
        if (!value) errors.push(`Sətir ${line}: "${column.header}" tarixi gg.aa.iiii formatında olmalıdır.`);
        else row[column.key] = value;
      } else {
        row[column.key] = raw;
      }
    }
    if (kind === "cash_accounts" && row.type) {
      const type = cashTypes[normalize(row.type)];
      if (!type) errors.push(`Sətir ${line}: "Növ" kassa və ya bank olmalıdır.`);
      else row.type = type;
    }
    if (kind === "credits") {
      if (!row.fin && !row.taxId) errors.push(`Sətir ${line}: müştərinin FİN və ya VÖEN-i lazımdır.`);
      const term = Number(row.termMonths);
      if (row.termMonths !== undefined && (!Number.isInteger(term) || term < 1 || term > 120)) errors.push(`Sətir ${line}: müddət 1-120 ay arası tam ədəd olmalıdır.`);
      if (Number(row.financed) > 0 && Number(row.paidPrincipal || 0) >= Number(row.financed)) errors.push(`Sətir ${line}: kredit tam ödənilib, idxal etməyin.`);
    }
    rows.push(row);
  });
  return { rows, errors };
}

export function buildOpeningImportTemplate(kind: OpeningImportKind): string {
  const config = openingImportKinds[kind];
  const escape = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${config.columns.map((column) => escape(column.header)).join(";")}\n${config.example.map(escape).join(";")}\n`;
}

export function downloadOpeningImportTemplate(kind: OpeningImportKind): void {
  const blob = new Blob([buildOpeningImportTemplate(kind)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = openingImportKinds[kind].fileName;
  link.click();
  URL.revokeObjectURL(url);
}
