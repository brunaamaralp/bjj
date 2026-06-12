import React from 'react';

export default function InboxPageLayout({
  isMobile,
  selectedPhone,
  listPanel,
  threadPanel,
  contextPanel,
  contextPanelVisible,
  listWidth,
  startResize,
  onListResizeKeyDown,
  setListWidth,
}) {
  if (isMobile) {
    return (
      <div className="inbox-mobile-split">
        <div
          className="inbox-mobile-list-slot"
          style={{ display: selectedPhone ? 'none' : 'flex' }}
          inert={selectedPhone ? true : undefined}
        >
          {listPanel}
        </div>
        <div
          className="inbox-mobile-thread-slot"
          style={{ display: selectedPhone ? 'flex' : 'none' }}
          inert={!selectedPhone ? true : undefined}
        >
          {threadPanel}
        </div>
      </div>
    );
  }

  return (
    <div
      className="inbox-layout-grid"
      style={{
        gridTemplateColumns: contextPanelVisible
          ? `${listWidth}px 10px minmax(0, 1.3fr) minmax(280px, 320px)`
          : `${listWidth}px 10px minmax(0, 1fr)`,
      }}
    >
      <div className="inbox-layout-list-col">{listPanel}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura da lista de conversas"
        aria-valuemin={300}
        aria-valuemax={480}
        aria-valuenow={listWidth}
        tabIndex={0}
        onMouseDown={startResize}
        onKeyDown={onListResizeKeyDown}
        onDoubleClick={() => setListWidth(420)}
        className="inbox-layout-resize-handle"
        title="Arraste ou use as setas para ajustar a largura"
      >
        <div className="inbox-layout-resize-handle__bar" />
      </div>
      <div
        className={
          contextPanelVisible
            ? 'inbox-layout-thread-col inbox-layout-thread-col--with-context'
            : 'inbox-layout-thread-col'
        }
      >
        {threadPanel}
      </div>
      {contextPanelVisible ? <div className="inbox-layout-context-col">{contextPanel}</div> : null}
    </div>
  );
}
