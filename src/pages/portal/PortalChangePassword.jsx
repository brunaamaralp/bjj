import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { authService } from '../../lib/auth';
import { completePortalPasswordChange, fetchPortalContext } from '../../lib/portalApi';
import {
  resolveActiveStudentFromContext,
  setPortalActiveAcademyId,
  setPortalActiveStudentId,
} from '../../lib/portalSession';
import { friendlyError } from '../../lib/errorMessages';
import '../../styles/portal.css';

export default function PortalChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user) {
          navigate('/portal/login', { replace: true });
          return;
        }
        const ctx = await fetchPortalContext();
        const sid = resolveActiveStudentFromContext(ctx);
        const student = (ctx.students || []).find((s) => s.id === sid);
        if (!student?.must_change_password) {
          navigate('/portal', { replace: true });
          return;
        }
        if (!cancelled) {
          setStudentId(sid);
          setPortalActiveStudentId(sid);
          setPortalActiveAcademyId(ctx.academy_id);
        }
      } catch {
        if (!cancelled) navigate('/portal/login', { replace: true });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await authService.updatePassword(newPassword, currentPassword);
      if (studentId) await completePortalPasswordChange(studentId);
      navigate('/portal', { replace: true });
    } catch (err) {
      if (err?.code === 401 || err?.type === 'user_password_mismatch') {
        setError('Senha atual incorreta.');
      } else {
        setError(friendlyError(err, 'action'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="portal-auth-page">
        <p className="portal-card__muted">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="portal-auth-page">
      <div className="portal-auth-card">
        <h1 className="portal-auth-title">Trocar senha</h1>
        <p className="portal-auth-subtitle">
          Por segurança, defina uma nova senha antes de continuar.
        </p>
        {error ? (
          <p className="portal-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <div className="portal-field">
            <label htmlFor="portal-pw-current">Senha atual (temporária)</label>
            <div className="portal-field__password">
              <input
                id="portal-pw-current"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="portal-field__toggle"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="portal-field">
            <label htmlFor="portal-pw-new">Nova senha</label>
            <div className="portal-field__password">
              <input
                id="portal-pw-new"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="portal-field__toggle"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="portal-field">
            <label htmlFor="portal-pw-confirm">Confirmar nova senha</label>
            <input
              id="portal-pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="portal-btn portal-btn--primary portal-btn--block" disabled={loading}>
            <KeyRound size={18} aria-hidden />
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
