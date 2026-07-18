import { formatDateInput } from "../../services/date.js";

export const currentBusinessDate = formatDateInput(new Date());
export const currentBusinessYear = currentBusinessDate.slice(0, 4);
export const currentBusinessQuarter = Math.floor(new Date().getMonth() / 3) + 1;
export const baseCreditDate = currentBusinessDate;
export const baseDeliveryDate = currentBusinessDate;
export const baseCashBalance = 0;
export const baseFinanceDate = currentBusinessDate;
export const dayInMs = 24 * 60 * 60 * 1000;
