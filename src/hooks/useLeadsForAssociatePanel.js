import { useLeadStore } from '../store/useLeadStore';

const EMPTY_LEADS = [];

/**
 * Assina o array completo de leads só quando o painel "Associar lead" está aberto.
 */
export function useLeadsForAssociatePanel(leadPanel) {
  return useLeadStore((s) => (leadPanel === 'associate' ? s.leads : EMPTY_LEADS));
}
