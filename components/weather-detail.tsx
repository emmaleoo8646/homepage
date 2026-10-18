"use client";

import { useState } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  Crosshair,
  RotateCcw,
  Droplets,
  Wind,
  Thermometer,
  type LucideProps,
} from "lucide-react";
import {
  useWeather,
  wmoLabel,
  WmoIcon,
  type WeatherDay,
} from "@/lib/weather";

/**
 * Body of the "天气" panel dialog. Shows current weather and lets the user
 * pick a city manually, fall back to their precise location (browser
 * geolocation), or reset to IP-based auto-detection.
 */
export function WeatherDetail() {
  const {
    status,
    data,
    error,
    location,
    refresh,
    setCity,
    useMyLocation,
    reset,
  } = useWeather();

  // Initialize the input once with the resolved location so the field
  // matches what's currently being shown. If `location` is still null on
  // the very first render the input is left empty.
  const [input, setInput] = useState(location?.city ?? "");
  // `committing` prevents accidental double-submits while a manual city
  // lookup is in flight.
  const [committing, setCommitting] = useState(false);
  const [geoRequesting, setGeoRequesting] = useState(false);

  async function commitCity() {
    const v = input.trim();
    if (!v) return;
    setCommitting(true);
    try {
      await setCity(v);
      setInput(v);
    } finally {
      setCommitting(false);
    }
  }

  async function onUseMyLocation() {
    setGeoRequesting(true);
    try {
      await useMyLocation();
      // After browser geolocation resolves we don't have a "city" name from
      // any reverse-geocode lookup — `useMyLocation` stores `"我的位置"` as
      // the label.
      setInput("");
    } finally {
      setGeoRequesting(false);
    }
  }

  const sourceLabel = locationSourceLabel(location?.source);

  return (
    <div className="weather-detail">
      <div className="weather-search">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !committing) {
              e.preventDefault();
              void commitCity();
            }
          }}
          placeholder="输入城市（如 上海 / Shanghai）"
          aria-label="城市"
          disabled={committing}
        />
        <button
          onClick={() => void commitCity()}
          aria-label="应用城市"
          title="应用城市"
          type="button"
          disabled={committing || !input.trim()}
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => void onUseMyLocation()}
          aria-label="使用我的位置"
          title="使用我的位置（浏览器定位）"
          type="button"
          disabled={geoRequesting}
        >
          {geoRequesting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Crosshair size={16} />
          )}
        </button>
        <button onClick={refresh} aria-label="刷新" title="刷新" type="button">
          <RefreshCw size={16} />
        </button>
        <button
          onClick={() => {
            reset();
            setInput("");
          }}
          aria-label="重置为自动定位"
          title="清空本地缓存，回到自动定位"
          type="button"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {location && (
        <p className="weather-source-note">
          当前位置：<strong>{location.city}</strong>
          {location.source !== "cached" && (
            <span className="weather-source-tag">（{sourceLabel}）</span>
          )}
        </p>
      )}

      {!data && status !== "failed" && (
        <div className="weather-summary-loading">
          <Loader2 className="animate-spin" size={36} />
          <p className="muted-note">
            {location?.source === "ip" && !location?.lat
              ? "正在获取位置…"
              : "正在加载天气…"}
          </p>
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
              <Wind size={15} /> 风速{" "}
              {Math.round(data.current.windSpeed)} km/h
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
          {error ?? "尚未获取到天气数据"}。可以点右侧十字图标"使用我的位置"
          或在输入框键入城市。
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

function locationSourceLabel(src: string | undefined): string {
  switch (src) {
    case "ip":
      return "自动定位（IP）";
    case "geo":
      return "浏览器定位";
    case "manual":
      return "手动输入";
    case "default":
      return "默认占位";
    default:
      return "已记忆";
  }
}
