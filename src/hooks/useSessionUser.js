import { useEffect, useState } from 'react';
import { authService } from '../lib/auth';
import { firstNameFromUser } from '../lib/userDisplayName.js';

/**
 * Nome do usuário logado (primeiro nome) para saudação na recepção.
 */
export function useSessionUser() {
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!cancelled) setFirstName(firstNameFromUser(user));
      } catch {
        if (!cancelled) setFirstName('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { firstName, loading };
}
