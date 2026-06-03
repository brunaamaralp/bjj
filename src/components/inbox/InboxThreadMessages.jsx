import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import InboxThreadBlock from './InboxThreadBlock.jsx';
import {
  estimateInboxThreadBlockHeight,
  findThreadBlockIndexForMsgKey,
  threadBlockReactKey,
} from '../../lib/inboxThreadRows.js';
import { INBOX_THREAD_VIRTUALIZE_THRESHOLD } from '../../lib/inboxUiConstants.js';

const InboxThreadMessages = forwardRef(function InboxThreadMessages(props, ref) {
  const { threadBlocks, expandedMsgs, scrollElementRef, ...blockCtx } = props;
  const blocks = Array.isArray(threadBlocks) ? threadBlocks : [];
  const shouldVirtualize = blocks.length > INBOX_THREAD_VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? blocks.length : 0,
    getScrollElement: () => scrollElementRef?.current ?? null,
    estimateSize: (index) => estimateInboxThreadBlockHeight(blocks[index], expandedMsgs),
    overscan: 10,
    getItemKey: (index) => threadBlockReactKey(blocks[index], index),
  });

  useEffect(() => {
    if (!shouldVirtualize) return;
    virtualizer.measure();
  }, [expandedMsgs, blocks.length, shouldVirtualize]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToMsgKey(msgKey) {
        const key = String(msgKey || '').trim();
        if (!key) return;
        const idx = findThreadBlockIndexForMsgKey(blocks, key);
        const el = scrollElementRef?.current;
        if (idx >= 0 && shouldVirtualize) {
          virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
          return;
        }
        if (!el) return;
        try {
          const nodes = el.querySelectorAll('[data-msgkey]');
          for (const node of nodes) {
            if (String(node?.dataset?.msgkey || '') === key) {
              node.scrollIntoView({ block: 'center', behavior: 'smooth' });
              break;
            }
          }
        } catch {
          void 0;
        }
      },
    }),
    [blocks, shouldVirtualize, virtualizer, scrollElementRef]
  );

  if (!blocks.length) return null;

  if (!shouldVirtualize) {
    return blocks.map((b, i) => (
      <InboxThreadBlock
        key={threadBlockReactKey(b, i)}
        block={b}
        expandedMsgs={expandedMsgs}
        {...blockCtx}
      />
    ));
  }

  return (
    <div
      className="inbox-thread-messages-virtual"
      style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
    >
      {virtualizer.getVirtualItems().map((vRow) => {
        const b = blocks[vRow.index];
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            className="inbox-thread-messages-virtual__row"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }}
          >
            <InboxThreadBlock block={b} expandedMsgs={expandedMsgs} {...blockCtx} />
          </div>
        );
      })}
    </div>
  );
});

export default InboxThreadMessages;
