// Payroll panel adapter; HR and finance share the same calculation rule.
import { calculatePayrollTax2026 } from '../../shared/lib/hrDomain.ts';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function calcPayroll(input = {}) {
  const base = Math.max(0, Number(input.baseSalary) || 0);
  const bonus = Math.max(0, Number(input.bonus) || 0);
  const deduction = Math.max(0, Number(input.otherDeductions) || 0);
  const workedRatio = input.workedDays != null && Number(input.workDays) > 0
    ? Math.min(1, Math.max(0, Number(input.workedDays) / Number(input.workDays)))
    : 1;

  // Adapt the shared HR/finance rule to the legacy panel's field names.
  const tax = calculatePayrollTax2026(round2(base * workedRatio + bonus));

  return {
    gross: tax.gross,
    bonus: round2(bonus),
    incomeTax: tax.incomeTax,
    socialEmployee: tax.employeeSocial,
    unemploymentEmployee: tax.employeeUnemployment,
    medicalEmployee: 0,
    otherDeductions: round2(deduction),
    totalDeductions: round2(tax.totalDeductions + deduction),
    net: round2(Math.max(0, tax.net - deduction)),
    employerCost: tax.employerCost,
    socialEmployer: tax.employerSocial,
    unemploymentEmployer: tax.employerUnemployment,
  };
}

// Sadə iş günü sayğacı (həftəsonu istisna) — davamiyyət norması üçün.
export function workDaysInMonth(year, month) {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function periodLabel(period) {
  if (!period) return "";
  const [year, month] = String(period).split("-");
  const names = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
  return `${names[Number(month) - 1] || month} ${year}`;
}
