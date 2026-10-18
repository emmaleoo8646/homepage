"use client";

import { Loader2, Sun } from "lucide-react";
import { useWeather, wmoLabel, WmoIcon } from "@/lib/weather";

/**
 * The home-page "天气" tile. Renders live data via Open-Meteo and falls back
 * to a static placeholder when the network is unreachable so the layout
 * never collapses.
 */
export function WeatherTile({ onSelect }: { onSelect?: () => void }) {
  const { status, data } = useWeather();

  // Helper: live or stale-live (failed-but-data-still-valid)
  if (data) {
    return (
      <button
        className={`widget weather-card ${status === "loading" ? "weather-tile-loading" : ""}`}
        onClick={onSelect}
        aria-label={`${data.cityLabel}天气`}
      >
        <span className="weather-temp">
          {Math.round(data.current.temperature)}°
          <WmoIcon code={data.current.weatherCode} size={31} />
        </span>
        <span className="weather-place">
          {data.cityLabel}
          <small>
            {wmoLabel(data.current.weatherCode)} {Math.round(data.today.low)}°～
            {Math.round(data.today.high)}°
          </small>
        </span>
        {status === "failed" && (
          <span className="sample-label">更新失败</span>
        )}
        {status === "loading" && (
          <span className="sample-label">
            <Loader2 className="animate-spin" size={11} />
            刷新中
          </span>
        )}
      </button>
    );
  }

  // Empty / failed with no prior data: keep the original placeholder verbatim
  // so the home grid still looks polished even before the first successful
  // fetch (e.g. offline on cold start).
  if (status === "failed" || status === "empty") {
    return (
      <button
        className="widget weather-card"
        onClick={onSelect}
        aria-label="天气"
      >
        <span className="weather-temp">
          23°
          <Sun size={31} />
        </span>
        <span className="weather-place">
          广州
          <small>晴 21°～27°</small>
        </span>
        <span className="sample-label">无法获取实时天气</span>
      </button>
    );
  }

  // Initial loading: undetermined temperature, spinner in place of icon.
  return (
    <button
      className="widget weather-card weather-tile-loading"
      onClick={onSelect}
      aria-label="天气"
    >
      <span className="weather-temp">
        —°
        <Loader2 className="animate-spin" size={31} />
      </span>
      <span className="weather-place">
        加载中…
        <small>—</small>
      </span>
    </button>
  );
}
