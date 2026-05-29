import React from 'react';

export default function InboxMediaTempLinkBadge() {
  return (
    <span
      className="inbox-media-temp-badge"
      title="Esta mídia usa um link temporário e pode expirar. Novas mídias são armazenadas permanentemente."
    >
      ⚠️ Link temporário
    </span>
  );
}
