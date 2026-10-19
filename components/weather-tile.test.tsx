import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseWeatherResult } from "@/lib/weather";

// Mock the hook with a controllable default. Each test overrides the
// returned object via `mockUseWeather` to drive render branches without
// touching the real fetch / IP-localStorage / geolocation plumbing.
const mockUseWeather = vi.fn<() => UseWeatherResult>();
vi.mock("@/lib/weather", async () => {
  const actual = await vi.importActual<typeof import("@/lib/weather")>(
    "@/lib/weather",
  );
  return {
    ...actual,
    useWeather: () => mockUseWeather(),
  };
});

import { WeatherTile } from "@/components/weather-tile";

afterEach(() => {
  cleanup();
  mockUseWeather.mockReset();
});

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------

function liveSnapshot() {
  return {
    cityLabel: "广州",
    countryLabel: "中国",
    timezone: "Asia/Shanghai",
    current: {
      temperature: 27.4,
      apparentTemperature: 30.1,
      humidity: 78,
      windSpeed: 12.3,
      weatherCode: 2, // 多云
      observedAt: "2026-10-19T10:00",
    },
    today: {
      date: "2026-10-19",
      high: 30,
      low: 24,
      weatherCode: 2,
    },
    tomorrow: {
      date: "2026-10-20",
      high: 28,
      low: 23,
      weatherCode: 61,
    },
    fetchedAt: Date.now(),
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("WeatherTile — live state", () => {
  it("renders city label + rounded temperature + the WMO label + today range", () => {
    mockUseWeather.mockReturnValue({
      status: "live",
      data: liveSnapshot(),
      error: null,
      location: { city: "广州", country: "中国", lat: 23.13, lon: 113.27, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);

    expect(screen.getByText("广州")).toBeInTheDocument();
    // Math.round(27.4) === 27; we don't pin the exact text but the
    // rounded integer must appear.
    expect(screen.getByText(/27°/)).toBeInTheDocument();
    expect(screen.getByText(/多云/)).toBeInTheDocument();
    expect(screen.getByText(/24°～30°/)).toBeInTheDocument();
  });

  it("rounds temperatures (no fractional digits in the UI)", () => {
    mockUseWeather.mockReturnValue({
      status: "live",
      data: liveSnapshot(),
      error: null,
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    // 27.4 rounds to 27; we never display "27.4°".
    expect(screen.queryByText("27.4°")).not.toBeInTheDocument();
  });

  it("uses an accessible label that names the city", () => {
    mockUseWeather.mockReturnValue({
      status: "live",
      data: liveSnapshot(),
      error: null,
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByRole("button", { name: "广州天气" })).toBeInTheDocument();
  });

  it("shows a '更新失败' pill when a refresh fails but previous data is still valid", () => {
    mockUseWeather.mockReturnValue({
      status: "failed",
      data: liveSnapshot(),
      error: "无法获取实时天气",
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("更新失败")).toBeInTheDocument();
    // City + temperature stay visible (we keep the prior good snapshot).
    expect(screen.getByText("广州")).toBeInTheDocument();
  });

  it("shows a '刷新中' indicator while a refresh is in flight", () => {
    mockUseWeather.mockReturnValue({
      status: "loading",
      data: liveSnapshot(),
      error: null,
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("刷新中")).toBeInTheDocument();
  });

  it("invokes onSelect when clicked", async () => {
    mockUseWeather.mockReturnValue({
      status: "live",
      data: liveSnapshot(),
      error: null,
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<WeatherTile onSelect={onSelect} />);
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("WeatherTile — failed / empty state (no prior data)", () => {
  it("shows the resolved city name (from the IP lookup) and a '无法获取实时天气' pill", () => {
    mockUseWeather.mockReturnValue({
      status: "failed",
      data: null,
      error: "无法获取实时天气，请输入城市或允许定位",
      location: { city: "广州", lat: 23, lon: 113, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("广州")).toBeInTheDocument();
    expect(screen.getByText("无法获取实时天气")).toBeInTheDocument();
    expect(screen.getByText("暂无天气数据")).toBeInTheDocument();
  });

  it("shows a generic dash when even IP geolocation failed to produce a city", () => {
    mockUseWeather.mockReturnValue({
      status: "empty",
      data: null,
      error: null,
      location: null,
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("—°")).toBeInTheDocument();
    // City slot should not surface a stale placeholder like a sample city.
    expect(screen.queryByText("广州")).not.toBeInTheDocument();
    expect(screen.getByText("无法获取实时天气")).toBeInTheDocument();
  });
});

describe("WeatherTile — initial loading state", () => {
  it("shows the spinner and a '检测位置中…' placeholder when nothing is resolved yet", () => {
    mockUseWeather.mockReturnValue({
      status: "loading",
      data: null,
      error: null,
      location: null,
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("检测位置中…")).toBeInTheDocument();
    expect(screen.getByText("—°")).toBeInTheDocument();
  });

  it("shows the resolved city (instead of 检测位置中…) once IP returns even during loading", () => {
    mockUseWeather.mockReturnValue({
      status: "loading",
      data: null,
      error: null,
      location: { city: "上海", lat: 31, lon: 121, source: "ip" },
      refresh: () => {},
      setCity: async () => {},
      useMyLocation: async () => {},
      reset: () => {},
    });
    render(<WeatherTile />);
    expect(screen.getByText("上海")).toBeInTheDocument();
    expect(screen.queryByText("检测位置中…")).not.toBeInTheDocument();
  });
});
