"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Marks the filter bar with `is-stuck` once it pins under the header, so it can shrink to one
 * slim row and cover less of the charts. The space it gives up is added to its bottom margin,
 * so the content below never jumps when it shrinks or grows back.
 */
export function StickyFilters() {
  const pathname = usePathname();

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".filters");
    if (!bar) {
      return;
    }
    let frame = 0;
    let fullHeight = 0;
    let baseMargin = 0;

    const reset = () => {
      bar.classList.remove("is-stuck");
      bar.style.marginBottom = "";
    };

    const update = () => {
      frame = 0;
      const style = getComputedStyle(bar);
      if (style.position !== "sticky") {
        reset();
        return;
      }
      const top = parseFloat(style.top) || 0;
      const stuck = bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0;
      if (stuck === bar.classList.contains("is-stuck")) {
        return;
      }
      if (stuck) {
        fullHeight = bar.offsetHeight;
        baseMargin = parseFloat(style.marginBottom) || 0;
        bar.classList.add("is-stuck");
        bar.style.marginBottom = `${baseMargin + Math.max(0, fullHeight - bar.offsetHeight)}px`;
      } else {
        reset();
      }
    };

    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    const onResize = () => {
      reset();
      schedule();
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      reset();
    };
  }, [pathname]);

  return null;
}
