import React, { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  duration?: number;
  /** Number of decimal places to show. Defaults to 0. */
  decimals?: number;
  className?: string;
};

/**
 * Displays a number that smoothly rolls between old and new values.
 * Briefly flashes green for increases, red for decreases.
 */
export function AnimatedNumber({
  value,
  duration = 400,
  decimals = 0,
  className,
}: AnimatedNumberProps) {
  const prevValueRef = useRef(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const [flashClass, setFlashClass] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prevValue = prevValueRef.current;
    prevValueRef.current = value;

    if (prevValue === value) return;

    // Determine flash direction
    if (value > prevValue) {
      setFlashClass("number-increase");
    } else {
      setFlashClass("number-decrease");
    }

    // Clear existing flash timer
    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = setTimeout(() => {
      setFlashClass(null);
      flashTimerRef.current = null;
    }, 300);

    // Cancel any in-progress animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || duration <= 0) {
      displayRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = displayRef.current;
    const delta = value - startValue;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + delta * eased;

      displayRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  // Cleanup flash timer on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const classes = [className, flashClass].filter(Boolean).join(" ") || undefined;

  return (
    <span className={classes} aria-live="polite">
      {displayValue.toFixed(decimals)}
    </span>
  );
}
