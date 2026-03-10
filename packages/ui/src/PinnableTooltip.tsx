import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type PinnableTooltipProps = {
  /** The trigger element (wrapped in a span). */
  children: ReactNode;
  /** The tooltip content. */
  content: ReactNode;
  /** Preferred placement. Defaults to "bottom". */
  placement?: "bottom" | "right";
};

type PinnedEntry = {
  id: number;
};

const MAX_PINNED = 2;
let nextTooltipId = 1;

// Module-level tracking of pinned tooltips so we can enforce the global max.
const pinnedSet = new Set<number>();

/**
 * A tooltip that can be pinned in place by clicking.
 * - Hover: tooltip appears after 150ms delay
 * - Click while visible: pins the tooltip (up to 2 globally)
 * - Escape or clicking the pin icon dismisses
 * - Pinned tooltips have a gold-dim border
 */
export function PinnableTooltip({
  children,
  content,
  placement = "bottom",
}: PinnableTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipIdRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Show tooltip with delay on hover
  useEffect(() => {
    if (hovered && !pinned) {
      hoverTimerRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 150);
    } else if (!hovered && !pinned) {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setShowTooltip(false);
    }

    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [hovered, pinned]);

  // Keep tooltip showing while pinned
  useEffect(() => {
    if (pinned) {
      setShowTooltip(true);
    }
  }, [pinned]);

  // Handle escape to unpin
  useEffect(() => {
    if (!pinned) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        unpin();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pinned]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tooltipIdRef.current !== null) {
        pinnedSet.delete(tooltipIdRef.current);
      }
    };
  }, []);

  const handlePin = useCallback(() => {
    if (pinned) {
      unpin();
      return;
    }

    if (!showTooltip) return;

    // Check global limit
    if (pinnedSet.size >= MAX_PINNED) return;

    const id = nextTooltipId++;
    tooltipIdRef.current = id;
    pinnedSet.add(id);
    setPinned(true);
  }, [pinned, showTooltip]);

  function unpin() {
    if (tooltipIdRef.current !== null) {
      pinnedSet.delete(tooltipIdRef.current);
      tooltipIdRef.current = null;
    }
    setPinned(false);
    setShowTooltip(false);
  }

  const placementClass = placement === "right" ? "pinnable-tooltip-right" : "pinnable-tooltip-bottom";

  return (
    <span
      ref={triggerRef}
      className="pinnable-tooltip-trigger"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handlePin}
    >
      {children}
      {showTooltip ? (
        <div
          ref={tooltipRef}
          className={`pinnable-tooltip ${placementClass} ${pinned ? "pinned" : ""}`}
          role="tooltip"
        >
          <div className="pinnable-tooltip-content">
            {content}
          </div>
          {pinned ? (
            <button
              type="button"
              className="pinnable-tooltip-pin-btn"
              onClick={(e) => {
                e.stopPropagation();
                unpin();
              }}
              aria-label="Unpin tooltip"
              title="Unpin"
            >
              &#x1F4CC;
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
