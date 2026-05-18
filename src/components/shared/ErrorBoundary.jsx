import React from 'react';
import { useNavigate } from 'react-router-dom';
import NaviLogo from '../NaviLogo.jsx';

function ErrorFallback({ onReset }) {
  const navigate = useNavigate();

  return (
    <div className="navi-error-fallback">
      <NaviLogo size={48} variant="white" />
      <h1 className="navi-error-fallback__title">Algo inesperado aconteceu.</h1>
      <p className="navi-error-fallback__sub">
        A equipe já foi notificada. Tente recarregar a página.
      </p>
      <div className="navi-error-fallback__actions">
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
        <button
          type="button"
          className="btn-outline navi-error-fallback__secondary"
          onClick={() => {
            onReset?.();
            navigate('/', { replace: true });
          }}
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}
