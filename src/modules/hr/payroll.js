// Azərbaycan (qeyri-neft, özəl sektor) üzrə sadələşdirilmiş əmək haqqı hesablaması.
// Bütün dərəcələr konfiqurasiya ilə dəyişdirilə bilər.
export const DEFAULT_PAYROLL_CONFIG = Object.freeze({
  incomeTaxExemptLimit: 8000, // aylıq gəlir vergisi azadolma həddi
  incomeTaxRate: 0.14, // həddi aşan hissə üçün
  socialLowLimit: 200, // DSMF pilləsi
  socialEmployeeLow: 0.03,
  socialEmployeeHigh: 0.1,
  socialEmployerLow: 0.22,
  socialEmployerHigh: 0.15,
  unemploymentRate: 0.005, // işçi və işəgötürən üçün eyni
  medicalLimit: 8000,
  medicalEmployeeLow: 0.02,
  medicalEmployeeHigh: 0.005,
});

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function calcPayroll(input = {}, config = DEFAULT_PAYROLL_CONFIG) {
  const cfg = { ...DEFAULT_PAYROLL_CONFIG, ...config };
  const base = Math.max(0, Number(input.baseSalary) || 0);
  const bonus = Math.max(0, Number(input.bonus) || 0);
  const deduction = Math.max(0, Number(input.otherDeductions) || 0);
  const workedRatio = input.workedDays && input.workDays
    ? Math.min(1, Math.max(0, Number(input.workedDays) / Number(input.workDays)))
    : 1;

  const gross = round2(base * workedRatio + bonus);

  const socialEmployee = gross <= cfg.socialLowLimit
    ? gross * cfg.socialEmployeeLow
    : cfg.socialLowLimit * cfg.socialEmployeeLow + (gross - cfg.socialLowLimit) * cfg.socialEmployeeHigh;

  const socialEmployer = gross <= cfg.socialLowLimit
    ? gross * cfg.socialEmployerLow
    : cfg.socialLowLimit * cfg.socialEmployerLow + (gross - cfg.socialLowLimit) * cfg.socialEmployerHigh;

  const unemploymentEmployee = gross * cfg.unemploymentRate;
  const unemploymentEmployer = gross * cfg.unemploymentRate;

  const medicalEmployee = gross <= cfg.medicalLimit
    ? gross * cfg.medicalEmployeeLow
    : cfg.medicalLimit * cfg.medicalEmployeeLow + (gross - cfg.medicalLimit) * cfg.medicalEmployeeHigh;

  const taxable = Math.max(0, gross - cfg.incomeTaxExemptLimit);
  const incomeTax = taxable * cfg.incomeTaxRate;

  const totalDeductions = socialEmployee + unemploymentEmployee + medicalEmployee + incomeTax + deduction;
  const net = gross - totalDeductions;

  return {
    gross: round2(gross),
    bonus: round2(bonus),
    incomeTax: round2(incomeTax),
    socialEmployee: round2(socialEmployee),
    unemploymentEmployee: round2(unemploymentEmployee),
    medicalEmployee: round2(medicalEmployee),
    otherDeductions: round2(deduction),
    totalDeductions: round2(totalDeductions),
    net: round2(Math.max(0, net)),
    employerCost: round2(gross + socialEmployer + unemploymentEmployer),
    socialEmployer: round2(socialEmployer),
    unemploymentEmployer: round2(unemploymentEmployer),
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
