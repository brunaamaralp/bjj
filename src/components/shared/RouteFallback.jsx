import '../../styles/route-fallback.css';
import React from 'react';

/** Fallback de rota lazy: barra fina no topo (não é o loader de sessão). */
export default function RouteFallback() {
  return (
    <div className="navi-route-fallback" role="status" aria-live="polite" aria-label="Carregando página">
      <div className="navi-route-fallback__bar" aria-hidden />
    </div>
  );
}
