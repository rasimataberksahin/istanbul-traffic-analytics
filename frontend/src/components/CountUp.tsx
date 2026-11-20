"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";

const noSubscribe = () => () => {};

interface NumberToken {
  start: number;
  end: number;
  value: number;
  decimals: number;
  grouped: boolean;
}

/** The first number in a formatted value ("54,3 km/sa", "12.847", "%4,0"), read in the page's locale. */
export function findNumber(text: string, locale: "tr" | "en"): NumberToken | null {
  // Times, date ranges and years are labels, not quantities.
  if (/\d:\d/.test(text) || /\d[-–]\d/.test(text)) {
    return null;
  }
  const [group, decimal] = locale === "en" ? [",", "."] : [".", ","];
  const g = `\\${group}`;
  const d = `\\${decimal}`;
  const pattern = new RegExp(`\\d{1,3}(?:${g}\\d{3})+(?:${d}\\d+)?|\\d+(?:${d}\\d+)?`);
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const token = match[0];
  const grouped = token.includes(group);
  const [whole = "0", fraction = ""] = token.split(decimal);
  const value = Number(`${whole.split(group).join("")}.${fraction || "0"}`);
  if (!Number.isFinite(value) || (!grouped && !fraction && value >= 1900 && value <= 2100)) {
    return null;
  }
  return { start: match.index, end: match.index + token.length, value, decimals: fraction.length, grouped };
}

const DURATION_MS = 900;
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A formatted number that rolls up to its value when it comes into view, and rolls from the old
 * value to the new one when a filter changes it. The server renders the final text; numbers the
 * reader has already seen on first load are left alone, and reduced motion turns it off.
 */
export function CountUp({ text }: { text: string }) {
  const { locale } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  // True only while hydrating server HTML; a page reached by client navigation renders false.
  const hydrating = useSyncExternalStore(noSubscribe, () => false, () => true);
  const fromServer = useRef(hydrating);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const node = element?.firstChild;
    const token = findNumber(text, locale);
    if (!element || !node || node.nodeType !== Node.TEXT_NODE || !token) {
      shown.current = token?.value ?? null;
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = shown.current;
    shown.current = token.value;
    if (reduced || from === token.value) {
      return;
    }

    const format = new Intl.NumberFormat(locale === "en" ? "en-GB" : "tr-TR", {
      minimumFractionDigits: token.decimals,
      maximumFractionDigits: token.decimals,
      useGrouping: token.grouped,
    });
    const render = (value: number) => {
      node.nodeValue = text.slice(0, token.start) + format.format(value) + text.slice(token.end);
    };

    const rect = element.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.top < window.innerHeight;
    if (from === null && fromServer.current && inView) {
      // Already painted by the server on first load: rolling it back to zero would flicker.
      return;
    }

    const start = from ?? 0;
    let frame = 0;
    const run = () => {
      const began = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - began) / DURATION_MS);
        render(start + (token.value - start) * easeOut(progress));
        if (progress < 1) {
          frame = requestAnimationFrame(step);
        } else {
          node.nodeValue = text;
        }
      };
      frame = requestAnimationFrame(step);
    };

    render(start);
    if (inView) {
      run();
      // Only stop the frames: React has already written the next value into the node.
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text, locale]);

  return (
    <span className="count-up" ref={ref}>
      {text}
    </span>
  );
}
