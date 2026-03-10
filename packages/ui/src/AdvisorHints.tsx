import React, { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "oracle-advisor-hints-dismissed";

type AdvisorHintDef = {
  id: string;
  text: string;
};

/**
 * Advisor hint definitions. Keep text short (1-2 sentences).
 */
export const ADVISOR_HINTS: Record<string, AdvisorHintDef> = {
  "first-consultation": {
    id: "first-consultation",
    text: "When an envoy arrives, craft a prophecy using word tiles. Balance clarity and risk for the best outcome.",
  },
  "first-resource-warning": {
    id: "first-resource-warning",
    text: "A resource is running low. Open the Stores panel to review production chains and trade offers.",
  },
  "first-envoy-arrival": {
    id: "first-envoy-arrival",
    text: "Factions send envoys seeking guidance. Your responses shape their trust and the temple's reputation.",
  },
  "first-building-placement": {
    id: "first-building-placement",
    text: "Place buildings from the toolbar below. Connect them with roads so priests and carriers can reach them.",
  },
};

function loadDismissedHints(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed as string[]);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveDismissedHint(hintId: string): void {
  const dismissed = loadDismissedHints();
  dismissed.add(hintId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook to check if an advisor hint should be shown and provide a dismiss function.
 */
export function useAdvisorHint(hintId: string): {
  shouldShow: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState(() => loadDismissedHints().has(hintId));

  const dismiss = useCallback(() => {
    saveDismissedHint(hintId);
    setDismissed(true);
  }, [hintId]);

  return {
    shouldShow: !dismissed && hintId in ADVISOR_HINTS,
    dismiss,
  };
}

type AdvisorHintBannerProps = {
  hintId: string;
  /** If false, the hint won't render even if not dismissed. Useful for conditional display. */
  active?: boolean;
};

/**
 * A small, non-intrusive banner that shows contextual guidance.
 * Blue left border, surface background, italic text, dismissible.
 */
export function AdvisorHintBanner({ hintId, active = true }: AdvisorHintBannerProps) {
  const { shouldShow, dismiss } = useAdvisorHint(hintId);
  const [visible, setVisible] = useState(false);

  // Delay appearance slightly so it doesn't flash on fast transitions
  useEffect(() => {
    if (shouldShow && active) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    return undefined;
  }, [shouldShow, active]);

  if (!visible) return null;

  const hint = ADVISOR_HINTS[hintId];
  if (!hint) return null;

  return (
    <div className="advisor-hint-banner" role="status" aria-live="polite">
      <span className="advisor-hint-text">{hint.text}</span>
      <button
        type="button"
        className="advisor-hint-dismiss"
        onClick={dismiss}
        aria-label="Dismiss hint"
        title="Don't show again"
      >
        &times;
      </button>
    </div>
  );
}
