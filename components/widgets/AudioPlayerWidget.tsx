"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, List, Loader, Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

type EmbedParams = Record<string, string | number | boolean | undefined>;
type PlayerLayout = "small" | "medium" | "large";
type LoopMode = "none" | "track" | "playlist";

type Track = {
  src: string;
  title: string;
  artist: string;
  cover: string;
  album?: string;
  genre?: string;
  year?: string;
  duration?: string;
  description?: string;
  category?: string;
  type?: string;
};

const DEFAULT_TRACK: Track = {
  src: "",
  title: "",
  artist: "",
  cover: "",
};

const DEFAULT_COVER = "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80";
const FALLBACK_AUDIO_SOURCES = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
];

const PUBLIC_ALLOWED_TYPES_BY_CATEGORY: Record<string, string[]> = {
  eng: ["normal", "slowed"],
  hindi: ["normal", "slowed"],
  otherz: ["normal"],
  punjab: ["normal"],
  nightcore: ["normal"],
  "🎻": ["normal"],
  "🔱": ["normal", "modern"],
};

const CATEGORY_ALIASES: Record<string, string> = {
  punjabi: "punjab",
  others: "otherz",
    instrumental: "🎻",
    spritual: "🔱"
};

const TYPE_ALIASES: Record<string, string> = {
  speedup: "speed up",
  "sped up": "speed up",
  spedup: "speed up",
  "speed-up": "speed up",
  "speed_up": "speed up",
  morden: "modern",
};

function isPlaceholderCoverUrl(value: string): boolean {
  return /placeholder/i.test(value);
}

function decodeMaybeUriComponent(value: string): string {
  try {
    return /%[0-9a-f]{2}/i.test(value) ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}

function normalizeCategory(value: string | null | undefined): string {
  if (!value) return "";
  const token = decodeMaybeUriComponent(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (!token) return "";
  return CATEGORY_ALIASES[token] ?? token;
}

function normalizeType(value: string | null | undefined): string {
  if (!value) return "";
  const token = decodeMaybeUriComponent(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!token) return "";
  return TYPE_ALIASES[token] ?? token;
}

function parseMultiFilterValues(value: string | null | undefined, normalizer: (value: string | null | undefined) => string): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      decodeMaybeUriComponent(value)
        .split(",")
        .map((token) => normalizer(token))
        .filter((token): token is string => Boolean(token)),
    ),
  );
}

function toggleSelection(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((token) => token !== value);
  }
  return [...values, value].sort((left, right) => left.localeCompare(right));
}

function canAccessTrackWithoutAdmin(category: string, type: string): boolean {
  if (!category) return false;
  const allowedTypes = PUBLIC_ALLOWED_TYPES_BY_CATEGORY[category] ?? [];
  if (!allowedTypes.length) return false;
  const normalizedType = type || "normal";
  return allowedTypes.includes(normalizedType);
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const v = value.toLowerCase();
  return (allowed.includes(v as T) ? v : fallback) as T;
}

function clamp(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function normalizeHex(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw) || /^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw}`;
  }
  return fallback;
}

function formatTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return "0:00";
  const total = Math.floor(time);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function sanitizeInstance(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "");
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLikelyAudioUrl(value: string): boolean {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  try {
    const pathname = new URL(candidate, window.location.origin).pathname.toLowerCase();
    return /\.(mp3|m4a|aac|wav|ogg|flac)$/.test(pathname);
  } catch {
    return /\.(mp3|m4a|aac|wav|ogg|flac)$/.test(candidate);
  }
}

function getFallbackAudioSrc(index: number): string {
  return FALLBACK_AUDIO_SOURCES[index % FALLBACK_AUDIO_SOURCES.length] ?? FALLBACK_AUDIO_SOURCES[0];
}

function toPlayableSrc(value: string, index: number): string {
  if (!value) return value;
  if (value.startsWith("/")) return value;
  if (!isLikelyAudioUrl(value)) return getFallbackAudioSrc(index);
  if (!isRemoteUrl(value)) return value;
  return `/api/audio?url=${encodeURIComponent(value)}`;
}

function toPlayablePlaylistUrl(value: string): string {
  if (!value) return value;
  if (value.startsWith("/api/playlist?url=")) return value;
  if (value.startsWith("/")) return value;
  if (!isRemoteUrl(value)) return value;
  return `/api/playlist?url=${encodeURIComponent(value)}`;
}

function normalizeTrack(input: unknown): Track | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const src = typeof row.src === "string" ? row.src.trim() : "";
  if (!src) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : DEFAULT_TRACK.title;
  const artist = typeof row.artist === "string" && row.artist.trim() ? row.artist.trim() : DEFAULT_TRACK.artist;
  const cover = typeof row.cover === "string" && row.cover.trim() && !isPlaceholderCoverUrl(row.cover.trim()) ? row.cover.trim() : "";
  const album = typeof row.album === "string" && row.album.trim() ? row.album.trim() : undefined;
  const genre = typeof row.genre === "string" && row.genre.trim() ? row.genre.trim() : undefined;
  const year = typeof row.year === "string" && row.year.trim()
    ? row.year.trim()
    : typeof row.year === "number" && Number.isFinite(row.year)
      ? String(row.year)
      : undefined;
  const duration = typeof row.duration === "string" && row.duration.trim()
    ? row.duration.trim()
    : typeof row.duration === "number" && Number.isFinite(row.duration)
      ? formatTime(row.duration)
      : undefined;
  const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : undefined;
  const categoryRaw = typeof row.category === "string" ? row.category : "";
  const typeRaw = typeof row.type === "string" ? row.type : "";
  const category = normalizeCategory(categoryRaw) || undefined;
  const type = normalizeType(typeRaw) || undefined;
  return { src, title, artist, cover, album, genre, year, duration, description, category, type };
}

function parseTracksPayload(payload: unknown): Track[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTrack).filter((track): track is Track => Boolean(track));
  }
  if (payload && typeof payload === "object") {
    const maybeTracks = (payload as Record<string, unknown>).tracks;
    if (Array.isArray(maybeTracks)) {
      return maybeTracks.map(normalizeTrack).filter((track): track is Track => Boolean(track));
    }
  }
  return [];
}

export default function AudioPlayerWidget({
  embedParams,
  previewBlend = false,
  previewTransparent = false,
}: {
  embedParams?: EmbedParams;
  previewBlend?: boolean;
  previewTransparent?: boolean;
}) {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const smallSeekRef = useRef<HTMLDivElement | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isBuffering, setIsBuffering] = useState(false);
  const [seekHoverPct, setSeekHoverPct] = useState<number | null>(null);
  const [seekHoverLabel, setSeekHoverLabel] = useState("0:00");
  const [autoLayout, setAutoLayout] = useState<PlayerLayout>("small");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  

  const getParam = (keys: string[]) => {
    if (embedParams) {
      for (const key of keys) {
        if (key in embedParams) {
          const value = embedParams[key];
          return value === undefined ? null : String(value);
        }
      }
      return null;
    }

    for (const key of keys) {
      const value = searchParams.get(key);
      if (value !== null) return value;
    }
    return null;
  };

  const layoutParam = getParam(["layout", "size"]);
  const explicitLayout = layoutParam
    ? pick(layoutParam, ["small", "medium", "large"] as const, "small")
    : null;
  const layout = explicitLayout ?? autoLayout;
  const sourceUrl = (getParam(["src", "url"]) || "").trim();
  const title = (getParam(["title"]) || DEFAULT_TRACK.title).trim() || DEFAULT_TRACK.title;
  const artist = (getParam(["artist"]) || DEFAULT_TRACK.artist).trim() || DEFAULT_TRACK.artist;
  const cover = (getParam(["cover", "image"]) || "").trim();
  const dataUrl = (getParam(["data", "playlist"]) || "").trim();
  const autoplay = parseBool(getParam(["autoplay"]), false);
  const showQueue = parseBool(getParam(["queue", "show-queue", "showQueue"]), true);
  const [queueVisible, setQueueVisible] = useState<boolean>(showQueue);
  useEffect(() => {
    setQueueVisible(showQueue);
  }, [showQueue]);
  const loopMode = pick(getParam(["loop"]), ["none", "track", "playlist"] as const, "none");
  const startIndex = clamp(getParam(["start", "index"]), 0, 0, 99);
  const initialVolume = clamp(getParam(["volume"]), 0.8, 0, 1);
  const instance = sanitizeInstance((getParam(["instance"]) || "").trim());
  const requestedCategories = parseMultiFilterValues(getParam(["category"]), normalizeCategory);
  const requestedTypes = parseMultiFilterValues(getParam(["type"]), normalizeType);
  const requestedCategoriesKey = requestedCategories.join("|");
  const requestedTypesKey = requestedTypes.join("|");
  const adminKey = (getParam(["admin-key", "admin_key", "adminkey"]) || "").trim();
  const queryPreviewBlend = parseBool(getParam(["blend", "preview-blend", "previewBlend"]), false);
  const queryPreviewTransparent = parseBool(getParam(["transparent", "preview-transparent", "previewTransparent"]), false);
  const effectivePreviewBlend = previewBlend || queryPreviewBlend;
  const effectivePreviewTransparent = previewTransparent || queryPreviewTransparent;
  const configuredAdminKey =
    (process.env.NEXT_PUBLIC_AUDIO_ADMIN_KEY || process.env.NEXT_PUBLIC_QUOTES_ADMIN_KEY || "").trim();
  const hasAdminAccess = Boolean(configuredAdminKey) && adminKey === configuredAdminKey;

  const defaultPalette =
    layout === "large"
      ? { bg: "#081538", text: "#e8edff", accent: "#2ea4ff" }
      : layout === "medium"
        ? { bg: "#f4b6cd", text: "#7a133e", accent: "#931547" }
        : { bg: "#ececef", text: "#253452", accent: "#d54e84" };

  const accent = normalizeHex(getParam(["accent"]), defaultPalette.accent);
  const bg = normalizeHex(getParam(["bg", "background"]), defaultPalette.bg);
  const text = normalizeHex(getParam(["text", "text-color", "textColor"]), defaultPalette.text);

  const singleTrack = useMemo<Track | null>(() => {
    if (!sourceUrl) return null;
    return {
      src: sourceUrl,
      title,
      artist,
      cover,
    };
  }, [sourceUrl, title, artist, cover]);

  const hexToRgb = (h: string) => {
    const hex = h.replace('#', '');
    const bigint = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  };

  const isColorDark = (hex: string) => {
    try {
      const { r, g, b } = hexToRgb(hex);
      // Perceived luminance
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    if (explicitLayout) return;
    const target = containerRef.current;
    if (!target) return;

    const pickAutoLayout = (width: number): PlayerLayout => {
      if (width < 430) return "small";
      if (width < 620) return "medium";
      return "large";
    };

    const update = () => {
      const width = target.clientWidth;
      if (!width) return;
      setAutoLayout((prev) => {
        const next = pickAutoLayout(width);
        return prev === next ? prev : next;
      });
    };

    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(target);
    return () => observer.disconnect();
  }, [explicitLayout]);

  useEffect(() => {
    let canceled = false;

    async function loadTracks() {
      setError(null);
      if (singleTrack) {
        setTracks([singleTrack]);
        setActiveIndex(0);
        return;
      }

      if (!dataUrl) {
        setTracks([]);
        setError("Add src=<audio file> or data=<playlist json url>.");
        return;
      }

      setLoading(true);
      try {
        let fetchUrl = toPlayablePlaylistUrl(dataUrl);
        // For internal playlist API, append filter params
        if (fetchUrl.includes("/api/audio/playlist")) {
          const url = new URL(fetchUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
          if (requestedCategories.length) url.searchParams.set("category", requestedCategories.join(","));
          if (requestedTypes.length) url.searchParams.set("type", requestedTypes.join(","));
          if (adminKey) url.searchParams.set("admin-key", adminKey);
          fetchUrl = url.pathname + url.search;
        }
        const response = await fetch(fetchUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to fetch playlist JSON.");
        }
        const payload = (await response.json()) as unknown;
        const parsedTracks = parseTracksPayload(payload);
        if (!parsedTracks.length) {
          throw new Error("Playlist JSON has no valid tracks.");
        }
        if (!canceled) {
          setTracks(parsedTracks);
          setActiveIndex(Math.min(startIndex, parsedTracks.length - 1));
        }
      } catch (err) {
        if (!canceled) {
          const message = err instanceof Error ? err.message : "Could not load datasource.";
          setError(message);
          setTracks([]);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    loadTracks();
    return () => {
      canceled = true;
      setLoading(false);
    };
  }, [dataUrl, singleTrack, startIndex, sourceUrl, layout, instance, requestedCategoriesKey, requestedTypesKey, adminKey]);

  useEffect(() => {
    setVolume(initialVolume);
  }, [initialVolume]);

  useEffect(() => {
    setSelectedCategories(requestedCategories);
  }, [requestedCategoriesKey, dataUrl, instance]);

  useEffect(() => {
    setSelectedTypes(requestedTypes);
  }, [requestedTypesKey, dataUrl, instance]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  const accessibleTracks = useMemo(() => {
    if (hasAdminAccess) return tracks;
    return tracks.filter((track) => {
      const category = normalizeCategory(track.category);
      const type = normalizeType(track.type);
      return canAccessTrackWithoutAdmin(category, type);
    });
  }, [tracks, hasAdminAccess]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    accessibleTracks.forEach((track) => {
      const category = normalizeCategory(track.category);
      if (category) set.add(category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accessibleTracks]);

  useEffect(() => {
    setSelectedCategories((prev) => prev.filter((category) => categories.includes(category)));
  }, [categories]);

  useEffect(() => {
    setSelectedTypes((prev) => prev.filter((type) => {
      const categoryScope = selectedCategories.length ? selectedCategories : categories;
      const allowed = new Set<string>();
      accessibleTracks.forEach((track) => {
        const category = normalizeCategory(track.category);
        const normalizedType = normalizeType(track.type);
        if (!normalizedType) return;
        if (categoryScope.length && !categoryScope.includes(category)) return;
        allowed.add(normalizedType);
      });
      return allowed.has(type);
    }));
  }, [accessibleTracks, categories, selectedCategories]);

  const availableTypeOptions = useMemo(() => {
    const set = new Set<string>();
    accessibleTracks.forEach((track) => {
      const category = normalizeCategory(track.category);
      const type = normalizeType(track.type);
      if (!type) return;
      if (selectedCategories.length && !selectedCategories.includes(category)) return;
      set.add(type);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accessibleTracks, selectedCategories]);

  const filteredTracks = useMemo(() => {
    return accessibleTracks.filter((track) => {
      const category = normalizeCategory(track.category);
      const type = normalizeType(track.type);
      if (selectedCategories.length && !selectedCategories.includes(category)) return false;
      if (selectedTypes.length && !selectedTypes.includes(type)) return false;
      return true;
    });
  }, [accessibleTracks, selectedCategories, selectedTypes]);

  useEffect(() => {
    if (!filteredTracks.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex < filteredTracks.length) return;
    setActiveIndex(Math.max(0, filteredTracks.length - 1));
  }, [filteredTracks, activeIndex]);

  const activeTrack = filteredTracks[activeIndex] ?? null;
  const activeTrackCover = activeTrack?.cover || "";
  const artworkCover = activeTrack ? `/api/audio/artwork?url=${encodeURIComponent(activeTrack.src)}` : "";
  const coverImage = activeTrack
    ? singleTrack
      ? cover || activeTrackCover || artworkCover || DEFAULT_COVER
      : activeTrackCover || artworkCover || cover || DEFAULT_COVER
    : cover || DEFAULT_COVER;
  const playbackStateLabel = !activeTrack ? "" : isBuffering ? "Buffering" : isPlaying ? "Playing now" : "Ready to play";

  const playTrackAt = useCallback((index: number) => {
    if (index < 0 || index >= filteredTracks.length) return;
    setActiveIndex(index);
    setIsPlaying(true);
  }, [filteredTracks]);

  const nextTrack = useCallback(() => {
    if (!filteredTracks.length) return;
    if (activeIndex < filteredTracks.length - 1) {
      playTrackAt(activeIndex + 1);
      return;
    }
    if (loopMode === "playlist") {
      playTrackAt(0);
    }
  }, [filteredTracks.length, activeIndex, loopMode, playTrackAt]);

  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!filteredTracks.length) return;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (activeIndex > 0) {
      playTrackAt(activeIndex - 1);
      return;
    }
    if (loopMode === "playlist") {
      playTrackAt(filteredTracks.length - 1);
    }
  }, [filteredTracks.length, activeIndex, loopMode, playTrackAt]);

  const handleCoverError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.src !== DEFAULT_COVER) {
      target.src = DEFAULT_COVER;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onSeeking = () => setIsBuffering(true);
    const onSeeked = () => setIsBuffering(false);
    const onEnded = () => {
      if (loopMode === "track") {
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
        return;
      }
      if (filteredTracks.length > 1 && (loopMode === "playlist" || activeIndex < filteredTracks.length - 1)) {
        if (activeIndex < filteredTracks.length - 1) {
          nextTrack();
        } else if (loopMode === "playlist") {
          playTrackAt(0);
        }
        return;
      }
      setIsPlaying(false);
    };

    const onError = () => {
      const error = audio.error;
      if (error) {
        switch (error.code) {
          case 1: // MEDIA_ERR_ABORTED
            setError('Audio loading was aborted.');
            break;
          case 2: // MEDIA_ERR_NETWORK
            setError('Network error while loading the track through the proxy.');
            break;
          case 3: // MEDIA_ERR_DECODE
            setError('Audio format not supported or corrupted.');
            break;
          case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
            setError('Audio source could not be loaded. Try a different track URL or local file.');
            break;
          default:
            setError('Audio loading failed.');
        }
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onCanPlay);
    audio.addEventListener("seeking", onSeeking);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onCanPlay);
      audio.removeEventListener("seeking", onSeeking);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [activeIndex, loopMode, filteredTracks.length, nextTrack, playTrackAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;

    // Set the audio source through the proxy
    const src = toPlayableSrc(activeTrack.src, activeIndex);
    audio.src = src;
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(true);
    setError(null);
    setIsPlaying(false); // Reset to paused when track changes

    // Reset and load the audio
    audio.load();

    // Auto-play if enabled (only on track change, not on isPlaying change)
    if (autoplay) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            // Only log if it's not an abort error
            if (err?.name !== 'AbortError') {
              const message = err instanceof Error ? err.message : 'Unknown error';
              if (!message.includes('interrupted')) {
                console.error('Audio playback error:', message);
              }
            }
          });
      }
    }
  }, [activeTrack, autoplay, activeIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    
    if (audio.paused) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            if (err?.name !== 'AbortError' && !err?.message?.includes('interrupted')) {
              console.error('Play failed:', err);
            }
          });
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const updateSmallSeekHover = (clientX: number) => {
    const seekArea = smallSeekRef.current;
    if (!seekArea || duration <= 0) return;
    const rect = seekArea.getBoundingClientRect();
    const offset = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = rect.width > 0 ? (offset / rect.width) * 100 : 0;
    const time = duration * (pct / 100);
    setSeekHoverPct(pct);
    setSeekHoverLabel(formatTime(time));
  };

  const commitSmallSeek = () => {
    if (seekHoverPct == null || duration <= 0) return;
    onSeek(duration * (seekHoverPct / 100));
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentFilteredIndex = activeTrack ? activeIndex : -1;
  const canGoPrevious = currentFilteredIndex > 0 || loopMode === "playlist";
  const canGoNext = currentFilteredIndex < filteredTracks.length - 1 || loopMode === "playlist";

  const computedBg = useMemo(() => {
    if (effectivePreviewTransparent) return isColorDark(bg) ? "#20020220" : "#ffffff";
    if (effectivePreviewBlend) return "transparent";
    return bg;
  }, [bg, effectivePreviewTransparent, effectivePreviewBlend]);

  const shellStyle: CSSProperties & Record<string, string | number> = {
    backgroundColor: computedBg,
    color: text,
    "--audio-accent": accent,
    "--audio-text": text,
    borderRadius: layout === "small" ? 22 : 20,
    boxShadow: effectivePreviewBlend
      ? "none"
      : layout === "large"
      ? "0 26px 60px rgba(4, 10, 30, 0.46), 0 2px 0 rgba(255, 255, 255, 0.05) inset"
      : "0 18px 40px rgba(16, 24, 40, 0.24), 0 1px 0 rgba(255, 255, 255, 0.05) inset",
    width: "100%",
    maxWidth: layout === "small" ? 800 : layout === "medium" ? 420 : 500,
  };

  const controlButton =
    "inline-flex h-11 w-11 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div ref={containerRef} className="flex w-full items-center justify-center p-2">
      <audio ref={audioRef} preload="metadata" />

      <section className={`audio-shell ${layout}`} style={{ ...shellStyle, position: "relative" }}>
        {(loading || isBuffering) && (
          <div
            className="absolute inset-0 rounded-[inherit] bg-black/40 backdrop-blur-sm transition-opacity duration-200"
            style={{ pointerEvents: "none" }}
          />
        )}

        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-4 text-center">
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#08102b]/70 px-5 py-4 backdrop-blur-sm">
              <Loader size={28} className="animate-spin" style={{ color: text }} />
              <p className="text-sm" style={{ opacity: 0.75 }}>Loading playlist...</p>
            </div>
          </div>
        ) : null}
        {isBuffering && activeTrack && !error ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-4 text-center">
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#08102b]/70 px-5 py-4 backdrop-blur-sm">
              <Play size={24} className="animate-pulse" fill="currentColor" style={{ color: text }} />
              <p className="text-xs" style={{ opacity: 0.72 }}>Loading track...</p>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-3 text-xs backdrop-blur-sm" style={{ color: text }}>
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="flex-shrink-0" />
              <div>
                <p className="font-semibold">Error</p>
                <p className="mt-1 opacity-85">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !activeTrack ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 min-h-[140px] text-center">
            <Music2 size={40} style={{ color: text, opacity: 0.4 }} />
            <div>
              <p className="text-sm font-medium" style={{ opacity: 0.9 }}>Audio Player</p>
              <p className="text-xs mt-1" style={{ opacity: 0.6 }}>Add src or data URL to play</p>
            </div>
          </div>
        ) : null}

        {activeTrack && layout === "small" ? (
          <div className="small-layout">
            <div
              key={`bg-${activeTrack.src}-${activeIndex}`}
              className="small-bg-artwork"
              style={{ backgroundImage: `url(${coverImage})` }}
            />
            <div className="small-bg-layer" />

            <div className={`small-header ${isPlaying ? "active" : ""}`}>
              <div key={`meta-${activeTrack.src}-${activeIndex}`} className="small-title-wrap" id="album-name">
                <h3>{activeTrack.title}</h3>
                <p id="track-name">{activeTrack.artist}</p>
                {filteredTracks.length > 0 && (
                  <p id="track-number" style={{ fontSize: '0.72rem', color: text, marginTop: '6px', opacity: 0.7, fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                    Track {currentFilteredIndex + 1} of {filteredTracks.length}
                  </p>
                )}
              </div>
              <div className={`small-time-row ${duration > 0 ? "active" : ""}`}>
                <span id="current-time" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{formatTime(currentTime)}</span>
                <span id="track-length" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{formatTime(duration)}</span>
              </div>

              {/* <div className="small-status-strip">
                <span className={isPlaying ? "is-live" : ""}>{playbackStateLabel}</span>
                <span>Track {currentFilteredIndex + 1} of {filteredTracks.length}</span>
                <span>{formatTime(duration)}</span>
              </div> */}

              <div
                ref={smallSeekRef}
                className="small-seek-area"
                onMouseMove={(e) => updateSmallSeekHover(e.clientX)}
                onMouseLeave={() => setSeekHoverPct(null)}
                onClick={commitSmallSeek}
              >
                <div className="small-seek-hover" style={{ width: `${seekHoverPct ?? 0}%` }} />
                <div className="small-seek-bar" style={{ width: `${progress}%` }} />
                {seekHoverPct != null ? (
                  <div className="small-seek-time" style={{ left: `calc(${seekHoverPct}% - 21px)` }}>
                    {seekHoverLabel}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="small-controls" id="player-content">
              <div className={`small-album-art ${isPlaying ? "active" : ""} ${isBuffering ? "buffering" : ""}`}>
                <img
                  key={`art-${activeTrack.src}-${activeIndex}`}
                  src={coverImage}
                  alt={activeTrack.title}
                  className="active"
                  loading="eager"
                  decoding="async"
                  onError={handleCoverError}
                />
                <div className="small-buffer-box">Buffering ...</div>
              </div>

              <button type="button" className={`${controlButton} small-control-button`} onClick={previousTrack} disabled={!canGoPrevious}>
                <SkipBack size={30} fill="currentColor" color={text} />
              </button>
              <button
                type="button"
                className={`${controlButton} play-main small-control-button`}
                onClick={togglePlay}
                style={{ color: accent }}
              >
                {isPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
              </button>
              <button type="button" className={`${controlButton} small-control-button`} onClick={nextTrack} disabled={!canGoNext}>
                <SkipForward size={30} fill="currentColor" color={text} />
              </button>
            </div>
          </div>
        ) : null}

        {activeTrack && layout === "medium" ? (
          <div className="medium-layout">
            <img src={coverImage} alt={activeTrack.title} className="cover-card" loading="eager" decoding="async" onError={handleCoverError} />
            <div className="px-6 pb-4 pt-5">
              <h3 className="text-4xl font-black leading-[1.04] tracking-tight">{activeTrack.title}</h3>
              <p className="mt-2 text-lg opacity-85">{activeTrack.artist}</p>
              {/* <div className="mt-4 flex flex-wrap gap-2 items-center">
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold opacity-80" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                  🕐 {formatTime(duration)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold opacity-80" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                  📍 Track {currentFilteredIndex + 1}/{filteredTracks.length}
                </span>
                {playbackStateLabel ? (
                  <span className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold ${isPlaying ? "bg-emerald-400/20" : "bg-white/15"} opacity-90`}>
                    {playbackStateLabel}
                  </span>
                ) : null}
              </div> */}
              {/* <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] opacity-55">Now playing</p>
                    <p className="mt-1 font-semibold opacity-95">{activeTrack.title}</p>
                  </div>
                  <p className="text-right text-xs opacity-75">{activeTrack.artist}</p>
                </div>
                {(activeTrack.category || activeTrack.type) && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                    {activeTrack.category && (
                      <span className="inline-block rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${accent}30`, color: accent }}>
                        🎵 {activeTrack.category}
                      </span>
                    )}
                    {activeTrack.type && (
                      <span className="inline-block rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${accent}20`, color: accent }}>
                        ⚡ {activeTrack.type}
                      </span>
                    )}
                  </div>
                )}
              </div> */}
            </div>
            <div className="mt-4 px-6 pb-2 text-sm opacity-85 flex justify-between" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="px-6">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                value={Math.min(currentTime, Math.max(duration, 1))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="progress"
                style={{ accentColor: accent }}
              />
            </div>
            <div className="px-6 pb-6 pt-4 relative medium-controls-wrap">
              <div className="medium-controls-center">
                <button type="button" className={controlButton} onClick={previousTrack} disabled={!canGoPrevious}>
                  <SkipBack size={24} fill="currentColor" color={text} />
                </button>
                <button
                  type="button"
                  className={`${controlButton} play-main`}
                  onClick={togglePlay}
                  style={{ color: accent }}
                >
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                <button type="button" className={controlButton} onClick={nextTrack} disabled={!canGoNext}>
                  <SkipForward size={24} fill="currentColor" color={text} />
                </button>
              </div>
              <div className="medium-controls-side" aria-hidden>
                <button type="button" className={controlButton} onClick={toggleMute}>
                  {isMuted ? <VolumeX size={20} fill="currentColor" color={text} /> : <Volume2 size={20} fill="currentColor" color={text} />}
                </button>
                {/* <button type="button" className={controlButton} onClick={() => setQueueVisible((v) => !v)} aria-pressed={queueVisible} aria-label="Toggle queue">
                  <List size={20} fill="currentColor" color={text} />
                </button> */}
                
              </div>
            </div>
          </div>
        ) : null}

        {activeTrack && layout === "large" ? (
          <div className="large-layout">
            <img src={coverImage} alt={activeTrack.title} className="cover-large" loading="eager" decoding="async" onError={handleCoverError} />

            <div className="px-6 pt-5">
              <h3 className="text-[2rem] font-bold leading-tight">{activeTrack.title}</h3>
              <p className="mt-1 text-lg opacity-85">{activeTrack.artist}</p>
              {/* <div className="mt-3 flex flex-wrap gap-4 text-sm opacity-75">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-50 mb-1">Duration</p>
                  <p className="font-semibold" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{formatTime(duration)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-50 mb-1">Track {currentFilteredIndex + 1} of {filteredTracks.length}</p>
                </div>
                {playbackStateLabel ? (
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-50 mb-1">State</p>
                    <p className={`font-semibold ${isPlaying ? "text-emerald-200" : ""}`}>{playbackStateLabel}</p>
                  </div>
                ) : null}
              </div> */}
              {/* <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-55">Now playing</p>
                <p className="mt-1 text-sm font-semibold opacity-95">{activeTrack.title}</p>
                <p className="mt-1 text-sm opacity-80">{activeTrack.artist}</p>
                {(activeTrack.category || activeTrack.type) && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                    {activeTrack.category && (
                      <span className="inline-block rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${accent}30`, color: accent }}>
                        🎵 {activeTrack.category}
                      </span>
                    )}
                    {activeTrack.type && (
                      <span className="inline-block rounded px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${accent}20`, color: accent }}>
                        ⚡ {activeTrack.type}
                      </span>
                    )}
                  </div>
                )}
              </div> */}
            </div>

            <div className="px-6 pb-1 pt-4 text-sm opacity-90 flex justify-between" style={{ fontFamily: '"Karla", -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="px-6">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                value={Math.min(currentTime, Math.max(duration, 1))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="progress"
                style={{ accentColor: accent }}
              />
            </div>

            <div className="large-controls-wrap px-6 py-5">
              <div className="large-controls-primary">
                <button type="button" className={controlButton} onClick={previousTrack} disabled={!canGoPrevious}>
                  <SkipBack size={28} fill="currentColor" color={text} />
                </button>
                <button
                  type="button"
                  className={`${controlButton} play-main`}
                  onClick={togglePlay}
                  style={{ color: accent }}
                >
                  {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
                </button>
                <button type="button" className={controlButton} onClick={nextTrack} disabled={!canGoNext}>
                  <SkipForward size={28} fill="currentColor" color={text} />
                </button>
              </div>

              <div className="large-controls-secondary">
                <button type="button" className={controlButton} onClick={toggleMute}>
                  {isMuted ? <VolumeX size={24} fill="currentColor" color={text} /> : <Volume2 size={24} fill="currentColor" color={text} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    if (audioRef.current) audioRef.current.muted = false;
                    setIsMuted(false);
                  }}
                  className="large-volume-slider"
                  style={{ accentColor: accent }}
                />
                  <button type="button" className={controlButton} onClick={() => setQueueVisible((v) => !v)} aria-pressed={queueVisible} aria-label="Toggle queue">
                  <List size={24} fill="currentColor" color={text} />
                </button>
              </div>
            </div>

            {queueVisible && filteredTracks.length > 1 ? (
              <div className="large-queue-panel">
                {/* <div className="filter-controls">
                  <div className="filter-group">
                    <span className="filter-label">Category:</span>
                    <div className="filter-buttons">
                      <button type="button" className={`filter-btn ${!selectedCategories.length ? 'active' : ''}`} onClick={() => setSelectedCategories([])}>All</button>
                      {categories.map((cat) => (
                        <button key={cat} type="button" className={`filter-btn ${selectedCategories.includes(cat) ? 'active' : ''}`} onClick={() => setSelectedCategories((prev) => toggleSelection(prev, cat))}>{cat}</button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-group">
                    <span className="filter-label">Type:</span>
                    <div className="filter-buttons">
                      <button type="button" className={`filter-btn ${!selectedTypes.length ? 'active' : ''}`} onClick={() => setSelectedTypes([])}>All</button>
                      {availableTypeOptions.map((typ) => (
                        <button key={typ} type="button" className={`filter-btn ${selectedTypes.includes(typ) ? 'active' : ''}`} onClick={() => setSelectedTypes((prev) => toggleSelection(prev, typ))}>{typ}</button>
                      ))}
                    </div>
                  </div>
                </div> */}
                <ul className="track-queue">
                  {filteredTracks.map((track, index) => {
                    const active = track.src === activeTrack?.src;
                    return (
                      <li key={`${track.src}-${index}`}>
                        <button type="button" className={active ? 'active' : ''} onClick={() => playTrackAt(index)}>
                          <img src={track.cover || `/api/audio/artwork?url=${encodeURIComponent(track.src)}`} alt={track.title} />
                          <span>
                            <strong>{track.title}</strong>
                            <em>{track.artist}</em>
                            {/* {(track.category || track.type) && (
                              <span className="track-metadata" style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '6px', display: 'block', marginTop: '2px' }}>
                                {track.category && <span>[{track.category}]</span>}
                                {track.type && <span style={{ marginLeft: '4px' }}>({track.type})</span>}
                              </span>
                            )} */}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

          </div>
        ) : null}
      </section>

      <style jsx>{`
        .audio-shell {
          overflow: hidden;
          position: relative;
        }

        .audio-shell .progress {
          width: 100%;
        }

        .audio-shell button {
          color: inherit;
        }

        .small-layout {
          padding: 18px;
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }

        .small-bg-artwork {
          position: absolute;
          // inset: -28px;
          // background-size: cover;
          // background-position: center;
          // filter: blur(28px);
          // opacity: 0.34;
          z-index: 0;
          animation: bgFadeIn 440ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .small-bg-layer {
          position: absolute;
          inset: 0;
          // background: rgba(255, 255, 255, 0.48);
          background: #191919;
          // background: rgba(25 25 25 / 0)rent;
          z-index: 0;
        }

        .small-header {
          margin: 0 17px;
          // margin-left: 174px;
          // border-radius: 15px 15px 0 0;
          border-radius: 1rem 1rem 0 0;
          padding: 13px 22px 10px;
          // padding-left: 28px;
          padding-left: 174px;
          background: #fff7f7;
          backdrop-filter: blur(4px);
          min-height: 96px;
          position: relative;
          z-index: 1;
          // top: 82px;
          top: 111px;
          opsity: 0;
  visibility: hidden;
          transition:
            top 420ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1),
            background-color 280ms ease;
        }

        .small-header.active {
          top: 0;
          opsity: 1;
  visibility: visible;
          
          box-shadow: 0 18px 40px rgba(22, 27, 43, 0.16);
        }

        .small-title-wrap {
          animation: metaFadeIn 380ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, opacity;
        }

        .small-title-wrap h3 {
          margin: 0;
          color: #54576f;
          font-size: 1.06rem;
          line-height: 1.15;
          font-weight: 700;
        }

        .small-title-wrap p {
          margin: 3px 0 11px;
          font-size: 0.81rem;
          color: #acaebd;
          opacity: 1;
          font-weight: 600;
        }

        .small-time-row {
          margin-bottom: 3px;
          display: flex;
          justify-content: space-between;
          height: 12px;
          overflow: hidden;
        }

        .small-time-row span {
          color: transparent;
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 9px;
          background: #ffe8ee;
          transition: 0.2s ease;
        }

        .small-time-row.active span {
          color: var(--audio-accent);
          background: transparent;
        }

        .small-status-strip {
          margin-bottom: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          color: #6f7384;
          font-size: 0.71rem;
          line-height: 1.25;
        }

        .small-status-strip span {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .small-status-strip .is-live {
          color: var(--audio-accent);
          font-weight: 700;
        }

        .small-seek-area {
          position: relative;
          height: 4px;
          border-radius: 4px;
          background: #ffe8ee;
          cursor: pointer;
          transition: transform 260ms ease, box-shadow 260ms ease;
        }

        .small-seek-area:hover {
          transform: translateY(-0.5px);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
        }

        .small-seek-hover,
        .small-seek-bar {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          border-radius: 4px;
        }

        .small-seek-hover {
          background: #3b3d50;
          opacity: 0.18;
          z-index: 2;
        }

        .small-seek-bar {
          background: var(--audio-accent);
          z-index: 1;
          transition: width 180ms linear;
        }

        .small-seek-time {
          position: absolute;
          top: -29px;
          color: #fff;
          font-size: 0.72rem;
          white-space: pre;
          padding: 5px 6px;
          border-radius: 4px;
          background-color: #3b3d50;
          z-index: 3;
        }

        .small-controls {
          margin-top: 0;
          border-radius: 15px;
          background: #ffffff;
          min-height: 104px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
          // border: 1px solid #dce0e6;
          box-shadow: 0 24px 44px rgba(30, 41, 59, 0.14);
          padding: 0 16px;
          z-index: 2;
          transition:
            transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 360ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .small-album-art {
          position: absolute;
          top: -40px;
          left: 40px;
          width: 132px;
          height: 132px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 0 0 5px #fff;
          transition:
            top 420ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, top;
        }

        .small-album-art.active {
          // top: -70px;
          box-shadow: 0 0 0 4px #fff7f7, 0 30px 50px -15px #afb7c1;
          transform: translateY(-25px) scale(1.015);
        }

        .small-album-art img {
          // border-radius: 100%;
          width: 100%;
          height: 100%;
          object-fit: cover;
          // object-fit: none;
          display: block;
          animation: artSwapIn 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .small-album-art.active img {
          // animation: artSwapIn 420ms cubic-bezier(0.22, 1, 0.36, 1), rotateAlbumArt 5.8s linear infinite;
        }

        .small-album-art.buffering img {
          opacity: 0.72;
          filter: blur(1.2px);
        }

        .small-buffer-box {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.72rem;
          font-weight: 700;
          color: #1f1f1f;
          padding: 5px 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.35);
          opacity: 0;
          transition: opacity 0.15s ease;
          z-index: 3;
        }

        .small-album-art.buffering .small-buffer-box {
          opacity: 1;
        }

        .small-control-button {
          // background: #ffffff;
          // color: #d6dee7;
          border-radius: 8px;
          transform: translateY(0);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
          transition:
            background-color 220ms ease,
            color 220ms ease,
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms ease;
        }

        .small-control-button:hover {
          background: #d6d6de;
          color: #ffffff;
          // transform: translateY(-2px);
          // box-shadow: 0 10px 20px rgba(45, 52, 76, 0.18);
        }

        .small-control-button:active {
          // transform: translateY(-1px) scale(0.98);
        }

        .small-controls .play-main.small-control-button {
          color: var(--audio-accent);
        }

        .play-main {
          // box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.36);
          transition: background-color 200ms ease;
        }

        .play-main:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.15);
        }

        @keyframes rotateAlbumArt {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes artSwapIn {
          from {
            opacity: 0;
            transform: scale(1.06);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @media (max-width: 400px) {
          .small-layout {
            padding: 12px;
          }

          .small-header {
            margin: 0 12px;
            padding: 10px 16px 8px;
            padding-left: 120px;
            min-height: 80px;
            border-radius: 12px 12px 0 0;
          }

          .small-title-wrap h3 {
            font-size: 0.9rem;
            line-height: 1.1;
          }

          .small-title-wrap p {
            margin: 2px 0 8px;
            font-size: 0.7rem;
          }

          .small-controls {
            min-height: 90px;
            padding: 0 12px;
            gap: 6px;
          }

          .small-album-art {
            width: 100px;
            height: 100px;
            left: 12px;
            top: -35px;
            box-shadow: 0 0 0 4px #fff;
          }

          .small-album-art.active {
            transform: translateY(-18px) scale(1.01);
          }

          .small-control-button {
            height: 36px !important;
            width: 36px !important;
          }

          .play-main {
            height: 42px !important;
            width: 42px !important;
          }
        }

        @media (max-width: 320px) {
          .small-layout {
            padding: 10px;
          }

          .small-header {
            margin: 0 10px;
            padding: 8px 12px 6px;
            padding-left: 100px;
            min-height: 72px;
          }

          .small-title-wrap h3 {
            font-size: 0.8rem;
          }

          .small-title-wrap p {
            font-size: 0.65rem;
            margin: 2px 0 6px;
          }

          .small-controls {
            min-height: 80px;
            padding: 0 10px;
            gap: 4px;
          }

          .small-album-art {
            width: 85px;
            height: 85px;
            left: 10px;
            top: -30px;
          }

          .small-control-button {
            height: 32px !important;
            width: 32px !important;
          }

          .play-main {
            height: 38px !important;
            width: 38px !important;
          }
        }

        @keyframes bgFadeIn {
          from {
            opacity: 0;
            transform: scale(1.03);
          }
          to {
            opacity: 0.34;
            transform: scale(1);
          }
        }

        @keyframes metaFadeIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .medium-layout {
          padding-top: 8px;
          position: relative;
          z-index: 1;
        }

        .cover-card {
          width: calc(100% - 36px);
          margin: 18px auto 0;
          border-radius: 16px;
          object-fit: contain;
          height: auto;
          box-shadow: 0 10px 20px rgba(83, 19, 49, 0.24);
        }

        .large-layout {
          padding: 14px 0 16px;
          position: relative;
          z-index: 1;
        }

        .cover-large {
          width: calc(100% - 36px);
          margin: 6px auto 0;
          border-radius: 18px;
          object-fit: cover;
          aspect-ratio: 1 / 1;
        }

        .medium-controls-wrap {
          position: relative;
        }

        .medium-controls-center {
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: center;
        }

        .medium-controls-side {
          position: absolute;
          right: 18px;
          top: 20%;
          // transform: translateY(-50%);
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .large-controls-wrap {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }

        .large-controls-primary {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .large-controls-secondary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .large-volume-slider {
          width: 100%;
          max-width: 220px;
        }

        .large-queue-panel {
          margin: 6px 18px 0;
          padding: 10px 0 12px;
          background: linear-gradient(180deg, rgba(8, 16, 43, 0.08), rgba(8, 16, 43, 0.03));
          border-radius: 0 0 18px 18px;
        }

        .track-queue {
          margin: 6px 0 0;
          padding: 10px .45rem 16px 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 260px;
          overflow: hidden auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-color: transparent transparent;
          --sidebar-mask-fade: 1rem;
          min-height: 0;
          -webkit-mask-image: linear-gradient(to bottom, #0000 0, #000 var(--sidebar-mask-fade), #000 calc(100% - var(--sidebar-mask-fade)), #0000 100%);
          mask-image: linear-gradient(to bottom, #0000 0, #000 var(--sidebar-mask-fade), #000 calc(100% - var(--sidebar-mask-fade)), #0000 100%);
          -webkit-mask-size: 100% 100%;
          mask-size: 100% 100%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          scroll-padding-top: .45rem;
          scroll-padding-bottom: 2rem;
          transition: scrollbar-color .2s, border-color .2s;
        }

        .track-queue::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .filter-controls {
          margin: 12px 14px 8px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.09);
        }

        .filter-group {
          margin-bottom: 12px;
        }

        .filter-group:last-child {
          margin-bottom: 0;
        }

        .filter-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.6;
          margin-bottom: 6px;
        }

        .filter-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .filter-btn {
          padding: 5px 10px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: inherit;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .filter-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .filter-btn.active {
          background: var(--audio-accent);
          color: #fff;
          border-color: var(--audio-accent);
        }

        .track-queue button {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          padding: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          transition: background 0.2s ease;
        }

        .track-queue button:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .track-queue button.active {
          background: rgba(46, 164, 255, 0.18);
          border-color: rgba(46, 164, 255, 0.5);
        }

        .track-queue img {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
        }

        .track-queue strong,
        .track-queue em {
          display: block;
          line-height: 1.25;
        }

        .track-queue strong {
          font-size: 0.95rem;
          font-style: normal;
          font-weight: 600;
        }

        .track-queue em {
          font-size: 0.8rem;
          opacity: 0.76;
          font-style: normal;
        }

        @media (max-width: 420px) {
          .medium-layout,
          .large-layout {
            padding-top: 4px;
            padding-bottom: 10px;
          }

          .cover-card,
          .cover-large {
            width: calc(100% - 24px);
            margin-left: auto;
            margin-right: auto;
            border-radius: 14px;
          }

          .medium-layout > .px-6,
          .large-layout > .px-6 {
            padding-left: 12px;
            padding-right: 12px;
          }

          .medium-layout h3 {
            font-size: 1.45rem;
            line-height: 1.08;
          }

          .medium-layout p.mt-2 {
            font-size: 0.92rem;
          }

          .medium-controls-wrap,
          .px-6.py-5.flex.flex-wrap.items-center.justify-between.gap-4 {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .medium-controls-wrap {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .medium-controls-center {
            justify-content: center;
            flex-wrap: wrap;
          }

          .medium-controls-side {
            position: static;
            transform: none;
            justify-content: center;
            width: 100%;
          }

          .large-layout .px-6.pt-5 h3,
          .large-layout h3.text-\[2rem\] {
            font-size: 1.35rem;
            line-height: 1.1;
          }

          .large-layout .mt-3.flex.flex-wrap.gap-4.text-sm.opacity-75 {
            gap: 10px;
            row-gap: 8px;
            font-size: 0.78rem;
          }

          .large-layout .flex.items-center.gap-3 {
            flex-wrap: wrap;
            gap: 8px;
          }

          .large-layout .w-28 {
            width: 100%;
          }

          .large-queue-panel {
            margin: 6px 12px 0;
          }

          .filter-controls {
            margin: 10px 0 8px;
            padding: 10px;
          }

          .filter-buttons {
            gap: 5px;
          }

          .filter-btn {
            padding: 5px 8px;
            font-size: 0.75rem;
          }

          .track-queue button {
            padding: 7px;
            gap: 8px;
          }

          .track-queue img {
            width: 40px;
            height: 40px;
          }

          .track-queue strong {
            font-size: 0.88rem;
          }

          .track-queue em {
            font-size: 0.74rem;
          }
        }

        @media (max-width: 320px) {
          .medium-layout,
          .large-layout {
            padding-top: 2px;
          }

          .cover-card,
          .cover-large {
            width: calc(100% - 16px);
            border-radius: 12px;
          }

          .medium-layout h3,
          .large-layout h3 {
            font-size: 1.2rem;
          }

          .medium-layout p.mt-2,
          .large-layout p.mt-1.text-lg.opacity-85 {
            font-size: 0.84rem;
          }

          .medium-controls-center,
          .medium-controls-side,
          .px-6.py-5.flex.flex-wrap.items-center.justify-between.gap-4 {
            gap: 6px;
          }

          .medium-controls-wrap {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }

          .large-queue-panel {
            margin-left: 10px;
            margin-right: 10px;
          }

          .filter-controls {
            padding: 8px;
          }

          .track-queue button {
            border-radius: 10px;
          }
        }

        @media (max-width: 880px) {
          .small-layout {
            padding: 12px;
          }

          .small-header {
            margin-left: 0;
            border-radius: 15px;
            top: 0 !important;
            padding: 12px;
            min-height: 98px;
          }

          .small-title-wrap h3 {
            font-size: 0.95rem;
          }

          .small-title-wrap p {
            font-size: 0.76rem;
            margin-bottom: 9px;
          }

          .small-controls {
            margin-top: 10px;
            padding: 12px;
            min-height: 102px;
            justify-content: flex-start;
            gap: 10px;
            padding-left: 152px;
          }

          .small-album-art {
            width: 120px;
            height: 120px;
            left: 12px;
            top: 12px;
            box-shadow: 0 0 0 5px #fff;
          }

          .small-album-art.active {
            top: 0;
          }
        }
      `}</style>
    </div>
  );
}
