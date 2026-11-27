import { lazy, useState } from "react";
import { resolveModalKind } from "../../config/modal-registry.js";
import { Download, FileText, Plus, X } from "lucide-react";
import { TwoLine } from "../../shared/ui/primitives.tsx";
import { money, normalize } from "../../services/format.js";
import { getEmployeeKey, isPurchaseOrderOpen, getVendorKey } from "../../shared/lib/appDomain.jsx";
import { WarehouseImportModal } from "../../modules/warehouse/components/WarehouseImportModal.jsx";

const ExpenseOperationModal = lazy(() => import("./OperationModals.jsx").then((module) => ({ default: module.ExpenseOperationModal })));
const OperationDeleteModal = lazy(() => import("./OperationModals.jsx").then((module) => ({ default: module.OperationDeleteModal })));
const ProductFormModal = lazy(() => import("../../modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.ProductFormModal })));
const WarehouseFormModal = lazy(() => import("../../modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.WarehouseFormModal })));
const HrDepartmentModal = lazy(() => import("../../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrDepartmentModal })));
const HrEmployeeDeleteModal = lazy(() => import("../../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeDeleteModal })));
const HrEmployeeModal = lazy(() => import("../../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeModal })));
const HrLeaveRequestModal = lazy(() => import("../../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrLeaveRequestModal })));
const HrVacancyModal = lazy(() => import("../../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrVacancyModal })));
const StockIntakeModal = lazy(() => import("../../modules/warehouse/components/StockIntakeModal.jsx").then((module) => ({ default: module.StockIntakeModal })));
const FactoryPurchaseOrderModal = lazy(() => import("../../modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.FactoryPurchaseOrderModal })));
const VendorFormModal = lazy(() => import("../../modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.VendorFormModal })));
const SalesOperationModal = lazy(() => import("../../modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOperationModal })));
const SalesOrderModal = lazy(() => import("../../modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOrderModal })));

/**
 * @param {{ contract: any, settings?: { company?: string, voen?: string, [key: string]: any }, onClose: any }} props
 */
function ContractPrintModal({ contract, settings = {}, onClose }) {
  function downloadDocument() {
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>${contract.id}</title></head><body><h1>${settings.company || "ERP+CRM AZ"}</h1><h2>Satış müqaviləsi ${contract.id}</h2><p><strong>Müştəri:</strong> ${contract.customer}</p><p><strong>FİN:</strong> ${contract.fin || "—"}</p><p><strong>Məhsul:</strong> ${contract.product}</p><p><strong>Məbləğ:</strong> ${money(contract.amount)}</p><p><strong>Status:</strong> ${contract.status}</p><p>Bu sənəd ERP+CRM AZ sistemində formalaşdırılmışdır.</p></body></html>`;
    const blob = new Blob([content], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contract.id}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell print-modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head no-print">
          <div>
            <h2>Müqavilə sənədi</h2>
            <p>PDF üçün çap dialoqundan “Save as PDF” seçin və ya Word sənədini endirin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <article className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <strong>{settings.company || "ERP+CRM AZ"}</strong>
              <span>{settings.voen ? `VÖEN: ${settings.voen}` : ""}</span>
            </div>
            <div><strong>MÜQAVİLƏ</strong><span>{contract.id}</span></div>
          </div>
          <div className="invoice-meta-grid">
            <TwoLine title="Müştəri" subtitle={contract.customer} />
            <TwoLine title="FİN" subtitle={contract.fin || "—"} />
            <TwoLine title="Məhsul" subtitle={contract.product} />
            <TwoLine title="Məbləğ" subtitle={money(contract.amount)} />
          </div>
          <p className="contract-body-copy">Tərəflər məhsulun təhvil verilməsi, ödəniş və zəmanət şərtlərinin bu müqavilə üzrə tətbiq olunduğunu təsdiq edir.</p>
          <div className="contract-signatures"><span>Satıcı imzası</span><span>Müştəri imzası</span></div>
        </article>
        <div className="modal-actions no-print">
          <button className="secondary-btn" onClick={downloadDocument}><Download size={16} /> Word sənədi</button>
          <button className="primary-btn" onClick={() => window.print()}><FileText size={16} /> Print / PDF</button>
        </div>
      </div>
    </div>
  );
}

function CreateModal({
  type,
  mode,
  config,
  warehouse,
  product,
  employee,
  vendor,
  salesOrder,
  expense,
  contract,
  companySettings,
  orderOptions,
  salesDefaults,
  onClose,
  onCreate,
  onUpdateWarehouse,
  onReceiveStock,
  onCreatePurchaseOrder,
  onImportWarehouseStock,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateSalesOrder,
  onDeleteSalesOrder,
  onUpdateExpense,
  onDeleteExpense,
  onSaveVendor,
  onRequestVendorDelete,
  onDeleteVendor,
  onSaveEmployee,
  onCreateDepartment,
  onDeleteEmployee,
  onCreateLeaveRequest,
  onCreateVacancy,
}) {
  const modalKind = resolveModalKind(type);

  if (modalKind === "warehouse") {
    return (
      <WarehouseFormModal
        mode={mode}
        warehouse={warehouse}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && warehouse) {
            onUpdateWarehouse(warehouse.id, values);
            return;
          }
          onCreate("warehouse", values);
        }}
      />
    );
  }

  if (modalKind === "stockIntake") {
    return (
      <StockIntakeModal
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        onClose={onClose}
        onSubmit={onReceiveStock}
      />
    );
  }

  if (modalKind === "warehouseImport") {
    return <WarehouseImportModal warehouses={orderOptions.warehouses} onClose={onClose} onImport={onImportWarehouseStock} />;
  }

  if (modalKind === "purchaseOrder") {
    return (
      <FactoryPurchaseOrderModal
        vendors={orderOptions.vendors}
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        warehouseStock={orderOptions.warehouseStock}
        purchaseOrders={orderOptions.purchaseOrders}
        onClose={onClose}
        onSubmit={onCreatePurchaseOrder}
      />
    );
  }

  if (modalKind === "vendor") {
    return (
      <VendorFormModal
        vendor={vendor}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && vendor) {
            onSaveVendor(getVendorKey(vendor), values);
            return;
          }
          onCreate("vendors", values);
        }}
        onDelete={vendor ? () => onRequestVendorDelete(getVendorKey(vendor)) : null}
      />
    );
  }

  if (modalKind === "vendorDelete" && vendor) {
    const openPoCount = (orderOptions.purchaseOrders || []).filter(
      (po) =>
        isPurchaseOrderOpen(po) &&
        (normalize(po.vendor) === normalize(vendor.name) || normalize(po.supplierSource) === normalize(vendor.name)),
    ).length;

    return (
      <OperationDeleteModal
        title="Təchizatçını sil"
        description={`${vendor.name} · ${vendor.country || "Ölkə qeyd edilməyib"}`}
        warning={
          openPoCount > 0
            ? `${openPoCount} açıq PO var. Əvvəl PO-ları təsdiqləyin, sonra təchizatçı silinə bilər.`
            : "Təchizatçı reyestrdən silinəcək. Bağlı təsdiqlənmiş PO tarixçəsi qalacaq."
        }
        confirmDisabled={openPoCount > 0}
        confirmLabel={openPoCount > 0 ? "PO açıqdır" : "Sil"}
        onClose={onClose}
        onConfirm={() => onDeleteVendor(getVendorKey(vendor))}
      />
    );
  }

  if (modalKind === "employee") {
    return (
      <HrEmployeeModal
        employee={employee}
        employees={orderOptions.employees}
        departments={orderOptions.departments}
        onClose={onClose}
        onSubmit={(values) => {
          if (employee) {
            onSaveEmployee(getEmployeeKey(employee), values);
            return;
          }
          onCreate("hr", values);
        }}
      />
    );
  }

  if (modalKind === "department") {
    return <HrDepartmentModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateDepartment} />;
  }

  if (modalKind === "leaveRequest") {
    return <HrLeaveRequestModal employees={orderOptions.employees} onClose={onClose} onSubmit={onCreateLeaveRequest} />;
  }

  if (modalKind === "vacancy") {
    return <HrVacancyModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateVacancy} />;
  }

  if (modalKind === "employeeDelete" && employee) {
    return <HrEmployeeDeleteModal employee={employee} employees={orderOptions.employees} onClose={onClose} onConfirm={(replacementManagerId) => onDeleteEmployee(getEmployeeKey(employee), replacementManagerId)} />;
  }

  if (modalKind === "product") {
    return (
      <ProductFormModal
        product={product}
        onClose={onClose}
        onDelete={mode === "edit" && product ? () => onDeleteProduct(product.id) : null}
        onSubmit={(values) => {
          if (mode === "edit" && product) {
            return onUpdateProduct(product.id, values);
          }
          return onCreate("product", values);
        }}
      />
    );
  }

  if (modalKind === "contractPrint" && contract) {
    return <ContractPrintModal contract={contract} settings={companySettings} onClose={onClose} />;
  }

  if (modalKind === "salesOperation" && salesOrder) {
    return (
      <SalesOperationModal
        order={salesOrder}
        orderOptions={orderOptions}
        onClose={onClose}
        onSubmit={(values) => onUpdateSalesOrder(salesOrder.id, values)}
      />
    );
  }

  if (modalKind === "salesOperationDelete" && salesOrder) {
    return (
      <OperationDeleteModal
        title="Satış əməliyyatını sil"
        description={`${salesOrder.id} · ${salesOrder.customer} · ${money(salesOrder.amount)}`}
        warning="Təhvil verilməyibsə rezerv açılacaq. Kreditli satışdırsa bağlı kredit, müqavilə və kassa daxilolmaları da təmizlənəcək."
        onClose={onClose}
        onConfirm={() => onDeleteSalesOrder(salesOrder.id)}
      />
    );
  }

  if (modalKind === "expenseOperation" && expense) {
    return (
      <ExpenseOperationModal
        expense={expense}
        onClose={onClose}
        onSubmit={(values) => onUpdateExpense(expense.id, values)}
      />
    );
  }

  if (modalKind === "expenseOperationDelete" && expense) {
    return (
      <OperationDeleteModal
        title="Xərc əməliyyatını sil"
        description={`${expense.id} · ${expense.description} · ${money(expense.amount)}`}
        warning="Bu xərc ledger, P&L və cash balans hesablamalarından çıxarılacaq."
        onClose={onClose}
        onConfirm={() => onDeleteExpense(expense.id)}
      />
    );
  }

  if (modalKind === "salesOrder") {
    return (
      <SalesOrderModal
        type={type}
        orderOptions={orderOptions}
        defaults={salesDefaults}
        onClose={onClose}
        onCreate={onCreate}
      />
    );
  }

  return (
    <GenericCreateModal
      type={type}
      config={config}
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}

function GenericCreateModal({ type, config, onClose, onCreate }) {
  const [values, setValues] = useState(
    Object.fromEntries(config.fields.map((field) => [field.name, field.value || ""])),
  );

  function submit(event) {
    event.preventDefault();
    onCreate(type, values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{config.title}</h2>
            <p>{config.subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {config.fields.map((field) => (
            <label key={field.name} className={field.full ? "full" : ""}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={values[field.name]}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={values[field.name]}
                  required={field.required}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={16} />
              Əlavə et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { ContractPrintModal, CreateModal, GenericCreateModal };
