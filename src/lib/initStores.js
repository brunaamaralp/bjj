import { useLeadStore } from '../store/useLeadStore.js';
import { useStudentStore } from '../store/useStudentStore.js';
import { useAccountingStore } from '../store/useAccountingStore.js';
import { syncAcademyContext } from './academyContext.js';

let initialized = false;

/**
 * Liga stores que não podem importar um ao outro (evita ciclo ESM / TDZ).
 * Chamar uma única vez em main.jsx antes do render.
 */
export function initStores() {
  if (initialized) return;
  initialized = true;

  const syncFromLead = () => syncAcademyContext(useLeadStore.getState());

  syncFromLead();
  useLeadStore.persist?.onFinishHydration?.(syncFromLead);

  let prevAcademyId = useLeadStore.getState().academyId;

  useLeadStore.subscribe((state) => {
    syncFromLead();

    const id = state.academyId;
    if (id === prevAcademyId) return;
    prevAcademyId = id;

    useStudentStore.getState().resetForAcademyChange();

    if (id) {
      const load = useAccountingStore.getState().loadByAcademy;
      if (typeof load === 'function') load(id);
    }
  });
}
