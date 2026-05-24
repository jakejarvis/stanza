import { useRouter } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clearTimer(timer: React.RefObject<ReturnType<typeof setTimeout> | undefined>) {
  clearTimeout(timer.current);
}

function clearIntervalTimer(timer: React.RefObject<ReturnType<typeof setInterval> | undefined>) {
  clearInterval(timer.current);
}

export function NavigationProgress({ className }: { className?: string }) {
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const isNavigatingRef = useRef(false);
  const hasShownRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearTimers = useEffectEvent(() => {
    clearTimer(showTimerRef);
    clearIntervalTimer(trickleTimerRef);
    clearTimer(finishTimerRef);
    clearTimer(resetTimerRef);
    clearTimer(safetyTimerRef);
  });

  const start = useEffectEvent(() => {
    if (isNavigatingRef.current) return;

    isNavigatingRef.current = true;
    hasShownRef.current = false;
    clearTimers();

    // Defer the bar by 120ms so instant nav (cached routes, same-page anchor changes) doesn't flash a bar
    showTimerRef.current = setTimeout(() => {
      hasShownRef.current = true;
      setVisible(true);
      // Jump to 8% on first paint — a sliver of bar reads as "started" better than starting at zero
      setProgress(8);

      // Trickle every 200ms (5fps) — smooth enough visually, cheap on re-renders
      trickleTimerRef.current = setInterval(() => {
        setProgress((currentProgress) => {
          if (!isNavigatingRef.current) return currentProgress;

          // Ease toward 90: take 8% of the remaining distance each tick so it decelerates
          // as it approaches the ceiling. Floor at 0.5% so it always visibly moves.
          // Cap at 90 to leave headroom for the snap-to-100 on resolve.
          return clamp(currentProgress + Math.max(0.5, (90 - currentProgress) * 0.08), 0, 90);
        });
      }, 200);
    }, 120);

    // Safety net: if onResolved never fires (router error, stuck request), force-reset after 12s
    safetyTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
      hasShownRef.current = false;
      clearTimers();
      setVisible(false);
      setProgress(0);
    }, 12_000);
  });

  const done = useEffectEvent(() => {
    if (!isNavigatingRef.current) return;

    isNavigatingRef.current = false;
    clearTimers();

    if (!hasShownRef.current) {
      hasShownRef.current = false;
      setVisible(false);
      setProgress(0);
      return;
    }

    hasShownRef.current = false;
    setVisible(true);
    setProgress(100);

    // Hold at 100% for 200ms so the snap registers, then fade out (matches the opacity
    // transition duration below), then reset scale to 0 after another 200ms so the bar
    // doesn't visibly rewind from 100→0 while still fading.
    finishTimerRef.current = setTimeout(() => {
      setVisible(false);
      resetTimerRef.current = setTimeout(() => setProgress(0), 200);
    }, 200);
  });

  useEffect(() => {
    const unsubscribeBeforeLoad = router.subscribe("onBeforeLoad", (event) => {
      if (event.pathChanged) start();
    });
    const unsubscribeResolved = router.subscribe("onResolved", () => done());

    return () => {
      unsubscribeBeforeLoad();
      unsubscribeResolved();
    };
  }, [router]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[10000] h-0.5 transition-opacity duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full origin-left bg-primary shadow-[0_0_8px_var(--primary)] transition-transform duration-150 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${clamp(progress, 0, 100) / 100})` }}
      />
    </div>
  );
}
