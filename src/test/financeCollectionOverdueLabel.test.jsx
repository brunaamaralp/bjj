import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CollectionRulesSection from '../components/finance/CollectionRulesSection.jsx';
import { DEFAULT_COLLECTION_RULES } from '../lib/collectionRules.js';

describe('CollectionRulesSection — overdueLabel', () => {
  it('renderiza campo de etiqueta quando onOverdueLabelChange é fornecido', () => {
    const onChange = vi.fn();
    render(
      <CollectionRulesSection
        collectionRules={DEFAULT_COLLECTION_RULES}
        onRulesChange={() => {}}
        overdueLabel="Devedor"
        onOverdueLabelChange={onChange}
        embedded
      />
    );

    const input = screen.getByLabelText('Etiqueta de inadimplência');
    expect(input).toHaveValue('Devedor');

    fireEvent.change(input, { target: { value: 'Em atraso' } });
    expect(onChange).toHaveBeenCalledWith('Em atraso');
  });

  it('não renderiza campo sem onOverdueLabelChange', () => {
    render(
      <CollectionRulesSection
        collectionRules={DEFAULT_COLLECTION_RULES}
        onRulesChange={() => {}}
        embedded
      />
    );

    expect(screen.queryByLabelText('Etiqueta de inadimplência')).toBeNull();
  });
});
