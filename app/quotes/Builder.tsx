"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, RefreshCw, Info } from "lucide-react";
import { QuoteWidget } from "@/components/widgets/QuoteWidget";
import { parseBooleanParam, parseColorParam } from "@/lib/utils";
import {
  getQuotes,
  Quote,
  QUOTES_ADMIN_SECRET,
  QUOTE_STYLE_ORDER,
  QUOTE_STYLE_PRESETS,
  QUOTE_FONT_OPTIONS,
  QuoteStyleKey,
  QuoteFontKey,
} from "@/lib/quotes";

type ThemeKey = "dark" | "light";
type TransparentBgMode = "off" | "dark" | "light";
type CustomQuoteMode = "custom" | "database";
type QuoteThemeKey = "viora-gold";

type FancyOption = { value: string; label: string };

function FancySelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  dropdownClassName = "",
  buttonClassName = "flex w-full items-center justify-between rounded-lg border border-white/12 bg-white/10 px-3 py-2 text-sm text-white/90 shadow-[0_1px_0_rgba(255,255,255,0.08)] transition focus:border-white/40 focus:ring-2 focus:ring-white/15 focus:outline-none",
}: {
  value: string;
  onChange: (value: string) => void;
  options: FancyOption[];
  placeholder?: string;
  dropdownClassName?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={wrapperRef} className="relative">
      <button type="button" className={buttonClassName} onClick={() => setOpen((v) => !v)}>
        <span className="truncate">{current?.label ?? placeholder}</span>
        <span className="ml-2 text-xs text-white/60">▾</span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-20 mt-2 w-fit overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur ${dropdownClassName}`}
        >
          <div className="max-h-56 min-w-[160px] overflow-y-auto scrollbar-hide">
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm text-white/90 transition hover:bg-white/10 ${
                    active ? "bg-white/10" : ""
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <span className="pl-2 text-xs text-white/70">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function defaultsForTheme(theme: ThemeKey) {
  if (theme === "light") {
    return {
      bg: "#f4f4f5",
      border: "#d4d4d8",
      text: "#0f172a",
      accent: "#475569",
    };
  }
  return {
    bg: "#000000",
    border: "#7c3aed",
    text: "#e5e7eb",
    accent: "#a1a1aa",
  };
}

const RESTRICTED_AUTHORS = ["ray", "nea", "rushi", "jane austen", "atticus", "emperor fushimi"];
const RESTRICTED_LANGUAGES = ["hindi", "punjabi", "punjabi/hindi"];
const RESTRICTED_SOURCE_TYPES = ["poetry", "quote", "saying", "series", "song", "lines", "movie", "my thought"];

const QUOTE_THEME_PRESETS: Record<QuoteThemeKey, { label: string; requiresAdmin?: boolean }> = {
  "viora-gold": { label: "Viora Gold (Flashcard)", requiresAdmin: true },
};

export function QuotesBuilder() {
  const [authors, setAuthors] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [mode, setMode] = useState<"daily" | "random" | "interval" | "flashcard">("daily");
  const [startIndex, setStartIndex] = useState(1);
  const [indexChase, setIndexChase] = useState(false);
  const [query, setQuery] = useState("");
  const [showPinned, setShowPinned] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [source, setSource] = useState<"auto" | "local" | "notion">("auto");
  const [theme, setTheme] = useState<ThemeKey>("dark");
  const [rotate, setRotate] = useState(false);
  const [interval, setInterval] = useState(10);
  const [bg, setBg] = useState(defaultsForTheme("dark").bg);
  const [border, setBorder] = useState(defaultsForTheme("dark").border);
  const [text, setText] = useState(defaultsForTheme("dark").text);
  const [accent, setAccent] = useState(defaultsForTheme("dark").accent);
  const [pageBg, setPageBg] = useState("#0a0a0b");
  const [pageMatch, setPageMatch] = useState(true);
  const [transparentBgMode, setTransparentBgMode] = useState<TransparentBgMode>("off");
  const [copied, setCopied] = useState(false);
  const [customMode, setCustomMode] = useState<CustomQuoteMode>("database");
  const [customText, setCustomText] = useState("");
  const [customAuthor, setCustomAuthor] = useState("");
  const [themePreset, setThemePreset] = useState<QuoteThemeKey | "">("");
  const [stylePreset, setStylePreset] = useState<QuoteStyleKey | "">("");
  const [quoteFont, setQuoteFont] = useState<QuoteFontKey | "">("");
  const [authorFont, setAuthorFont] = useState<QuoteFontKey | "">("");
  const [cardWidth, setCardWidth] = useState(0);
  const [quoteSize, setQuoteSize] = useState(0);
  const [authorSize, setAuthorSize] = useState(0);
  const [arrowColor, setArrowColor] = useState("");
  const [counterColor, setCounterColor] = useState("");
  const [customStorageReady, setCustomStorageReady] = useState(false);
  const searchParams = useSearchParams();
  const sanitizeInstance = (value: string) => value.replace(/[^a-z0-9_-]/gi, "");
  const instanceParam = (searchParams.get("instance") ?? "").trim();
  const [instanceId, setInstanceId] = useState(instanceParam);
  const [instanceDraft, setInstanceDraft] = useState(instanceParam);
  const normalizedInstance = sanitizeInstance(instanceId);
  const normalizedDraft = sanitizeInstance(instanceDraft.trim());
  const canApplyInstance = normalizedDraft !== normalizedInstance;
  const adminParam = (searchParams.get("admin") ?? "").trim();
  const isAdminBypass = adminParam === QUOTES_ADMIN_SECRET;
  const sourceQuotes = useMemo<Quote[]>(() => getQuotes(source), [source]);

  useEffect(() => {
    const modeParam = (searchParams.get("custommode") ?? "").trim().toLowerCase();
    const textParam = (searchParams.get("customtext") ?? "").trim();
    const authorParam = (searchParams.get("customauthor") ?? "").trim();
    const indexChaseParam = parseBooleanParam(searchParams.get("indexchase"), false);
    const styleParam = (searchParams.get("style") ?? "").trim().toLowerCase();
    const quoteFontParam = (searchParams.get("quotefont") ?? "").trim().toLowerCase();
    const authorFontParam = (searchParams.get("authorfont") ?? "").trim().toLowerCase();
    const widthParam = Number.parseInt(searchParams.get("width") ?? "", 10);
    const quoteSizeParam = Number.parseInt(searchParams.get("quotesize") ?? "", 10);
    const authorSizeParam = Number.parseInt(searchParams.get("authorsize") ?? "", 10);
    const arrowParam = parseColorParam(searchParams.get("arrowcolor"));
    const counterParam = parseColorParam(searchParams.get("countercolor"));

    if (modeParam === "custom") setCustomMode("custom");
    if (textParam) setCustomText(textParam);
    if (authorParam) setCustomAuthor(authorParam);
    setIndexChase(indexChaseParam);
    if (styleParam && styleParam in QUOTE_STYLE_PRESETS) {
      setStylePreset(styleParam as QuoteStyleKey);
    }
    if (quoteFontParam && quoteFontParam in QUOTE_FONT_OPTIONS) {
      setQuoteFont(quoteFontParam as QuoteFontKey);
    }
    if (authorFontParam && authorFontParam in QUOTE_FONT_OPTIONS) {
      setAuthorFont(authorFontParam as QuoteFontKey);
    }
    if (Number.isFinite(widthParam) && widthParam > 0) setCardWidth(widthParam);
    if (Number.isFinite(quoteSizeParam) && quoteSizeParam > 0) setQuoteSize(quoteSizeParam);
    if (Number.isFinite(authorSizeParam) && authorSizeParam > 0) setAuthorSize(authorSizeParam);
    if (arrowParam) setArrowColor(arrowParam);
    if (counterParam) setCounterColor(counterParam);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCustomStorageReady(false);
    try {
      const key = `quotes:custom:${normalizedInstance || "default"}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ text: string; author: string; mode: CustomQuoteMode }>;
      if (parsed.text !== undefined) setCustomText(parsed.text);
      if (parsed.author !== undefined) setCustomAuthor(parsed.author);
      if (parsed.mode === "custom" || parsed.mode === "database") setCustomMode(parsed.mode);
    } catch {
      // ignore storage errors
    } finally {
      setCustomStorageReady(true);
    }
  }, [normalizedInstance]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customStorageReady) return;
    try {
      const key = `quotes:custom:${normalizedInstance || "default"}`;
      const payload = JSON.stringify({ text: customText, author: customAuthor, mode: customMode });
      window.localStorage.setItem(key, payload);
    } catch {
      // ignore storage errors
    }
  }, [customStorageReady, customText, customAuthor, customMode, normalizedInstance]);

  const availableAuthors = useMemo<FancyOption[]>(() => {
    const vals = Array.from(new Set(sourceQuotes.map((q) => (q.author || "").trim()).filter(Boolean))).sort();
    const filtered = isAdminBypass ? vals : vals.filter((v) => !RESTRICTED_AUTHORS.includes(v.toLowerCase()));
    return filtered.map((v) => ({ value: v, label: v }));
  }, [sourceQuotes, isAdminBypass]);

  const availableLanguages = useMemo<FancyOption[]>(() => {
    const vals = Array.from(new Set(sourceQuotes.map((q) => (q.language || "").trim()).filter(Boolean))).sort();
    const filtered = isAdminBypass ? vals : vals.filter((v) => !RESTRICTED_LANGUAGES.includes(v.toLowerCase()));
    return [{ value: "", label: "Any language" }, ...filtered.map((v) => ({ value: v, label: v }))];
  }, [sourceQuotes, isAdminBypass]);

  const availableSourceTypes = useMemo<FancyOption[]>(() => {
    const vals = Array.from(new Set(sourceQuotes.map((q) => (q.sourceType || "").trim()).filter(Boolean))).sort();
    const filtered = isAdminBypass ? vals : vals.filter((v) => !RESTRICTED_SOURCE_TYPES.includes(v.toLowerCase()));
    return [{ value: "", label: "Any source" }, ...filtered.map((v) => ({ value: v, label: v }))];
  }, [sourceQuotes, isAdminBypass]);

  useEffect(() => {
    const next = defaultsForTheme(theme);
    setBg(next.bg);
    setBorder(next.border);
    setText(next.text);
    setAccent(next.accent);
  }, [theme]);

  useEffect(() => {
    if (!stylePreset) return;
    const preset = QUOTE_STYLE_PRESETS[stylePreset];
    if (!preset) return;
    setBg(preset.bg);
    setBorder(preset.border);
    setText(preset.text);
    setAccent(preset.accent);
  }, [stylePreset]);

  useEffect(() => {
    if (!themePreset) return;
    if (themePreset === "viora-gold") {
      setAuthors(["n/a"]);
      setTags([]);
      setLanguages([]);
      setSourceTypes([]);
      setMode("flashcard");
      setStartIndex(1);
      setIndexChase(false);
      setQuery("");
      setShowPinned(false);
      setShowPersonal(false);
      setSource("notion");
      setTheme("dark");
      setRotate(true);
      setInterval(70);
      setBg("#000000");
      setBorder("#966919");
      setText("#e6a433");
      setAccent("#a1a1aa");
      setPageBg("#0a0a0b");
      setPageMatch(false);
      setTransparentBgMode("dark");
      setCustomMode("database");
      setCustomText("");
      setCustomAuthor("");
      setStylePreset("");
      setQuoteFont("");
      setAuthorFont("libre");
      setCardWidth(0);
      setQuoteSize(0);
      setAuthorSize(0);
      setArrowColor("");
      setCounterColor("");
    }
  }, [themePreset]);

  const applyInstance = () => {
    const next = normalizedDraft;
    if (next === normalizedInstance) return;
    setInstanceId(next);
    setInstanceDraft(next);
  };

  const reset = () => {
    setAuthors([]);
    setTags([]);
    setLanguages([]);
    setSourceTypes([]);
    setMode("daily");
    setStartIndex(1);
    setIndexChase(false);
    setQuery("");
    setShowPinned(false);
    setShowPersonal(false);
    setSource("auto");
    setTheme("dark");
    setRotate(false);
    setInterval(10);
    const next = defaultsForTheme("dark");
    setBg(next.bg);
    setBorder(next.border);
    setText(next.text);
    setAccent(next.accent);
    setPageBg("#0a0a0b");
    setPageMatch(true);
    setTransparentBgMode("off");
    setInstanceId(instanceParam);
    setInstanceDraft(instanceParam);
    setCustomMode("database");
    setCustomText("");
    setCustomAuthor("");
    setThemePreset("");
    setStylePreset("");
    setQuoteFont("");
    setAuthorFont("");
    setCardWidth(0);
    setQuoteSize(0);
    setAuthorSize(0);
    setArrowColor("");
    setCounterColor("");
  };

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("embed", "1");
    if (normalizedInstance) p.set("instance", normalizedInstance);
    p.set("theme", theme);
    if (adminParam) p.set("admin", adminParam);
    if (authors.length) p.set("authors", authors.join(","));
    if (tags.length) p.set("tags", tags.join(","));
    if (languages.length) p.set("languages", languages.join(","));
    if (sourceTypes.length) p.set("sourcetypes", sourceTypes.join(","));
    if (source !== "auto") p.set("source", source);
    p.set("mode", mode);
    if (startIndex > 1) p.set("index", String(startIndex));
    if (indexChase) p.set("indexchase", "1");
    if (query.trim()) p.set("q", query.trim());
    if (showPinned) p.set("pinned", "1");
    if (showPersonal) p.set("personal", "1");
    if (rotate) p.set("rotate", "1");
    if (interval !== 10) p.set("interval", String(interval));
    if (bg) p.set("bg", bg.replace("#", ""));
    if (border) p.set("border", border.replace("#", ""));
    if (text) p.set("text", text.replace("#", ""));
    if (accent) p.set("accent", accent.replace("#", ""));
    if (pageBg) p.set("pagebg", pageBg.replace("#", ""));
    if (pageMatch) p.set("pagematch", "1");
    if (transparentBgMode !== "off") {
      p.set("pagetransparent", "1");
      p.set("pagetransparentmode", transparentBgMode);
    }
    if (stylePreset) p.set("style", stylePreset);
    if (quoteFont) p.set("quotefont", quoteFont);
    if (authorFont) p.set("authorfont", authorFont);
    if (cardWidth > 0) p.set("width", String(cardWidth));
    if (quoteSize > 0) p.set("quotesize", String(quoteSize));
    if (authorSize > 0) p.set("authorsize", String(authorSize));
    if (arrowColor) p.set("arrowcolor", arrowColor.replace("#", ""));
    if (counterColor) p.set("countercolor", counterColor.replace("#", ""));
    if (customMode === "custom") p.set("custommode", "custom");
    if (customText.trim()) p.set("customtext", customText.trim());
    if (customAuthor.trim()) p.set("customauthor", customAuthor.trim());
    return p;
  }, [adminParam, normalizedInstance, authors, tags, languages, sourceTypes, source, theme, mode, startIndex, indexChase, query, showPinned, showPersonal, rotate, interval, bg, border, text, accent, pageBg, pageMatch, transparentBgMode, stylePreset, quoteFont, authorFont, cardWidth, quoteSize, authorSize, arrowColor, counterColor, customMode, customText, customAuthor]);

  const livePreviewParams = useMemo(
    () => ({
      authors: authors.join(","),
      tags: tags.join(","),
      languages: languages.join(","),
      sourceTypes: sourceTypes.join(","),
      source,
      theme,
      rotate,
      interval,
      mode,
      startIndex: startIndex > 1 ? startIndex : undefined,
      indexChase,
      q: query,
      instance: normalizedInstance || undefined,
      admin: adminParam,
      showPinned,
      showPersonal,
      bg,
      border,
      text,
      accent,
      pageBg: pageMatch ? undefined : pageBg,
      pageMatch,
      pageTransparent: transparentBgMode !== "off",
      pageTransparentMode: transparentBgMode,
      style: stylePreset || undefined,
      quoteFont: quoteFont || undefined,
      authorFont: authorFont || undefined,
      width: cardWidth || undefined,
      quoteSize: quoteSize || undefined,
      authorSize: authorSize || undefined,
      arrowColor: arrowColor || undefined,
      counterColor: counterColor || undefined,
      customMode,
      customText,
      customAuthor,
    }),
    [authors, tags, languages, sourceTypes, source, theme, rotate, interval, mode, startIndex, indexChase, query, normalizedInstance, adminParam, showPinned, showPersonal, bg, border, text, accent, pageBg, pageMatch, transparentBgMode, stylePreset, quoteFont, authorFont, cardWidth, quoteSize, authorSize, arrowColor, counterColor, customMode, customText, customAuthor]
  );

  const copyLink = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.origin + "/quotes");
    params.forEach((v, k) => url.searchParams.set(k, v));
    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  };

  return (
    <main className="flex min-h-screen w-full items-start justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-[340px,1fr]">
        <section className="flex max-h-[88vh] flex-col gap-4 overflow-y-auto scrollbar-hide rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Quote Widget Builder</h2>
              <p className="text-sm text-zinc-400">Pick a source, theme, and colors.</p>
            </div>
            <button
              className="rounded-full border border-white/10 p-2 text-zinc-200 transition hover:bg-white/10"
              onClick={reset}
              aria-label="Reset"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Instance</span>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={instanceDraft}
                  onChange={(e) => setInstanceDraft(e.target.value)}
                  placeholder="main"
                />
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-3 text-sm text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={applyInstance}
                  disabled={!canApplyInstance}
                >
                  Save
                </button>
              </div>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Authors</span>
              <div className="flex flex-wrap gap-2">
                {availableAuthors.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-full border px-3 py-1 text-xs ${authors.includes(opt.value.toLowerCase()) ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5"}`}
                    onClick={() =>
                      setAuthors((prev) => {
                        const val = opt.value.toLowerCase();
                        return prev.includes(val) ? prev.filter((a) => a !== val) : [...prev, val];
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label>

            {/* <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Tags</span>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-full border px-3 py-1 text-xs ${tags.includes(opt.value.toLowerCase()) ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5"}`}
                    onClick={() =>
                      setTags((prev) => {
                        const val = opt.value.toLowerCase();
                        return prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val];
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label> */}

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Languages</span>
              <div className="flex flex-wrap gap-2">
                {availableLanguages.slice(1).map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-full border px-3 py-1 text-xs ${languages.includes(opt.value.toLowerCase()) ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5"}`}
                    onClick={() =>
                      setLanguages((prev) => {
                        const val = opt.value.toLowerCase();
                        return prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val];
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Source types</span>
              <div className="flex flex-wrap gap-2">
                {availableSourceTypes.slice(1).map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-full border px-3 py-1 text-xs ${sourceTypes.includes(opt.value.toLowerCase()) ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5"}`}
                    onClick={() =>
                      setSourceTypes((prev) => {
                        const val = opt.value.toLowerCase();
                        return prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val];
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Mode</span>
                <FancySelect
                  value={mode}
                  onChange={(val) => setMode(val as typeof mode)}
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "random", label: "Random" },
                    { value: "interval", label: "Interval" },
                    { value: "flashcard", label: "Flashcard" },
                  ]}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Start index</span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={startIndex}
                  onChange={(e) => setStartIndex(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-white/10"
                checked={indexChase}
                onChange={(e) => setIndexChase(e.target.checked)}
              />
              Chase index between sessions
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Search text</span>
              <input
                type="text"
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search quotes"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/10" checked={showPinned} onChange={(e) => setShowPinned(e.target.checked)} />
                Pinned only
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/10" checked={showPersonal} onChange={(e) => setShowPersonal(e.target.checked)} />
                Personal only
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Source</span>
              <FancySelect
                value={source}
                onChange={(val) => setSource(val as typeof source)}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "local", label: "Local file" },
                  { value: "notion", label: "Notion" },
                ]}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Theme</span>
                <FancySelect
                  value={theme}
                  onChange={(val) => setTheme(val as ThemeKey)}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Rotate quotes</span>
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-white/10"
                    checked={rotate}
                    onChange={(e) => setRotate(e.target.checked)}
                  />
                  <span>{rotate ? "On" : "Off"}</span>
                </div>
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Rotation interval (seconds)</span>
              <input
                type="number"
                min={3}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                value={interval}
                onChange={(e) => setInterval(Math.max(3, Number(e.target.value) || 3))}
                disabled={!rotate}
              />
            </label>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Custom quote</h3>
                    <p className="text-xs text-zinc-400">Saved per instance on this device.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-white/10"
                      checked={customMode === "custom"}
                      onChange={(e) => setCustomMode(e.target.checked ? "custom" : "database")}
                    />
                    Use custom only
                  </label>
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-zinc-400">Quote text</span>
                    <textarea
                      rows={3}
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Write your own quote"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-zinc-400">Author</span>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                      value={customAuthor}
                      onChange={(e) => setCustomAuthor(e.target.value)}
                      placeholder="Your name"
                    />
                  </label>
                </div>
              </div>

              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Theme preset</span>
                <FancySelect
                  value={themePreset}
                  onChange={(val) => setThemePreset(val ? (val as QuoteThemeKey) : "")}
                  options={[
                    { value: "", label: "Custom" },
                    ...Object.entries(QUOTE_THEME_PRESETS).map(([key, value]) => ({ value: key, label: value.label })),
                  ]}
                />
                <p className="text-xs text-zinc-500">Applies source, mode, and color settings.</p>
                {themePreset && QUOTE_THEME_PRESETS[themePreset as QuoteThemeKey]?.requiresAdmin && !isAdminBypass && (
                  <p className="text-xs text-amber-300">Requires admin param for restricted authors.</p>
                )}
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Notion-style preset</span>
                <FancySelect
                  value={stylePreset}
                  onChange={(val) => setStylePreset(val ? (val as QuoteStyleKey) : "")}
                  options={[
                    { value: "", label: "Custom colors" },
                    ...QUOTE_STYLE_ORDER.map((key) => ({ value: key, label: QUOTE_STYLE_PRESETS[key].label })),
                  ]}
                />
                <p className="text-xs text-zinc-500">Selecting a preset updates colors + typography.</p>
              </label>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-zinc-200">Typography</h3>
                  <p className="text-xs text-zinc-400">Set fonts and sizing for the quote card.</p>
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-300">Quote font</span>
                    <FancySelect
                      value={quoteFont}
                      onChange={(val) => setQuoteFont(val ? (val as QuoteFontKey) : "")}
                      options={[
                        { value: "", label: "Preset default" },
                        ...Object.entries(QUOTE_FONT_OPTIONS).map(([key, value]) => ({ value: key, label: value.label })),
                      ]}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-300">Author font</span>
                    <FancySelect
                      value={authorFont}
                      onChange={(val) => setAuthorFont(val ? (val as QuoteFontKey) : "")}
                      options={[
                        { value: "", label: "Preset default" },
                        ...Object.entries(QUOTE_FONT_OPTIONS).map(([key, value]) => ({ value: key, label: value.label })),
                      ]}
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-300">Card width</span>
                    <input
                      type="range"
                      min={0}
                      max={1200}
                      step={10}
                      className="w-full"
                      value={cardWidth}
                      onChange={(e) => setCardWidth(Number(e.target.value))}
                    />
                    <span className="text-xs text-zinc-400">{cardWidth > 0 ? `${cardWidth}px` : "Auto"}</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-zinc-300">Quote size</span>
                      <input
                        type="range"
                        min={0}
                        max={44}
                        step={1}
                        className="w-full"
                        value={quoteSize}
                        onChange={(e) => setQuoteSize(Number(e.target.value))}
                      />
                      <span className="text-xs text-zinc-400">{quoteSize > 0 ? `${quoteSize}px` : "Auto"}</span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-zinc-300">Author size</span>
                      <input
                        type="range"
                        min={0}
                        max={28}
                        step={1}
                        className="w-full"
                        value={authorSize}
                        onChange={(e) => setAuthorSize(Number(e.target.value))}
                      />
                      <span className="text-xs text-zinc-400">{authorSize > 0 ? `${authorSize}px` : "Auto"}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-300">Arrow color</span>
                  <input
                    type="color"
                    className="color-swatch"
                    value={arrowColor || text}
                    onChange={(e) => setArrowColor(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-300">Counter color</span>
                  <input
                    type="color"
                    className="color-swatch"
                    value={counterColor || text}
                    onChange={(e) => setCounterColor(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-white/10"
                    checked={pageMatch}
                    onChange={(e) => {
                      setPageMatch(e.target.checked);
                      if (e.target.checked) setTransparentBgMode("off");
                    }}
                  />
                  Match page background to card
                </label>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-white/10"
                      checked={transparentBgMode !== "off"}
                      onChange={(e) => {
                        setTransparentBgMode(e.target.checked ? "dark" : "off");
                        if (e.target.checked) setPageMatch(false);
                      }}
                    />
                    Transparent BG
                  </label>
                  <label
                    className={`relative inline-flex items-center gap-2 text-sm select-none ${
                      transparentBgMode === "off" ? "text-zinc-500 cursor-not-allowed" : "text-zinc-300 cursor-pointer"
                    }`}
                  >
                    <span>Dark</span>
                    <input
                      type="checkbox"
                      className="peer absolute h-0 w-0 opacity-0"
                      checked={transparentBgMode === "light"}
                      disabled={transparentBgMode === "off"}
                      onChange={(e) => setTransparentBgMode(e.target.checked ? "light" : "dark")}
                    />
                    <span
                      className={`relative h-5 w-11 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-6 ${
                        transparentBgMode === "off"
                          ? "bg-zinc-700/40"
                          : "bg-zinc-500/90 peer-checked:bg-zinc-300"
                      }`}
                    />
                    <span>Light</span>
                  </label>
                </div>
              </div>

              {transparentBgMode === "off" && !pageMatch && (
                <label className="space-y-1 text-sm">
                  <span className="text-zinc-300">Page background</span>
                  <input
                    type="color"
                    className="color-swatch"
                    value={pageBg}
                    onChange={(e) => setPageBg(e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Background</span>
                <input
                  type="color"
                  className="color-swatch"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Border</span>
                <input
                  type="color"
                  className="color-swatch"
                  value={border}
                  onChange={(e) => setBorder(e.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Quote text</span>
                <input
                  type="color"
                  className="color-swatch"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Author</span>
                <input
                  type="color"
                  className="color-swatch"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                />
              </label>
            </div>
          </div>

          <button
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-white"
            onClick={copyLink}
          >
            <Copy size={16} />
            {copied ? "Copied" : "Copy embed URL"}
          </button>
          <p className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <Info size={14} />
            <span>Tip: add embed=1 to hide the builder when pasting into Notion.</span>
          </p>
        </section>

        {/* <section className="flex max-h-[88vh] items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl overflow-hidden"> */}
        <section className="flex max-h-[88vh] flex-col items-stretch justify-center rounded-2xl border border-white/10 bg-white/5 p-0 shadow-xl overflow-hidden">
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background:
                transparentBgMode !== "off"
                  ? transparentBgMode === "dark"
                    ? "#191919"
                    : "#ffffff"
                  : pageMatch
                    ? bg
                    : pageBg,
            }}
          >
            <div className="w-full p-4">
              <QuoteWidget embedParams={livePreviewParams} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default QuotesBuilder;
