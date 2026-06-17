import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Exibe data/hora da última sync ou mensagem padrão. */
export function formatControlIdLastSync(iso) {
  const s = String(iso || '').trim();
  if (!s) return 'Nunca sincronizado';
  try {
    return format(parseISO(s), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return s;
  }
}

const IGNORE_REASON_COPY = {
  cooldown: 'Entrada ignorada — intervalo mínimo entre presenças',
  overdue: 'Entrada ignorada — aluno inadimplente',
};

export function controlIdIgnoreReasonLabel(reason) {
  return IGNORE_REASON_COPY[String(reason || '').trim()] || 'Entrada ignorada';
}
