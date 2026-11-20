"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "done";

const START_EVENT = "itr:progress-start";
const DONE_EVENT = "itr:progress-done";

/** Shows the top bar while something the reader started is loading (a filter, a map click). */
export function useProgress(pending: boolean) {
  useEffect(() => {
    if (!pending) {
      return;
    }
    window.dispatchEvent(new Event(START_EVENT));
    return () => {
      window.dispatchEvent(new Event(DONE_EVENT));
    };
  }, [pending]);
}

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return false;
  }
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return false;
  }
  // A jump within the same page is not a load.
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/**
 * A thin bar under the header for page loads. The pages are rendered on the server and some take
 * a second, so a click should answer at once: the bar creeps forward until the new page arrives,
 * then fills and fades.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef(0);
  const location = `${pathname}?${searchParams.toString()}`;
  const [seen, setSeen] = useState(location);

  // The URL changed: whatever was loading has arrived.
  if (seen !== location) {
    setSeen(location);
    if (phase === "loading") {
      setPhase("done");
    }
  }

  useEffect(() => {
    const start = () => {
      window.clearTimeout(timer.current);
      setPhase("loading");
    };
    const done = () => setPhase((current) => (current === "loading" ? "done" : current));
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) {
        start();
      }
    };
    document.addEventListener("click", onClick);
    window.addEventListener(START_EVENT, start);
    window.addEventListener(DONE_EVENT, done);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(DONE_EVENT, done);
    };
  }, []);

  useEffect(() => {
    if (phase !== "done") {
      return;
    }
    timer.current = window.setTimeout(() => setPhase("idle"), 450);
    return () => window.clearTimeout(timer.current);
  }, [phase]);

  // A click that never navigates (a link to the current page with other params) must not hang.
  useEffect(() => {
    if (phase !== "loading") {
      return;
    }
    const giveUp = window.setTimeout(() => setPhase("done"), 15000);
    return () => window.clearTimeout(giveUp);
  }, [phase]);

  return <div aria-hidden="true" className="route-progress" data-phase={phase} />;
}
