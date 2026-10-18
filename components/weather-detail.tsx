"use client";

import { useState } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  Droplets,
  Wind,
  Thermometer,
  type LucideProps,
} from "lucide-react";
import {
  useWeather,
  getCachedCity,
  setCachedCity,
  wmoLabel,
  WmoIcon,
  DEFAULT_CITY,
  type WeatherDay,
} from "@/lib/weather";

/**
 * Body of the "天气" panel dialog. Lets the user change the city, refresh,
 * and see today's / tomorrow's high-low plus current apparent temperature,
 * humidity and wind.
 */
export function WeatherDetail() {
  const { status, data, error, city, refresh } = useWeather();
  // Initial input value mirrors what's actually being fetched; trimming happens
  // at submit time so the user can type freely without losing spaces mid-edit.
  const [input, setInput] = useState(getCachedCity() || DEFAULT_CITY);
  const [committedCity, setCommittedCity] = useState(city);

  // Keep input in sync if the hook decides to switch cities (e.g. on first
  // mount when localStorage was empty → fell back to DEFAULT_CITY) AND the
  // user hasn't manually edited it.
  if (city !== committedCity && input === committedCity) {
    setInput(city);
    setCommittedCity(city);
  }

  function commit() {
    const v = input.trim();
    if (!v) return;
    setCachedCity(v);
    setCommittedCity(v);
    setInput(v);
    // useWeather will detect the localStorage change on its own — but we don't
    // depend on that observer: re-rendering here also re-runs useEffect because
    // we hand back `city` via the hook's resolvedCity path. To keep things
    // explicit we force-refresh.
    refresh();
  }

  return (
    <div className="weather-detail">
      <div className="weather-search">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          aria-label="城市"
        />
        <button
          onClick={commit}
          aria-label="应用城市"
          title="应用城市"
          type="button"
        >
          <Search size={16} />
        </button>
        <button
          onClick={refresh}
          aria-label="刷新"
          title="刷新"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {!data && status !== "failed" && (
        <div className="weather-summary-loading">
          <Loader2 className="animate-spin" size={36} />
          <p className="muted-note">正在加载天气…</p>
        </div>
      )}

      {data && (
        <>
          <div className="weather-summary">
            <WmoIcon code={data.current.weatherCode} size={56} />
            <strong>{Math.round(data.current.temperature)}°</strong>
            <div>
              {data.cityLabel}
              <small>
                {wmoLabel(data.current.weatherCode)} · 体感{" "}
                {Math.round(data.current.apparentTemperature)}°
              </small>
            </div>
          </div>

          <div className="weather-stats">
            <div>
              <Droplets size={15} /> 湿度 {Math.round(data.current.humidity)}%
            </div>
            <div>
              <Wind size={15} /> 风速 {Math.round(data.current.windSpeed)} km/h
            </div>
            <div>
              <Thermometer size={15} /> 体感{" "}
              {Math.round(data.current.apparentTemperature)}°
            </div>
          </div>

          <DayRow label="今天" day={data.today} />
          <DayRow label="明天" day={data.tomorrow} />

          {status === "failed" && (
            <p className="muted-note">
              <RefreshCw size={11} /> 刷新失败：{error}
            </p>
          )}
          {status === "loading" && (
            <p className="muted-note">
              <Loader2 className="animate-spin" size={11} /> 更新中…
            </p>
          )}
        </>
      )}

      {!data && (status === "failed" || status === "empty") && (
        <p className="muted-note">
          {error ?? "尚未获取到天气数据"}。请确认城市名拼写（如
          &quot;Shanghai&quot; / &quot;上海&quot;），或稍后再试。
        </p>
      )}
    </div>
  );
}

function DayRow({ label, day }: { label: string; day: WeatherDay }) {
  return (
    <div className="weather-day-row">
      <span>{label}</span>
      <span className="weather-day-cell">
        <DayIcon code={day.weatherCode} />
        {wmoLabel(day.weatherCode)}
      </span>
      <strong>
        {Math.round(day.low)}° ~ {Math.round(day.high)}°
      </strong>
    </div>
  );
}

function DayIcon({
  code,
  ...rest
}: { code: number } & LucideProps) {
  return <WmoIcon code={code} size={18} {...rest} />;
}
