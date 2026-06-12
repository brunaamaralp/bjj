import React, { Suspense } from 'react';
import { lazyWithRetry } from '../../lib/lazyWithRetry.js';
import ThreadSkeleton from './ThreadSkeleton';
import InboxThreadEmpty from './InboxThreadEmpty.jsx';

const InboxThreadPanel = lazyWithRetry(() => import('./InboxThreadPanel'));

export default function InboxThreadSection({ selectedPhone, panelProps }) {
  if (!selectedPhone) {
    return <InboxThreadEmpty />;
  }

  return (
    <Suspense
      fallback={(
        <div className="inbox-thread-panel">
          <ThreadSkeleton />
        </div>
      )}
    >
      <InboxThreadPanel {...panelProps} />
    </Suspense>
  );
}
