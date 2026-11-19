import { normalize } from "../../services/format.js";

type ImportWarehouse = { id: string; name: string; code?: string | null };

export type WarehouseImportRow = {
  product: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  salePrice: number | null;
  costPrice: number | null;
  category: string;
  reorderLevel: number | null;
  unit: string;
  serialTracked: boolean | null;
  lineNumber: number;
};
const warehouseImportHeaderAliases = {
  product: ["məhsul", "məhsul adı", "product", "name"],
  sku: ["sku", "kod", "code"],
  warehouse: ["anbar", "warehouse"],
  qty: ["miqdar", "qalıq", "qty", "quantity"],
  salePrice: ["satış qiyməti", "satış", "sale price", "sale_price", "price"],
  costPrice: ["alış qiyməti", "maya", "cost price", "cost_price"],
  category: ["kateqoriya", "category"],
  reorderLevel: ["minimum stok", "minimum", "reorder level", "reorder_level"],
  unit: ["ölçü vahidi", "vahid", "unit"],
  serialTracked: ["serial izləmə", "serial", "imei", "serial tracked"],
};

function parseDelimitedCsv(text: unknown): string[][] {
  const cleanText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleanText.split("\n").find((line) => line.trim()) || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    if (character === '"') {
      if (quoted && cleanText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseWarehouseImportNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim().replace(/[₼\s]/g, "");
  if (!raw) return null;
  const commaIndex = raw.lastIndexOf(",");
  const dotIndex = raw.lastIndexOf(".");
  const normalizedValue = commaIndex > dotIndex
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : null;
}

function parseWarehouseImportBoolean(value: unknown): boolean | null {
  const normalizedValue = normalize(value)
    .replaceAll("ə", "e")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]/g, "");
  if (["beli", "yes", "true", "1"].includes(normalizedValue)) return true;
  if (["xeyr", "no", "false", "0"].includes(normalizedValue)) return false;
  return null;
}

function getWarehouseImportCell(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[normalize(alias)];
    if (value !== undefined) return value;
  }
  return "";
}

function parseWarehouseImportCsv(text: unknown, warehouses: ImportWarehouse[] = []): { rows: WarehouseImportRow[]; errors: string[] } {
  const csvRows = parseDelimitedCsv(text);
  if (csvRows.length === 0) return { rows: [], errors: ["CSV faylı boşdur."] };

  const header = csvRows[0].map((value) => normalize(value));
  const hasProduct = warehouseImportHeaderAliases.product.some((alias) => header.includes(normalize(alias)));
  const hasWarehouse = warehouseImportHeaderAliases.warehouse.some((alias) => header.includes(normalize(alias)));
  const hasQuantity = warehouseImportHeaderAliases.qty.some((alias) => header.includes(normalize(alias)));
  if (!hasProduct || !hasWarehouse || !hasQuantity) {
    return { rows: [], errors: ["CSV başlığında Məhsul, Anbar və Miqdar sütunları olmalıdır."] };
  }

  const warehouseByName = new Map(warehouses.flatMap((warehouse) => [
    [normalize(warehouse.name), warehouse],
    [normalize(warehouse.code), warehouse],
  ]));
  const rows: WarehouseImportRow[] = [];
  const errors: string[] = [];

  csvRows.slice(1).forEach((cells, index) => {
    const record = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] || ""]));
    const product = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.product)).trim();
    const warehouseInput = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.warehouse)).trim();
    const quantity = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.qty));
    const salePrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.salePrice));
    const costPrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.costPrice));
    const reorderLevel = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.reorderLevel));
    const warehouse = warehouseByName.get(normalize(warehouseInput));
    const lineNumber = index + 2;

    if (!product) {
      errors.push(`Sətir ${lineNumber}: məhsul adı boşdur.`);
      return;
    }
    if (!warehouse) {
      errors.push(`Sətir ${lineNumber}: anbar tapılmadı (${warehouseInput || "boş"}).`);
      return;
    }
    if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push(`Sətir ${lineNumber}: miqdar müsbət tam ədəd olmalıdır.`);
      return;
    }
    if ([salePrice, costPrice, reorderLevel].some((value) => value !== null && value < 0)) {
      errors.push(`Sətir ${lineNumber}: qiymət və minimum stok mənfi ola bilməz.`);
      return;
    }

    rows.push({
      product,
      sku: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.sku)).trim().toUpperCase(),
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      qty: quantity,
      salePrice,
      costPrice,
      category: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.category)).trim(),
      reorderLevel: reorderLevel === null ? null : Math.max(0, Math.round(reorderLevel)),
      unit: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.unit)).trim(),
      serialTracked: parseWarehouseImportBoolean(getWarehouseImportCell(record, warehouseImportHeaderAliases.serialTracked)),
      lineNumber,
    });
  });

  return { rows, errors };
}

function downloadWarehouseImportTemplate(): void {
  const headers = ["Məhsul", "SKU", "Anbar", "Miqdar", "Satış qiyməti", "Alış qiyməti", "Kateqoriya", "Minimum stok", "Ölçü vahidi", "Serial izləmə"];
  const blob = new Blob([`\uFEFF${headers.join(";")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anbar-toplu-import-sablonu.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export { parseDelimitedCsv, parseWarehouseImportNumber, parseWarehouseImportBoolean, getWarehouseImportCell, parseWarehouseImportCsv, downloadWarehouseImportTemplate };
