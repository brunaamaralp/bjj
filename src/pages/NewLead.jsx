import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dispatchOpenNewLeadModal } from '../lib/newLeadModal.js';

/** Rota legada: abre o modal global e volta para a recepção. */
export default function NewLead() {
  const navigate = useNavigate();

  useEffect(() => {
    dispatchOpenNewLeadModal();
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}
