"use client";

import {
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
 * We deliberately do *not* use browser geolocation or IP-based lookup; the user
 * picks a city from the dialog, which is persisted to localStorage. This
 * avoids permission prompts and the flakiness of free IP geolocation APIs.
 */

export type WeatherStatus = "loading" | "live" | "failed" | "empty";

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

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY = "hitab:weather:city";
const DEFAULT_CITY = "广州";
const FETCH_TIMEOUT_MS = 8000;
const MEMO_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- WMO weather code → { label, icon } -------------------------------------
// Covers the codes documented at
// https://open-meteo.com/en/docs#weathervariables (WMO 4677).
export const wmoMap: Record<number, { label: string; icon: ComponentType<LucideProps> }> = {
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

// --- City persistence --------------------------------------------------------
export function getCachedCity(): string {
  if (typeof window === "undefined") return DEFAULT_CITY;
  try {
    const v = window.localStorage.getItem(CACHE_KEY);
    return v?.trim() || DEFAULT_CITY;
  } catch {
    return DEFAULT_CITY;
  }
}
export function setCachedCity(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, name);
  } catch {
    /* localStorage may be disabled — non-fatal */
  }
}

// --- Network fetcher --------------------------------------------------------
type GeoResult = {
  results?: Array<{
    name: string;
    country?: string;
    country_code?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }>;
};

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

/**
 * Fetch a fresh weather snapshot for `city`. Returns `null` on any failure
 * (network, 4xx/5xx, city not found). Callers are responsible for translating
 * `null` into a UI status message.
 */
export async function fetchWeather(
  city: string,
  signal?: AbortSignal,
): Promise<WeatherSnapshot | null> {
  const trimmed = city.trim();
  if (!trimmed) return null;
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const composed =
    signal ?? timeout
      ? AbortSignal.any([signal, timeout].filter(Boolean) as AbortSignal[])
      : undefined;

  try {
    const geoUrl = `${GEO_URL}?name=${encodeURIComponent(trimmed)}&count=1&language=zh&format=json`;
    const geoRes = await fetch(geoUrl, { signal: composed });
    if (!geoRes.ok) return null;
    const geo = (await geoRes.json()) as GeoResult;
    const top = geo.results?.[0];
    if (!top) return null;

    const forecastUrl =
      `${FORECAST_URL}?latitude=${top.latitude}&longitude=${top.longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=2`;
    const foreRes = await fetch(forecastUrl, { signal: composed });
    if (!foreRes.ok) return null;
    const fore = (await foreRes.json()) as ForecastResult;

    const todayDate = fore.daily.time[0];
    const tomorrowDate = fore.daily.time[1];
    if (!todayDate || !tomorrowDate) return null;

    return {
      cityLabel: top.name,
      countryLabel: top.country,
      timezone: fore.timezone || top.timezone || "UTC",
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
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return null;
    return null;
  }
}

// --- React hook -------------------------------------------------------------
export interface UseWeatherResult {
  status: WeatherStatus;
  data: WeatherSnapshot | null;
  error: string | null;
  city: string;
  refresh: () => void;
}

/**
 * Subscribe to live weather for `city`. Uses the same `useState + useEffect`
 * pattern as `useCachedSyncUser` to keep the codebase consistent (lint allows
 * the `set-state-in-effect` warning here the same way it does for sync).
 *
 * Behavior:
 *   - first mount with `city` (or last cached) → loading → live/failed
 *   - within 10 min after success, refresh is a no-op (cached)
 *   - refresh() always forces a new fetch
 *   - failures keep the previous `data` and update `error`
 *   - AbortError (component unmount, signal aborted) is silent — no toast,
 *     no `setState`
 */
export function useWeather(city?: string): UseWeatherResult {
  const resolvedCity = city?.trim() || getCachedCity();
  const [status, setStatus] = useState<WeatherStatus>("loading");
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refresh() to force the effect to re-run regardless of memo TTL.
  const [refreshTick, setRefreshTick] = useState(0);
  const abortedRef = useRef<AbortController | null>(null);
  const toastedRef = useRef(false);

  useEffect(() => {
    abortedRef.current?.abort();
    const ctrl = new AbortController();
    abortedRef.current = ctrl;

    const fresh =
      data?.fetchedAt != null &&
      data?.cityLabel === resolvedCity &&
      Date.now() - data.fetchedAt < MEMO_TTL_MS;
    if (fresh && refreshTick === 0) {
      // Existing snapshot still warm and matches the current city: keep `live`.
      setStatus("live");
      setError(null);
      return () => ctrl.abort();
    }

    setStatus("loading");
    setError(null);
    fetchWeather(resolvedCity, ctrl.signal).then((snap) => {
      if (ctrl.signal.aborted) return;
      if (snap) {
        setData(snap);
        setStatus("live");
        setError(null);
        toastedRef.current = false;
      } else {
        setStatus("failed");
        const msg = "无法获取实时天气";
        setError(msg);
        if (!toastedRef.current) {
          toast.error(msg);
          toastedRef.current = true;
        }
      }
    });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCity, refreshTick]);

  function refresh() {
    setRefreshTick((t) => t + 1);
  }

  return { status, data, error, city: resolvedCity, refresh };
}

export { DEFAULT_CITY };
