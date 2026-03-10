import React from "react";
import { Icon } from "./Icons";

interface OverlayTriggerStripProps {
  activeOverlay: string | null;
  onToggleOverlay: (overlayId: string) => void;
  notifications?: Record<string, boolean>;
}

const OVERLAY_TABS = [
  { id: "oracle", label: "Oracle", iconName: "oracle", shortcutKey: "O" },
  { id: "world", label: "World", iconName: "world", shortcutKey: "W" },
  { id: "stores", label: "Stores", iconName: "stores", shortcutKey: "S" },
  { id: "priests", label: "Priests", iconName: "priests", shortcutKey: "P" },
  { id: "espionage", label: "Espionage", iconName: "espionage", shortcutKey: "E" },
  { id: "record", label: "Record", iconName: "record", shortcutKey: "R" },
  { id: "legacy", label: "Legacy", iconName: "legacy", shortcutKey: "L" },
  { id: "lineage", label: "Lineage", iconName: "lineage", shortcutKey: "I" },
  { id: "city", label: "City", iconName: "temple", shortcutKey: "C" },
  { id: "research", label: "Research", iconName: "scrolls", shortcutKey: "T" },
  { id: "progress", label: "Progress", iconName: "legacy", shortcutKey: "G" },
] as const;

export function OverlayTriggerStrip({
  activeOverlay,
  onToggleOverlay,
  notifications,
}: OverlayTriggerStripProps) {
  return (
    <aside className="overlay-trigger-bar">
      {OVERLAY_TABS.map((tab) => (
        <button
          key={tab.id}
          id={`trigger-${tab.id}`}
          className={`trigger-strip-button${activeOverlay === tab.id ? " active" : ""}`}
          title={`${tab.label} (${tab.shortcutKey})`}
          aria-label={`${tab.label} overlay (${tab.shortcutKey})`}
          aria-pressed={activeOverlay === tab.id}
          onClick={() => onToggleOverlay(tab.id)}
          type="button"
        >
          <Icon name={tab.iconName} size={16} />
          <span>{tab.label}</span>
          <kbd className="trigger-strip-kbd">{tab.shortcutKey}</kbd>
          {notifications?.[tab.id] ? <span className="trigger-strip-dot" /> : null}
        </button>
      ))}
    </aside>
  );
}
