"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Info, RefreshCw } from "lucide-react";
import ClockWidget from "@/components/widgets/ClockWidget";
import { THEME_ORDER, type ThemeName } from "@/components/widgets/theme";

type FancyOption = { value: string; label: string };
type TransparentBgMode = "off" | "dark" | "light";
type ClockMode = "flip" | "minimal";

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

const defaults = {
  tz: "America/Toronto",
  mode: "flip" as ClockMode,
  size: 75,
  format: "24" as "12" | "24",
  showSeconds: true,
  showDay: false,
  theme: "default" as ThemeName,
  transparentBgMode: "off" as TransparentBgMode,
};

export function ClockBuilder() {
  const [tz, setTz] = useState(defaults.tz);
  const [mode, setMode] = useState<ClockMode>(defaults.mode);
  const [size, setSize] = useState(defaults.size);
  const [format, setFormat] = useState<"12" | "24">(defaults.format);
  const [showSeconds, setShowSeconds] = useState(defaults.showSeconds);
  const [showDay, setShowDay] = useState(defaults.showDay);
  const [theme, setTheme] = useState<ThemeName>(defaults.theme);
  const [transparentBgMode, setTransparentBgMode] = useState<TransparentBgMode>(defaults.transparentBgMode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode === "minimal") {
      setShowSeconds(false);
      setShowDay(false);
    }
  }, [mode]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("embed", "1");
    p.set("tz", tz.trim() || defaults.tz);
    p.set("size", String(size));
    p.set("format", format);
    p.set("seconds", showSeconds ? "1" : "0");
    p.set("day", showDay ? "1" : "0");
    p.set("theme", theme);
    p.set("overlay", transparentBgMode !== "off" ? "1" : "0");
    p.set("transparentbg", transparentBgMode !== "off" ? "1" : "0");
    if (transparentBgMode !== "off") {
      p.set("transparentbgmode", transparentBgMode);
    }
    if (mode === "minimal") {
      p.set("mode", "minimal");
    }
    return p;
  }, [tz, size, format, showSeconds, showDay, theme, transparentBgMode, mode]);

  const livePreviewParams = useMemo(
    () => ({
      tz: tz.trim() || defaults.tz,
      size,
      format,
      seconds: showSeconds ? 1 : 0,
      day: showDay ? 1 : 0,
      theme,
      overlay: transparentBgMode !== "off" ? 1 : 0,
      transparentbg: transparentBgMode !== "off" ? 1 : 0,
      transparentbgmode: transparentBgMode !== "off" ? transparentBgMode : undefined,
      mode: mode === "minimal" ? "minimal" : undefined,
      controls: 0,
    }),
    [tz, size, format, showSeconds, showDay, theme, transparentBgMode, mode],
  );

  const reset = () => {
    setTz(defaults.tz);
    setMode(defaults.mode);
    setSize(defaults.size);
    setFormat(defaults.format);
    setShowSeconds(defaults.showSeconds);
    setShowDay(defaults.showDay);
    setTheme(defaults.theme);
    setTransparentBgMode(defaults.transparentBgMode);
  };

  const copyLink = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.origin + "/clock");
    params.forEach((v, k) => url.searchParams.set(k, v));
    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  };

  const themeOptions = THEME_ORDER.map((themeName) => ({
    value: themeName,
    label: themeName === "default" ? "Default" : themeName[0].toUpperCase() + themeName.slice(1),
  }));

  return (
    <main className="flex min-h-screen w-full items-start justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-[340px,1fr]">
        <section className="flex max-h-[88vh] flex-col gap-4 overflow-y-auto scrollbar-hide rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Clock Widget Builder</h2>
              <p className="text-sm text-zinc-400">Build your Flip or Minimal Clock embed URL.</p>
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
              <span className="text-zinc-300">Timezone</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                placeholder="Ex: America/Toronto"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Mode</span>
                <FancySelect
                  value={mode}
                  onChange={(v) => setMode(v as ClockMode)}
                  options={[
                    { value: "flip", label: "Flip Clock" },
                    { value: "minimal", label: "Minimal Clock" },
                  ]}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Theme</span>
                <FancySelect value={theme} onChange={(v) => setTheme(v as ThemeName)} options={themeOptions} />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Time format</span>
                <FancySelect
                  value={format}
                  onChange={(v) => setFormat(v as "12" | "24")}
                  options={[
                    { value: "12", label: "12-hour" },
                    { value: "24", label: "24-hour" },
                  ]}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Size</span>
                <input
                  className="w-full"
                  type="range"
                  min={50}
                  max={120}
                  step={1}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                  checked={showSeconds}
                  disabled={mode === "minimal"}
                  onChange={(e) => setShowSeconds(e.target.checked)}
                />
                Show seconds
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                  checked={showDay}
                  disabled={mode === "minimal"}
                  onChange={(e) => setShowDay(e.target.checked)}
                />
                Show day label
              </label>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Transparent background</span>
                <button
                  className={transparentBgMode !== "off" ? "fc-chip is-active" : "fc-chip"}
                  onClick={() => setTransparentBgMode((v) => (v === "off" ? "dark" : "off"))}
                >
                  <span className={transparentBgMode !== "off" ? "fc-sec-badge is-active" : "fc-sec-badge"}>BG</span>
                </button>
              </div>
              <button
                className="fc-pill-toggle"
                onClick={() => {
                  if (transparentBgMode === "off") return;
                  setTransparentBgMode((v) => (v === "light" ? "dark" : "light"));
                }}
                disabled={transparentBgMode === "off"}
                aria-label="Toggle transparent background mode"
              >
                <span className="fc-pill-text">D</span>
                <input type="checkbox" checked={transparentBgMode === "light"} readOnly disabled={transparentBgMode === "off"} />
                <span className="fc-pill-text">L</span>
              </button>
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
            <span>Minimal Clock mode matches your simple digital style (Karla-like, HH:MM).</span>
          </p>
        </section>

        <section className="flex max-h-[88vh] flex-col items-stretch justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-0 shadow-xl">
          <div className="flex h-full w-full items-center justify-center">
            <div className="m-auto h-[340px] w-full">
              <ClockWidget embedParams={livePreviewParams} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default ClockBuilder;
