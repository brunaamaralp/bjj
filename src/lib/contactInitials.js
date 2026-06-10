/** Iniciais para avatar de contato (até 2 palavras). */
export function contactInitials(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase() || '?'
  );
}
