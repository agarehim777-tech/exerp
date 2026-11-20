// Cashbook, invoicing, accounting, credit, receivable, vendor, procurement, HR, KPI, bonus, production,
// contract, project and report pages, moved from App.jsx.
// App.jsx renders this with the values the pages need; add or change these pages' props here.
import { AccountingPageV2, BonusesPage, CashbookPage, ContractsPage, CreditsPage, HrPage, InvoicesPage, KpiPage, ProcurementPage, ProductionLedgerPage, ProjectsPage, ReceivablesPage, ReportsPage, SalesInvoicesPage, VendorManagementPage } from "../../config/lazyPages.js";
import { kpiPeriodView } from "../../services/financialSettlement.js";
import { currentBusinessDate } from "../../shared/lib/appDomain.jsx";
import { buildExecutiveInsights, buildInvoiceSummary, buildReportPackage } from "../../shared/lib/appHelpers.jsx";

export function FinancePages({ active, activeKpiPeriod, approvePurchaseOrder, can, createPurchaseOrder, creditRecords, dbOrdersError, dbOrdersLoading, exportReport, filtered, invoiceRows, kpiAccountId, kpiEmployeeRows, kpiLedger, kpiTargetRows, markPayrollPaid, openDepartmentCreator, openEmployeeDelete, openEmployeeEditor, openLeaveRequestCreator, openLinkedSalesOrder, openVacancyCreator, openVendorDelete, payCreditInitial, productionRows, receiveCreditPayment, refreshDbOrders, runKpiPeriodAction, salesBonusRows, selectedKpiPeriod, sendCreditSms, setKpiAccountId, setModal, setSelectedKpiPeriod, startCredit, state, updateCreditPaymentDate, updateEmployeeDocuments, updateEmployeeStructure, updateLeaveRequestStatus }) {
  return (
    <>
          {active === "cashbook" && <CashbookPage legacyCashEntries={state.cashEntries || []} />}
          {active === "ar-invoices" && <SalesInvoicesPage onOpenSalesOrder={openLinkedSalesOrder} />}
          {active === "invoices" && (
            <InvoicesPage
              invoices={filtered.invoices}
              summary={buildInvoiceSummary(invoiceRows)}
              invoiceSettings={state.invoiceSettings}
              onExport={exportReport}
              onOpenSalesOrder={openLinkedSalesOrder}
            />
          )}
          {active === "accounting" && <AccountingPageV2 />}
          {active === "credits" && (
            <CreditsPage
              credits={filtered.credits}
              loading={dbOrdersLoading}
              error={dbOrdersError}
              onRefresh={refreshDbOrders}
              sendCreditSms={sendCreditSms}
              onUpdatePaymentDate={updateCreditPaymentDate}
              onReceivePayment={receiveCreditPayment}
              onStartCredit={startCredit}
              onPayCreditInitial={payCreditInitial}
              onCreateCredit={() => setModal({ type: "sales", presetPaymentMethod: "Kredit" })}
              onOpenSalesOrder={openLinkedSalesOrder}
            />
          )}
          {active === "receivables" && (
            <ReceivablesPage
              onOpenSalesOrder={openLinkedSalesOrder}
            />
          )}
          {active === "vendors" && (
            <VendorManagementPage
              vendors={filtered.vendors}
              warehouseStock={state.warehouseStock}
              products={state.products || []}
              warehouses={state.warehouses}
              orders={state.orders}
              purchaseOrders={state.purchaseOrders || []}
              onCreateVendor={() => setModal({ type: "vendors", mode: "create" })}
              onEditVendor={(vendorKey) => setModal({ type: "vendors", mode: "edit", vendorKey })}
              onDeleteVendor={openVendorDelete}
              onCreatePurchaseOrder={createPurchaseOrder}
              onOpenPurchaseOrderModal={() => setModal({ type: "purchaseOrder" })}
              onApprovePurchaseOrder={approvePurchaseOrder}
              canManagePo={can("vendors.po")}
              canManageVendors={can("vendors.manage")}
            />
          )}
          {active === "procurement" && <ProcurementPage />}
          {active === "hr" && (
            <HrPage
              employees={filtered.employees}
              allEmployees={state.employees}
              departments={state.departments || []}
              leaveRequests={state.leaveRequests || []}
              vacancies={state.vacancies || []}
              onUpdateEmployeeStructure={updateEmployeeStructure}
              onEditEmployee={openEmployeeEditor}
              onDeleteEmployee={openEmployeeDelete}
              onCreateDepartment={openDepartmentCreator}
              onCreateLeaveRequest={openLeaveRequestCreator}
              onCreateVacancy={openVacancyCreator}
              onUpdateLeaveStatus={updateLeaveRequestStatus}
              onMarkPayrollPaid={markPayrollPaid}
              onUpdateEmployeeDocuments={updateEmployeeDocuments}
            />
          )}
          {active === "kpi" && (
            <KpiPage
              employees={state.employees}
              salesBonuses={salesBonusRows}
              targetRows={kpiTargetRows}
              employeeRows={kpiEmployeeRows}
              activePeriod={activeKpiPeriod}
              periods={(kpiLedger.data?.periods || []).map(kpiPeriodView)}
              payouts={(kpiLedger.data?.periods || []).filter(row => row.status === 'paid').map(row => ({ id: row.id, period: row.period.slice(0, 7), amount: Number(row.payout_amount), at: row.paid_at, expenseId: row.expense_id }))}
              period={selectedKpiPeriod}
              onSelectPeriod={setSelectedKpiPeriod}
              accounts={kpiLedger.data?.accounts || []}
              accountId={kpiAccountId}
              onSelectAccount={setKpiAccountId}
              busy={kpiLedger.busy || !kpiLedger.ready}
              error={kpiLedger.error}
              onRetry={() => kpiLedger.refresh().catch(() => {})}
              onRunPeriodAction={runKpiPeriodAction}
            />
          )}
          {active === "bonuses" && <BonusesPage salesBonuses={salesBonusRows} />}
          {active === "production" && <ProductionLedgerPage />}
          {active === "contracts" && (
            <ContractsPage
              contracts={filtered.contracts}
              onExport={(id) => setModal({ type: "contractPrint", contractId: id })}
            />
          )}
          {active === "projects" && <ProjectsPage projects={filtered.projects} snapshot={state.projectRoiSnapshot} />}
          {active === "reports" && (
            <ReportsPage
              orders={state.orders}
              credits={creditRecords}
              vendors={state.vendors}
              employees={state.employees}
              expenses={state.expenses}
              warehouseStock={state.warehouseStock}
              warehouses={state.warehouses}
              products={state.products || []}
              purchaseOrders={state.purchaseOrders || []}
              productionPlans={productionRows}
              invoices={invoiceRows}
              cashEntries={state.cashEntries || []}
              exports={state.reportExports || []}
              onExport={exportReport}
              canExport={can("reports.export")}
              snapshotDate={currentBusinessDate}
              buildExecutiveInsights={buildExecutiveInsights}
              buildReportPackage={buildReportPackage}
            />
          )}
    </>
  );
}
