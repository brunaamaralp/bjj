/**
 * Parser client-side de extrato Excel (.xlsx / .xls).
 */
import { parseRowsToBankItems, pickColumn, DATE_KEYS, DESC_KEYS, AMOUNT_KEYS } from './bankStatementParse.js';

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ items: object[], mapping?: object, error?: string }>}
 */
export async function parseXlsxBankStatement(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return { items: [], error: 'arquivo_vazio' };
  }

  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return { items: [], error: 'planilha_vazia' };

    const ws = wb.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows = Array.isArray(jsonRows) ? jsonRows : [];
    if (!rows.length) return { items: [], error: 'nenhuma_linha' };

    const headers = Object.keys(rows[0] || {}).map((h) => String(h).trim()).filter(Boolean);
    const dateCol = pickColumn(headers, DATE_KEYS);
    const descCol = pickColumn(headers, DESC_KEYS);
    const amountCol = pickColumn(headers, AMOUNT_KEYS);

    if (!dateCol || !amountCol) {
      return {
        items: [],
        error: 'colunas_nao_detectadas',
        headers,
        rows: rows.slice(0, 200),
      };
    }

    const items = parseRowsToBankItems(rows, dateCol, descCol || headers[1] || headers[0], amountCol);
    return {
      items,
      mapping: { dateCol, descCol: descCol || headers[1], amountCol, sheetName },
      headers,
      rows: rows.slice(0, 200),
    };
  } catch {
    return { items: [], error: 'xlsx_invalido' };
  }
}

/**
 * @param {File} file
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * @param {File} file
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * @param {File} file
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

export function detectSourceFormat(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 'ofx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.csv')) return 'csv';
  return 'csv';
}

export const MAX_BANK_STATEMENT_ITEMS = 500;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
