"use client";

import { ArrowRight, ArrowUp, Compass, Desktop, FileText, MagnifyingGlass, Moon, Sun, Translate } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Locale, Theme } from "@/lib/i18n/locale";
import { requestLocale, saveTheme } from "@/lib/preferences";
import { PAGES, rankMatches, SECTIONS } from "@/lib/sitemap";

interface Command {
  id: string;
  group: "pages" | "sections" | "actions";
  title: string;
  extra: string;
  hint?: string;
  icon: ReactNode;
  action: { kind: "go"; href: string } | { kind: "theme"; theme: Theme } | { kind: "locale"; locale: Locale } | { kind: "top" };
}

/** Fired on window to open the palette from a button elsewhere on the page. */
export const OPEN_PALETTE_EVENT = "itr:palette";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Jump to any page or report section, or change the theme and language, from the keyboard:
 * Ctrl+K (⌘K on a Mac) or "/" opens it, arrows move, Enter goes, Escape closes.
 */
export function CommandPalette() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const show = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
      dialog.querySelector("input")?.focus();
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (combo || (event.key === "/" && !isTyping(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault();
        if (dialogRef.current?.open) {
          close();
        } else {
          show();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, [close, show]);

  const commands = useMemo<Command[]>(() => {
    const name = (entry: { tr: string; en: string }) => (locale === "en" ? entry.en : entry.tr);
    const pages: Command[] = PAGES.map((page) => ({
      id: `page:${page.href}`,
      group: "pages",
      title: name(page),
      extra: `${page.tr} ${page.en} ${page.keywords ?? ""}`,
      icon: <Compass aria-hidden="true" size={17} />,
      action: { kind: "go", href: page.href },
    }));
    const sections: Command[] = SECTIONS.map((section) => ({
      id: `section:${section.href}`,
      group: "sections",
      title: name(section),
      extra: `${section.tr} ${section.en} ${section.page ? `${section.page.tr} ${section.page.en}` : ""} ${section.keywords ?? ""}`,
      hint: section.page ? name(section.page) : undefined,
      icon: <FileText aria-hidden="true" size={17} />,
      action: { kind: "go", href: section.href },
    }));
    const theme = (value: Theme, title: string, icon: ReactNode): Command => ({
      id: `theme:${value}`,
      group: "actions",
      title,
      extra: "tema theme renk color görünüm appearance",
      icon,
      action: { kind: "theme", theme: value },
    });
    const actions: Command[] = [
      theme("light", t("Açık tema", "Light theme"), <Sun aria-hidden="true" size={17} />),
      theme("dark", t("Koyu tema", "Dark theme"), <Moon aria-hidden="true" size={17} />),
      theme("system", t("Sistem teması", "System theme"), <Desktop aria-hidden="true" size={17} />),
      {
        id: "locale",
        group: "actions",
        title: locale === "en" ? "Türkçe'ye geç" : "Switch to English",
        extra: "dil language türkçe english ingilizce turkish",
        icon: <Translate aria-hidden="true" size={17} />,
        action: { kind: "locale", locale: locale === "en" ? "tr" : "en" },
      },
      {
        id: "top",
        group: "actions",
        title: t("Sayfanın başına dön", "Back to the top"),
        extra: "yukarı up top baş",
        icon: <ArrowUp aria-hidden="true" size={17} />,
        action: { kind: "top" },
      },
    ];
    return [...pages, ...sections, ...actions];
  }, [locale, t]);

  function run(command: Command | undefined) {
    if (!command) {
      return;
    }
    close();
    const { action } = command;
    if (action.kind === "go") {
      router.push(action.href);
    } else if (action.kind === "theme") {
      saveTheme(action.theme);
    } else if (action.kind === "locale") {
      requestLocale(action.locale);
    } else {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
  }

  const results = useMemo(() => rankMatches(query, commands), [commands, query]);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, results]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[current]);
    }
  };

  const groups: { key: Command["group"]; label: string }[] = [
    { key: "pages", label: t("Sayfalar", "Pages") },
    { key: "sections", label: t("Bölümler", "Sections") },
    { key: "actions", label: t("Ayarlar", "Settings") },
  ];
  // Commands are listed group by group, so an empty query shows them grouped under headings.
  const ordered = results;
  const activeId = ordered[current] ? `${listId}-${current}` : undefined;

  return (
    <dialog
      aria-label={t("Hızlı geçiş", "Quick jump")}
      className="palette"
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      ref={dialogRef}
    >
      <div className="palette-panel">
        <div className="palette-search">
          <MagnifyingGlass aria-hidden="true" size={18} />
          <input
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded="true"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("Sayfa, bölüm ya da ayar ara...", "Search pages, sections or settings...")}
            role="combobox"
            spellCheck={false}
            value={query}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id={listId} ref={listRef} role="listbox">
          {ordered.length === 0 ? (
            <li className="palette-empty" role="presentation">
              {t(`"${query.trim()}" için sonuç yok.`, `No results for "${query.trim()}".`)}
            </li>
          ) : (
            ordered.map((command, index) => {
              const previous = ordered[index - 1];
              const heading = !query.trim() && (!previous || previous.group !== command.group);
              return (
                <li key={command.id} role="presentation">
                  {heading ? (
                    <div aria-hidden="true" className="palette-group">
                      {groups.find((group) => group.key === command.group)?.label}
                    </div>
                  ) : null}
                  <div
                    aria-selected={index === current}
                    className="palette-item"
                    data-index={index}
                    id={`${listId}-${index}`}
                    onClick={() => run(command)}
                    onPointerMove={() => {
                      if (index !== current) {
                        setActive(index);
                      }
                    }}
                    role="option"
                  >
                    <span className="palette-icon">{command.icon}</span>
                    <span className="palette-title">{command.title}</span>
                    {command.hint ? <span className="palette-hint">{command.hint}</span> : null}
                    <ArrowRight aria-hidden="true" className="palette-go" size={15} />
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div aria-hidden="true" className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("seç", "move")}
          </span>
          <span>
            <kbd>Enter</kbd> {t("git", "go")}
          </span>
          <span>
            <kbd>/</kbd> {t("ya da", "or")} <kbd>Ctrl K</kbd> {t("aç", "open")}
          </span>
        </div>
      </div>
    </dialog>
  );
}

/** The header's search button: opens the palette and shows the shortcut. */
export function PaletteButton() {
  const { t } = useI18n();
  return (
    <button
      aria-keyshortcuts="Control+K /"
      className="palette-button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      title={t("Hızlı geçiş (Ctrl K)", "Quick jump (Ctrl K)")}
      type="button"
    >
      <MagnifyingGlass aria-hidden="true" size={15} />
      <span className="palette-button-label">{t("Ara", "Search")}</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}
