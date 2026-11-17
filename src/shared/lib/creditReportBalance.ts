type CreditBalance = {
  balance?: number | string | null;
  remaining?: number | string | null;
  principal?: number | string | null;
};

export function creditReportBalance(credit: CreditBalance): number {
  // Zero is an authoritative settled balance, not a missing value.
  const value = Number(credit.balance ?? credit.remaining ?? credit.principal ?? 0);
  if (!Number.isFinite(value)) throw new Error('Invalid credit report balance');
  return value;
}
