// İstehsal planı: anbar seçimi, xammal ehtiyacı və qalığı, maya dəyəri, gözlənilən gəlir/mənfəət, darboğaz və statuslar.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { normalize } from "../../services/format.js";
import { buildProductLookup } from "./appDomainProcurement.jsx";
import { getAvailableQuantity } from "./appDomainWarehouse.jsx";

type Row = Record<string, any>;

export interface ProductionPlanRow extends Row {
  warehouseId: string;
  warehouseName: string;
  materials: Row[];
  materialCost: number;
  totalCost: number;
  unitCost: number;
  canProduce: boolean;
  status: string;
}

function buildProductionPlanRows(
  productionPlans: Row[] | null | undefined,
  stock: Row[] | null | undefined,
  warehouseStock: Record<string, Row[] | null | undefined> | null = {},
  products: Row[] = [],
  warehouses: Row[] = [],
): ProductionPlanRow[] {
  const aggregateStockByProduct = new Map((stock || []).map((item) => [item.product, item]));
  const productsByName = buildProductLookup(products);
  const warehouseById = new Map((warehouses || []).map((warehouse) => [warehouse.id, warehouse]));

  return (productionPlans || []).map((plan) => {
    const completed = normalize(plan.status).includes("istehsal edildi");
    const warehouseId =
      plan.warehouseId ||
      Object.entries(warehouseStock || {}).find(([, rows]) =>
        (rows || []).some((row) => (plan.materials || []).some((material: Row) => material.product === row.product)),
      )?.[0] ||
      warehouses[0]?.id ||
      "";
    const warehouseRows = warehouseStock?.[warehouseId] || [];
    const sourceRows = warehouseRows.length > 0 ? warehouseRows : stock || [];
    const sourceByProduct = new Map(sourceRows.map((item) => [item.product, item]));
    const issuedByProduct = new Map<unknown, Row>((plan.issuedMaterials || []).map((item: Row) => [item.product, item]));

    const materials = (plan.materials || []).map((material: Row) => {
      const stockItem = sourceByProduct.get(material.product) || aggregateStockByProduct.get(material.product);
      const product = productsByName.get(normalize(material.product));
      const issued = issuedByProduct.get(material.product);
      const available = stockItem ? getAvailableQuantity(stockItem) : 0;
      const needed = Number(material.needed ?? Number(material.qty || 0) * Number(plan.plannedQty || 0));
      const configuredCost = issued?.unitCost ?? material.unitCost ?? product?.costPrice;
      const unitCost = Number(configuredCost || stockItem?.costPrice || stockItem?.price || product?.salePrice || 0);
      const cost = Math.round(Number(issued?.cost ?? material.cost ?? needed * unitCost));

      return {
        ...material,
        needed,
        available,
        availableAfter: completed ? issued?.availableAfter ?? available : available,
        unitPrice: unitCost,
        unitCost,
        cost,
        enough: completed || available >= needed,
      };
    });
    const materialCost = Number(plan.actualMaterialCost ?? materials.reduce((sum: number, material: Row) => sum + Number(material.cost || 0), 0));
    const totalCost = Number(plan.actualTotalCost ?? materialCost + Number(plan.laborCost || 0) + Number(plan.overheadCost || 0));
    const unitCost = Number(plan.actualUnitCost ?? (Number(plan.plannedQty || 0) > 0 ? Math.round(totalCost / Number(plan.plannedQty || 1)) : 0));
    const projectedRevenue = Number(plan.salePrice || 0) * Number(plan.plannedQty || 0);
    const projectedProfit = projectedRevenue - totalCost;
    const bottleneck = completed ? null : materials.find((material: Row) => !material.enough);
    const producedQty = Number(plan.producedQty || (completed ? plan.plannedQty : 0) || 0);

    return {
      ...plan,
      warehouseId,
      warehouseName: warehouseById.get(warehouseId)?.name || plan.warehouseName || "Anbar seçilməyib",
      materials,
      materialCost,
      totalCost,
      unitCost,
      projectedRevenue,
      projectedProfit,
      producedQty,
      margin: projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0,
      bottleneck: bottleneck?.product || (completed ? "İstehsal bağlandı" : "Xammal kifayətdir"),
      canProduce: !completed && !bottleneck && Number(plan.plannedQty || 0) > 0,
      issueStatus: completed ? "Xammal çıxıldı" : bottleneck ? "Xammal çatmır" : "Çıxışa hazır",
      receiptStatus: completed ? `${producedQty} hazır məhsul mədaxil` : "Mədaxil gözləyir",
      status: completed ? "İstehsal edildi" : bottleneck ? "Xammal riski" : plan.status || "Planlandı",
    };
  });
}

export { buildProductionPlanRows };
