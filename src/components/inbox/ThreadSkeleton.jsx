import React from 'react';

export default function ThreadSkeleton() {
  return (
    <div style={{ padding: 12 }}>
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <div key={`chat-skeleton-${idx}`} className={`inbox-chat-skeleton ${idx % 2 === 0 ? 'left' : 'right'}`} />
      ))}
    </div>
  );
}
