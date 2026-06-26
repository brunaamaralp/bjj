import React, { useEffect, useState } from 'react';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalProfile } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';
import { maskPhone, maskCPF } from '../../lib/masks';

const FIELDS = [
  ['name', 'Nome'],
  ['email', 'E-mail'],
  ['phone', 'Telefone'],
  ['type', 'Perfil'],
  ['turma', 'Turma'],
  ['belt', 'Graduação'],
  ['plan', 'Plano'],
  ['birthDate', 'Nascimento'],
  ['responsavel', 'Responsável'],
  ['enrollmentDate', 'Ingresso'],
];

function displayValue(key, value) {
  if (!value) return '—';
  if (key === 'phone') return maskPhone(String(value)) || '—';
  if (key === 'cpf') return maskCPF(String(value)) || '—';
  return String(value);
}

export default function PortalProfile() {
  const { activeStudentId } = usePortal();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchPortalProfile(activeStudentId);
        if (!cancelled) {
          setStudent(res.student || null);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStudentId]);

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Perfil</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="portal-card__muted">Carregando…</p> : null}

      {!loading && student ? (
        <div className="portal-card">
          {FIELDS.map(([key, label]) => (
            <div key={key} className="portal-list-item">
              <span className="portal-card__muted">{label}</span>
              <span>{displayValue(key, student[key])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
