import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentServiceControl from '../components/academy/AgentServiceControl.jsx';

describe('AgentServiceControl', () => {
  const baseProps = {
    promptConfigurado: true,
    canEditPrompt: true,
    iaAtiva: false,
    aiModuleEnabled: true,
    waConnected: true,
    togglingIa: false,
    panelOpen: false,
    onRequestActivate: vi.fn(),
    onRequestPause: vi.fn(),
  };

  it('calls onRequestActivate when activate clicked', async () => {
    const onRequestActivate = vi.fn();
    render(<AgentServiceControl {...baseProps} onRequestActivate={onRequestActivate} />);
    screen.getByRole('button', { name: /ativar atendimento automático/i }).click();
    expect(onRequestActivate).toHaveBeenCalledTimes(1);
  });

  it('renders activate button when configured and paused', () => {
    render(<AgentServiceControl {...baseProps} />);
    expect(screen.getByRole('button', { name: /ativar atendimento automático/i })).toBeInTheDocument();
  });

  it('does not render ia_ativa switch', () => {
    render(<AgentServiceControl {...baseProps} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('disables activate when IA module is off and omits redundant hint', () => {
    render(<AgentServiceControl {...baseProps} aiModuleEnabled={false} />);
    const btn = screen.getByRole('button', { name: /ativar atendimento automático/i });
    expect(btn).toBeDisabled();
    expect(screen.queryByText(/ative os recursos de ia/i)).not.toBeInTheDocument();
  });

  it('shows WA hint when disconnected', () => {
    render(<AgentServiceControl {...baseProps} waConnected={false} />);
    expect(screen.getByText(/conecte o whatsapp no card acima/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ativar atendimento automático/i })).toBeDisabled();
  });

  it('renders pause button when active', () => {
    render(<AgentServiceControl {...baseProps} iaAtiva />);
    expect(screen.getByRole('button', { name: /pausar atendimento automático/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ativar atendimento/i })).not.toBeInTheDocument();
  });

  it('hides controls when side panel is open', () => {
    render(<AgentServiceControl {...baseProps} panelOpen />);
    expect(screen.queryByRole('button', { name: /ativar atendimento/i })).not.toBeInTheDocument();
  });
});
