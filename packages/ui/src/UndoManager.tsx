import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type UndoEntry = {
  label: string;
  undo: () => void;
};

type UndoContextValue = {
  /** Push an undoable action onto the stack. */
  pushAction: (label: string, undoFn: () => void) => void;
  /** Undo the most recent action. Returns true if an action was undone. */
  undo: () => boolean;
  /** Whether there are actions to undo. */
  canUndo: boolean;
};

const UndoContext = createContext<UndoContextValue | null>(null);

const MAX_STACK_DEPTH = 5;
const TOAST_DURATION_MS = 2000;

type UndoProviderProps = {
  children: ReactNode;
};

/**
 * Context provider that manages an undo stack (last 5 actions).
 * Renders a brief toast notification when undo is triggered.
 */
export function UndoProvider({ children }: UndoProviderProps) {
  const stackRef = useRef<UndoEntry[]>([]);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Force re-render for canUndo
  const [stackSize, setStackSize] = useState(0);

  const pushAction = useCallback((label: string, undoFn: () => void) => {
    stackRef.current = [...stackRef.current.slice(-(MAX_STACK_DEPTH - 1)), { label, undo: undoFn }];
    setStackSize(stackRef.current.length);
  }, []);

  const showToast = useCallback((text: string) => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setToastText(text);
    toastTimerRef.current = setTimeout(() => {
      setToastText(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const undo = useCallback((): boolean => {
    const entry = stackRef.current.pop();
    if (!entry) return false;

    setStackSize(stackRef.current.length);
    entry.undo();
    showToast(`Action undone: ${entry.label}`);
    return true;
  }, [showToast]);

  // Listen for Ctrl+Z / Cmd+Z globally
  const undoRef = useRef(undo);
  undoRef.current = undo;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const contextValue: UndoContextValue = {
    pushAction,
    undo,
    canUndo: stackSize > 0,
  };

  return (
    <UndoContext.Provider value={contextValue}>
      {children}
      {toastText ? (
        <div className="undo-toast" role="status" aria-live="assertive">
          {toastText}
        </div>
      ) : null}
    </UndoContext.Provider>
  );
}

/**
 * Hook to access the undo manager.
 */
export function useUndo(): UndoContextValue {
  const value = useContext(UndoContext);
  if (value === null) {
    throw new Error("useUndo must be used within an UndoProvider");
  }
  return value;
}
