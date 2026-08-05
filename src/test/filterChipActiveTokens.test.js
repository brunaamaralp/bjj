import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('filter chip active tokens', () => {
  it('does not use accent green fill for .filter-chip.is-active', () => {
    const block = css.match(/\.filter-chip\.is-active\s*\{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/--color-accent|--accent(?!-)/);
    expect(block[0]).toMatch(/--filter-bg-active|--color-primary-surface/);
  });

  it('does not use accent green fill for .date-chip.active', () => {
    const block = css.match(/\.date-chip\.active\s*\{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/--color-accent/);
    expect(block[0]).toMatch(/--filter-bg-active|--color-primary-surface/);
  });
});
