export function fmt(n) {
  try {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    const v = Number(n || 0);
    return `R$ ${v.toFixed(2)}`.replace('.', ',');
  }
}
