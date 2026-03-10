export const FEATURES = {
  sales: String(import.meta.env.VITE_ENABLE_SALES || '').toLowerCase() === 'true',
  inventory: String(import.meta.env.VITE_ENABLE_INVENTORY || '').toLowerCase() === 'true',
  finance: String(import.meta.env.VITE_ENABLE_FINANCE || '').toLowerCase() === 'true',
};
