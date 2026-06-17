import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InboxTriageCard from '../components/inbox/InboxTriageCard.jsx';

describe('InboxTriageCard', () => {
  it('Confirmar não propaga clique para o card pai', () => {
    const onConfirm = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div role="button" tabIndex={0} onClick={onParentClick} onKeyDown={() => {}}>
        <InboxTriageCard compact onConfirm={onConfirm} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('Vincular aluno não propaga clique para o card pai', () => {
    const onLinkStudent = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div role="button" tabIndex={0} onClick={onParentClick} onKeyDown={() => {}}>
        <InboxTriageCard compact studentLabel="Aluno" onLinkStudent={onLinkStudent} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /Vincular aluno/i }));

    expect(onLinkStudent).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
