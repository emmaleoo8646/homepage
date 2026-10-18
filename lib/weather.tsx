"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Live weather via Open-Meteo (https://open-meteo.com/). No API key, no quota,
 * CORS-friendly — the only realistic option for HiTab's static-export setup
 * (any key-required provider would be baked into the client bundle).
 *
 * Location resolution order:
 *   1. localStorage cache (`hitab:weather:location`)
 *   2. Silent IP geolocation via ipapi.co (no permission prompt, ~city-level
 *      accuracy — good enough for a personal startpage)
 *   3. Default "广州" placeholder so the UI never collapses
 *
 * The user can override at any time via the dialog:
 *   - Typing a city name in the search box → geocodes via Open-Meteo
 *   - Clicking "使用我的位置" → calls `navigator.geolocation` and stores
 *     precise lat/lon (browser prompts for permission once)
 */

export type WeatherStatus = "loading" | "live" | "failed" | "empty";
export type WeatherSource = "cached" | "ip" | "geo" | "manual" | "default";

export interface WeatherDay {
  date: string; // "YYYY-MM-DD"
  high: number;
  low: number;
  weatherCode: number;
}

export interface WeatherSnapshot {
  cityLabel: string;
  countryLabel?: string;
  timezone: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
    observedAt: string; // ISO
  };
  today: WeatherDay;
  tomorrow: WeatherDay;
  fetchedAt: number; // Date.now()
}

/**
 * Resolved location. `lat`/`lon` are optional because a manual city entry
 * always re-geocodes on demand and the default placeholder has no coords.
 */
export interface WeatherLocation {
  city: string;
  country?: string;
  lat?: number;
  lon?: number;
  source: WeatherSource;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const IP_GEO_URL = "https://ipapi.co/json/";
const CACHE_KEY = "hitab:weather:location";
const FETCH_TIMEOUT_MS = 8000;
const MEMO_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- WMO weather code → { label, icon } -------------------------------------
export const wmoMap: Record<
  number,
  { label: string; icon: ComponentType<LucideProps> }
> = {
  0: { label: "晴", icon: Sun },
  1: { label: "晴间多云", icon: CloudSun },
  2: { label: "多云", icon: CloudSun },
  3: { label: "阴", icon: Cloud },
  45: { label: "雾", icon: CloudFog },
  48: { label: "冰雾", icon: CloudFog },
  51: { label: "毛毛雨", icon: CloudDrizzle },
  53: { label: "毛毛雨", icon: CloudDrizzle },
  55: { label: "浓毛毛雨", icon: CloudDrizzle },
  56: { label: "冻毛毛雨", icon: CloudDrizzle },
  57: { label: "冻毛毛雨", icon: CloudDrizzle },
  61: { label: "小雨", icon: CloudRain },
  63: { label: "中雨", icon: CloudRain },
  65: { label: "大雨", icon: CloudRain },
  66: { label: "冻雨", icon: CloudRain },
  67: { label: "冻雨", icon: CloudRain },
  71: { label: "小雪", icon: CloudSnow },
  73: { label: "中雪", icon: CloudSnow },
  75: { label: "大雪", icon: CloudSnow },
  77: { label: "雪粒", icon: CloudSnow },
  80: { label: "阵雨", icon: CloudRain },
  81: { label: "阵雨", icon: CloudRain },
  82: { label: "强阵雨", icon: CloudRain },
  85: { label: "阵雪", icon: CloudSnow },
  86: { label: "强阵雪", icon: CloudSnow },
  95: { label: "雷暴", icon: CloudLightning },
  96: { label: "雷暴伴冰雹", icon: CloudLightning },
  99: { label: "雷暴伴冰雹", icon: CloudLightning },
};
export function wmoLabel(code: number): string {
  return wmoMap[code]?.label ?? "晴";
}
export function WmoIcon({
  code,
  ...rest
}: { code: number } & LucideProps) {
  const Icon = wmoMap[code]?.icon ?? Sun;
  return <Icon {...rest} />;
}

// --- Location resolution & persistence --------------------------------------
function readCachedLocation(): WeatherLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherLocation;
    if (typeof parsed.city !== "string" || !parsed.city.trim()) return null;
    return {
      city: parsed.city,
      country: parsed.country,
      lat: typeof parsed.lat === "number" ? parsed.lat : undefined,
      lon: typeof parsed.lon === "number" ? parsed.lon : undefined,
      source: parsed.source ?? "cached",
    };
  } catch {
    return null;
  }
}
function writeCachedLocation(loc: WeatherLocation): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(loc));
  } catch {
    /* localStorage may be disabled — non-fatal */
  }
}
export function clearCachedLocation(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* non-fatal */
  }
}

// --- IP geolocation (free, no key) -----------------------------------------
type IpGeoResult = {
  city?: string;
  country_name?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};
async function ipLookup(signal?: AbortSignal): Promise<WeatherLocation | null> {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const composed = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  try {
    const res = await fetch(IP_GEO_URL, { signal: composed });
    if (!res.ok) return null;
    const data = (await res.json()) as IpGeoResult;
    const city = data.city?.trim();
    const lat = typeof data.latitude === "number" ? data.latitude : undefined;
    const lon = typeof data.longitude === "number" ? data.longitude : undefined;
    if (!city || lat == null || lon == null) return null;
    return {
      city,
      country: data.country_name ?? data.country,
      lat,
      lon,
      source: "ip",
    };
  } catch {
    return null;
  }
}

// --- Forward geocoding via Open-Meteo ---------------------------------------
type GeoResult = {
  results?: Array<{
    name: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
};
async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<WeatherLocation | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const composed = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  try {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(
      trimmed,
    )}&count=1&language=zh&format=json`;
    const res = await fetch(url, { signal: composed });
    if (!res.ok) return null;
    const data = (await res.json()) as GeoResult;
    const top = data.results?.[0];
    if (!top) return null;
    return {
      city: top.name,
      country: top.country,
      lat: top.latitude,
      lon: top.longitude,
      source: "manual",
    };
  } catch {
    return null;
  }
}

// --- Browser geolocation ---------------------------------------------------
async function browserGeolocate(
  signal?: AbortSignal,
): Promise<WeatherLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (loc: WeatherLocation | null) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (signal?.aborted) {
          finish(null);
          return;
        }
        finish({
          city: "我的位置",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: "geo",
        });
      },
      () => finish(null), // permission denied / unavailable / timeout
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

// --- Forecast fetcher -------------------------------------------------------
type ForecastResult = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  timezone: string;
};

export async function fetchForecast(
  loc: WeatherLocation,
  signal?: AbortSignal,
): Promise<WeatherSnapshot | null> {
  let lat = loc.lat;
  let lon = loc.lon;
  let label = loc.city;
  let country = loc.country;

  // If we don't have coords (e.g. legacy cached entry) geocode by name.
  if (lat == null || lon == null) {
    const geo = await geocode(loc.city, signal);
    if (!geo) return null;
    lat = geo.lat;
    lon = geo.lon;
    label = geo.city;
    country = geo.country;
  }

  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const composed = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  try {
    const url =
      `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=2`;
    const res = await fetch(url, { signal: composed });
    if (!res.ok) return null;
    const fore = (await res.json()) as ForecastResult;

    const todayDate = fore.daily.time[0];
    const tomorrowDate = fore.daily.time[1];
    if (!todayDate || !tomorrowDate) return null;

    return {
      cityLabel: label,
      countryLabel: country,
      timezone: fore.timezone,
      current: {
        temperature: fore.current.temperature_2m,
        apparentTemperature: fore.current.apparent_temperature,
        humidity: fore.current.relative_humidity_2m,
        windSpeed: fore.current.wind_speed_10m,
        weatherCode: fore.current.weather_code,
        observedAt: fore.current.time,
      },
      today: {
        date: todayDate,
        high: fore.daily.temperature_2m_max[0],
        low: fore.daily.temperature_2m_min[0],
        weatherCode: fore.daily.weather_code[0],
      },
      tomorrow: {
        date: tomorrowDate,
        high: fore.daily.temperature_2m_max[1],
        low: fore.daily.temperature_2m_min[1],
        weatherCode: fore.daily.weather_code[1],
      },
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// --- Module-level singleton so concurrent mounts share the IP lookup -------
let sharedLocationPromise: Promise<WeatherLocation | null> | null = null;
function resolveSharedLocation(signal?: AbortSignal): Promise<WeatherLocation | null> {
  if (sharedLocationPromise) return sharedLocationPromise;
  sharedLocationPromise = (async () => {
    const cached = readCachedLocation();
    if (cached) return cached;
    const ip = await ipLookup(signal);
    if (ip) {
      writeCachedLocation(ip);
      return ip;
    }
    return null;
  })();
  return sharedLocationPromise;
}

// --- React hook -------------------------------------------------------------
export interface UseWeatherResult {
  status: WeatherStatus;
  data: WeatherSnapshot | null;
  error: string | null;
  location: WeatherLocation | null;
  refresh: () => void;
  /** Apply a manual city (geocodes + caches + refetches). */
  setCity: (name: string) => Promise<void>;
  /** Trigger browser geolocation prompt; on grant, refetches with precise coords. */
  useMyLocation: () => Promise<void>;
  /** Clear persisted location + reset to default. */
  reset: () => void;
}

const DEFAULT_LOCATION: WeatherLocation = {
  city: "广州",
  source: "default",
};

/**
 * Reactive weather subscription. Lifecycle:
 *   - On mount: read cache OR run shared IP geolocation, then fetch forecast.
 *   - 10-min memo: a fresh-enough snapshot for the same `location.cityLabel`
 *     is reused without a network round-trip.
 *   - `setCity(name)`: geocodes + caches + refetches.
 *   - `useMyLocation()`: prompts browser for precise coords.
 *   - `refresh()`: forces a forecast refetch.
 */
export function useWeather(): UseWeatherResult {
  const [status, setStatus] = useState<WeatherStatus>("loading");
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<WeatherLocation | null>(null);
  // Bumped by refresh() to force re-fetching regardless of memo TTL.
  const [refreshTick, setRefreshTick] = useState(0);
  // Bumped by setCity / useMyLocation to force a fresh fetch.
  const [bump, setBump] = useState(0);
  const abortedRef = useRef<AbortController | null>(null);
  const toastedRef = useRef<string | null>(null);

  useEffect(() => {
    abortedRef.current?.abort();
    const ctrl = new AbortController();
    abortedRef.current = ctrl;

    let cancelled = false;
    void (async () => {
      const loc = (await resolveSharedLocation(ctrl.signal)) ?? DEFAULT_LOCATION;
      if (cancelled || ctrl.signal.aborted) return;
      setLocation(loc);

      const fresh =
        data &&
        data.fetchedAt != null &&
        Date.now() - data.fetchedAt < MEMO_TTL_MS &&
        loc.lat === location?.lat &&
        loc.lon === location?.lon;
      if (fresh && refreshTick === 0 && bump === 0) {
        setStatus("live");
        setError(null);
        return;
      }

      setStatus("loading");
      setError(null);
      const snap = await fetchForecast(loc, ctrl.signal);
      if (cancelled || ctrl.signal.aborted) return;
      if (snap) {
        setData(snap);
        setStatus("live");
        setError(null);
        toastedRef.current = null;
      } else {
        setStatus("failed");
        const msg = loc.source === "default"
          ? "无法获取实时天气，请输入城市或允许定位"
          : "无法获取实时天气";
        setError(msg);
        if (toastedRef.current !== msg) {
          toast.error(msg);
          toastedRef.current = msg;
        }
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, bump]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const setCity = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const geo = await geocode(trimmed);
    if (!geo) {
      toast.error(`未找到城市：${trimmed}`);
      return;
    }
    writeCachedLocation(geo);
    setLocation(geo);
    setBump((b) => b + 1);
  }, []);

  const useMyLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("当前浏览器不支持定位");
      return;
    }
    const loc = await browserGeolocate();
    if (!loc) {
      toast.error("无法读取位置（已拒绝或不可用）");
      return;
    }
    writeCachedLocation(loc);
    setLocation(loc);
    setBump((b) => b + 1);
  }, []);

  const reset = useCallback(() => {
    clearCachedLocation();
    sharedLocationPromise = null;
    setLocation(DEFAULT_LOCATION);
    setBump((b) => b + 1);
  }, []);

  return { status, data, error, location, refresh, setCity, useMyLocation, reset };
}

export { DEFAULT_LOCATION };
