import React, { useMemo } from 'react';

function inlineFormat(text) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m = re.exec(text);
  while (m) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`${m.index}-${m[1]}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function parseBlocks(raw) {
  const lines = String(raw || '').split('\n');
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: 'list', items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }
    flushList();
    if (trimmed) blocks.push({ type: 'p', text: trimmed });
  }
  flushList();
  return blocks;
}

/**
 * Renderiza markdown leve (parágrafos, listas, negrito) para respostas do assistente NL.
 */
export default function NlResponseMarkdown({ text, style }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  if (!blocks.length) return null;

  return (
    <div style={style}>
      {blocks.map((block, i) => {
        if (block.type === 'list') {
          return (
            <ul
              key={`list-${i}`}
              style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.55 }}
            >
              {block.items.map((item, j) => (
                <li key={j} style={{ marginBottom: 4 }}>
                  {inlineFormat(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${i}`} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>
            {inlineFormat(block.text)}
          </p>
        );
      })}
    </div>
  );
}
