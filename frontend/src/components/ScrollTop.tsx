"use client";

import { ArrowUp } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** A round button that appears after a screen or two of scrolling and takes the reader back up. */
export function ScrollTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight * 1.5);
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <button
      aria-hidden={!visible}
      aria-label={t("Sayfanın başına dön", "Back to the top")}
      className="scroll-top"
      data-visible={visible || undefined}
      onClick={() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        document.getElementById("icerik")?.focus({ preventScroll: true });
      }}
      tabIndex={visible ? 0 : -1}
      title={t("Başa dön", "Back to top")}
      type="button"
    >
      <ArrowUp aria-hidden="true" size={18} weight="bold" />
    </button>
  );
}
