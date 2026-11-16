// HR payroll xərci: əməkdaş qeydlərindən aylıq payroll accrual-ı (kassaya təsirsiz) qurur.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { baseFinanceDate, buildHrEmployeeRecords } from "./appDomainHr.jsx";

type Row = Record<string, any>;

export interface PayrollExpense {
  id: string;
  description: string;
  category: string;
  date: string;
  amount: number;
  status: string;
  source: string;
  cashImpact: false;
  cashImpactNote: string;
  grossTotal: number;
  deductions: number;
  netTotal: number;
  employerCost: number;
  payrollRows: Row[];
}

function buildPayrollExpense(employees: Row[]): PayrollExpense {
  const payrollRows = buildHrEmployeeRecords(employees);
  const netTotal = payrollRows.reduce((sum: number, employee: Row) => sum + Number(employee.netSalary || 0), 0);
  const grossTotal = payrollRows.reduce((sum: number, employee: Row) => sum + Number(employee.salary || 0) + Number(employee.bonus || 0), 0);
  const deductions = payrollRows.reduce((sum: number, employee: Row) => sum + Number(employee.tax || 0) + Number(employee.social || 0), 0);
  const employerCost = payrollRows.reduce((sum: number, employee: Row) => sum + Number(employee.employerCost || 0), 0);

  return {
    id: `PAY-${baseFinanceDate.slice(0, 7)}`,
    description: `HR payroll - ${baseFinanceDate.slice(0, 7)}`,
    category: "Payroll",
    date: baseFinanceDate,
    amount: employerCost || netTotal,
    status: "Təsdiq gözləyir",
    source: "HR Payroll",
    cashImpact: false,
    cashImpactNote: "HR payroll uçot/accrual xərcidir, real kassadan avtomatik çıxılmır.",
    grossTotal,
    deductions,
    netTotal,
    employerCost,
    payrollRows,
  };
}

export { buildPayrollExpense };
