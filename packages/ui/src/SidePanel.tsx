import React, { useEffect } from "react";
import { Icon } from "./Icons";

type SidePanelProps = {
  title: string;
  onClose: () => void;
  onExpand?: () => void;
  children: React.ReactNode;
};

export function SidePanel({ title, onClose, onExpand, children }: SidePanelProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside className="side-panel" role="complementary" aria-label={title}>
      <div className="side-panel-header">
        <h2 className="side-panel-title">{title}</h2>
        <div className="side-panel-actions">
          {onExpand ? (
            <button
              className="side-panel-btn"
              onClick={onExpand}
              type="button"
              aria-label="Expand to full view"
              title="Expand"
            >
              <Icon name="arrow_up" size={14} />
            </button>
          ) : null}
          <button
            className="side-panel-btn"
            onClick={onClose}
            type="button"
            aria-label="Close panel"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
      <div className="side-panel-content">
        {children}
      </div>
    </aside>
  );
}
