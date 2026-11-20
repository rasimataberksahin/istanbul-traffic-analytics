"use client";

import { useEffect } from "react";

/**
 * Marks the filter bar with `is-stuck` once it pins under the header, so it can shrink to one
 * slim row and cover less of the charts. The space it gives up is added to its bottom margin,
 * so the content below never jumps when it shrinks or grows back.
 *
 * The bar is looked up on every check rather than once: after a client navigation the loading
 * skeleton is on screen first and the real bar arrives a moment later, often after the browser
 * has already jumped to a #section further down.
 */
export function StickyFilters() {
  useEffect(() => {
    let frame = 0;
    let bar: HTMLElement | null = null;

    const reset = (element: HTMLElement | null) => {
      element?.classList.remove("is-stuck");
      element?.style.removeProperty("margin-bottom");
    };

    const update = () => {
      frame = 0;
      const current = document.querySelector<HTMLElement>(".filters");
      if (current !== bar) {
        reset(bar);
        bar = current;
      }
      if (!bar) {
        return;
      }
      const style = getComputedStyle(bar);
      if (style.position !== "sticky") {
        reset(bar);
        return;
      }
      const top = parseFloat(style.top) || 0;
      const stuck = bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0;
      if (stuck === bar.classList.contains("is-stuck")) {
        return;
      }
      if (stuck) {
        const fullHeight = bar.offsetHeight;
        const baseMargin = parseFloat(style.marginBottom) || 0;
        bar.classList.add("is-stuck");
        bar.style.marginBottom = `${baseMargin + Math.max(0, fullHeight - bar.offsetHeight)}px`;
      } else {
        reset(bar);
      }
    };

    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    const onResize = () => {
      reset(bar);
      schedule();
    };

    // New page content (the bar replacing the skeleton) is checked as soon as it lands.
    const observer = new MutationObserver(schedule);
    const main = document.getElementById("icerik");
    if (main) {
      observer.observe(main, { childList: true, subtree: true });
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      reset(bar);
    };
  }, []);

  return null;
}
