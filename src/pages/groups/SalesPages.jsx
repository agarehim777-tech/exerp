// Dashboard, CRM, sales, stock, product, warehouse and delivery pages, moved from App.jsx.
// App.jsx renders this with the values the pages need; add or change these pages' props here.
import { CrmActivitiesPage, CrmCustomersPageV2, CrmDealsPage, CrmTasksPage, DashboardPage, DeliveriesPage, ProductsPage, SalesDashboardPage, SalesOrdersPage, StockPage, WarehousePage } from "../../config/lazyPages.js";
import { pathForModule } from "../../config/routes.js";
import { dbCustomerToLegacy, dbOrderToLegacy } from "../../shared/adapters/erpShape.js";

/**
 * The database-backed values keep the types their hooks return, so checkJs checks them against the pages'
 * props as it did when this JSX lived in App.jsx. The other values are App state passed through.
 * @typedef {ReturnType<typeof import("../../shared/hooks/useOrders.js").useOrders>} SalesRepository
 * @param {{
 *   dbCustomers: ReturnType<typeof import("../../shared/hooks/useCustomers.js").useCustomers>["customers"],
 *   dbProducts: ReturnType<typeof import("../../shared/hooks/useProducts.js").useProducts>["products"],
 *   dbOrders: SalesRepository["orders"],
 *   dbSales: SalesRepository,
 *   dbInventory: ReturnType<typeof import("../../shared/hooks/useStock.js").useStock>,
 *   [name: string]: any,
 * }} props
 */
export function SalesPages({ active, auditOperation, choosePage, completeWarehouseDelivery, dbCustomers, dbInventory, dbOrders, dbProducts, dbSales, deleteWarehouse, filtered, navigate, openLinkedCredit, openLinkedSalesOrder, query, selectedWarehouseId, setModal, setQuery, setSelectedWarehouseId, state, transferWarehouseStock }) {
  return (
    <>
          {active === "dashboard" && (
            <DashboardPage
              orders={dbOrders.map(dbOrderToLegacy)}
              customers={dbCustomers.map(dbCustomerToLegacy)}
              onOpenPendingExpenses={() => {
                if (choosePage("cashbook")) {
                  navigate(`${pathForModule("cashbook")}?tab=expenses&status=pending`);
                }
              }}
            />
          )}
          {active === "crm" && <CrmCustomersPageV2 onOpenSalesOrder={openLinkedSalesOrder} onOpenCredit={openLinkedCredit} />}
          {active === "crm-deals" && <CrmDealsPage />}
          {active === "crm-activities" && <CrmActivitiesPage />}
          {active === "crm-tasks" && <CrmTasksPage />}
          {active === "sales-dashboard" && <SalesDashboardPage />}
          {active === "sales" && <SalesOrdersPage repository={dbSales} customers={dbCustomers} products={dbProducts} />}
          {active === "stock" && <StockPage inventory={dbInventory} products={dbProducts} />}
          {active === "products" && (
            <ProductsPage
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              inventoryBalances={dbInventory.balances || []}
              products={state.products || []}
              purchaseOrders={state.purchaseOrders || []}
              orders={state.orders || []}
              stockMovements={dbInventory.movements || []}
              fetchAllMovements={dbInventory.fetchAllMovements}
              onReceiveStock={() => setModal({ type: "stockIntake" })}
              onOpenImport={() => setModal({ type: "warehouseImport" })}
              onCreateProduct={() => setModal({ type: "product", mode: "create" })}
              onEditProduct={(productId) => setModal({ type: "product", mode: "edit", productId })}
              onOpenWarehouse={(warehouseId) => {
                setSelectedWarehouseId(warehouseId || "all");
                choosePage("warehouse");
              }}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenProcurementDocument={(document) => {
                setModal(null);
                setQuery(document?.receipt_no || document?.shipment_no || "");
                choosePage("procurement");
              }}
              onTrackAction={(action, detail) => auditOperation({ module: "Anbar", action, detail })}
            />
          )}
          {active === "warehouse" && (
            <WarehousePage
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              products={state.products || []}
              orders={state.orders}
              purchaseOrders={state.purchaseOrders || []}
              selectedWarehouseId={selectedWarehouseId}
              query={query}
              onSelect={setSelectedWarehouseId}
              onEdit={(warehouseId) =>
                setModal({ type: "warehouse", mode: "edit", warehouseId })
              }
              onDelete={deleteWarehouse}
              onCompleteDelivery={completeWarehouseDelivery}
              onTransferStock={transferWarehouseStock}
              onReceiveStock={() => setModal({ type: "stockIntake" })}
              onOpenImport={() => setModal({ type: "warehouseImport" })}
              onCreateProduct={() => setModal({ type: "product", mode: "create" })}
              onEditProduct={(productId) => setModal({ type: "product", mode: "edit", productId })}
              onTrackAction={(action, detail) => auditOperation({ module: "Anbar", action, detail })}
            />
          )}
          {active === "deliveries" && (
            <DeliveriesPage
              orders={filtered.orders}
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              onCompleteDelivery={completeWarehouseDelivery}
            />
          )}
    </>
  );
}
