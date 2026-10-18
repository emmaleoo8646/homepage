"use client";

import { Loader2 } from "lucide-react";
import { useWeather, wmoLabel, WmoIcon } from "@/lib/weather";

/**
 * Home-page weather tile. Renders live data via Open-Meteo and falls back
 * to whatever location name was already resolved (so even on cold start
 * failures the tile looks intentional, not stuck on a fake city).
 */
export function WeatherTile({ onSelect }: { onSelect?: () => void }) {
  const { status, data, location } = useWeather();
  const fallbackCity = location?.city ?? "—";

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

  // Empty / failed with no prior data: show whatever location we resolved
  // (or a generic placeholder if even IP geolocation failed). The actual
  // temperature stays generic since there's nothing real to display.
  if (status === "failed" || status === "empty") {
    return (
      <button
        className="widget weather-card"
        onClick={onSelect}
        aria-label="天气"
      >
        <span className="weather-temp">—°</span>
        <span className="weather-place">
          {fallbackCity}
          <small>暂无天气数据</small>
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
        {fallbackCity === "—" ? "检测位置中…" : fallbackCity}
        <small>—</small>
      </span>
    </button>
  );
}
