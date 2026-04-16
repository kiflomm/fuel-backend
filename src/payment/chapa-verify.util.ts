export type ChapaVerifyResponse = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
};

export type ChapaVerifiedFields = {
  txRef?: string;
  amount?: string;
  currency?: string;
  status?: string;
  rawData?: Record<string, unknown>;
};

export function isChapaVerifySuccess(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const r = response as Record<string, unknown>;
  const top = String(r.status ?? '').toLowerCase() === 'success';
  const data = r.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const inner = String(d.status ?? '').toLowerCase() === 'success';
    return inner || top;
  }
  return top;
}

export function extractChapaVerifiedFields(response: unknown): ChapaVerifiedFields {
  if (!response || typeof response !== 'object') return {};
  const r = response as Record<string, unknown>;
  const data = r.data;
  if (!data || typeof data !== 'object') return {};

  const d = data as Record<string, unknown>;
  const txRef =
    (typeof d.tx_ref === 'string' && d.tx_ref) ||
    (typeof d.trx_ref === 'string' && d.trx_ref) ||
    undefined;
  const amount = typeof d.amount === 'string' ? d.amount : undefined;
  const currency = typeof d.currency === 'string' ? d.currency : undefined;
  const status = typeof d.status === 'string' ? d.status : undefined;

  return { txRef, amount, currency, status, rawData: d };
}

export function normalizeMoney2(value: unknown): string | null {
  if (value == null) return null;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

