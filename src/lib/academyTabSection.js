import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Navegação ?tab=&section= em Minha Academia.
 * @param {string} tabId
 * @param {string} defaultSection
 * @param {(raw: string | null) => string | null} resolveSection
 */
export function useAcademyTabSection(tabId, defaultSection, resolveSection) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('section');
  const section = resolveSection(raw) || defaultSection;

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab !== tabId) return;
    const resolved = resolveSection(searchParams.get('section'));
    if (!resolved) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', tabId);
          next.set('section', defaultSection);
          return next;
        },
        { replace: true }
      );
    }
  }, [tabId, defaultSection, resolveSection, searchParams, setSearchParams]);

  const goSection = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tabId);
        next.set('section', id);
        return next;
      },
      { replace: false }
    );
  };

  return { section, goSection };
}
