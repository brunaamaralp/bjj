import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Inbox search spacing', () => {
  it('reserva espaco suficiente entre o icone e o placeholder', () => {
    const filePath = path.resolve(__dirname, '../styles/inbox.css');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('.inbox-list-panel__search .navi-control');
    expect(source).toContain('padding: 7px 10px 7px 38px;');
  });
});
