import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  UseWeatherResult,
  WeatherLocation,
  WeatherSnapshot,
} from "@/lib/weather";

// Mock the hook with controllable stubs. Tests override the returned
// object's properties to drive the various dialog render branches.
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

import { WeatherDetail } from "@/components/weather-detail";

afterEach(() => {
  cleanup();
  mockUseWeather.mockReset();
});

// ------------------------------------------------------------------
// Fixtures & helpers
// ------------------------------------------------------------------

function location(partial: Partial<WeatherLocation> = {}): WeatherLocation {
  return {
    city: "广州",
    country: "中国",
    lat: 23.13,
    lon: 113.27,
    source: "ip",
    ...partial,
  };
}

function snapshot(): WeatherSnapshot {
  return {
    cityLabel: "广州",
    countryLabel: "中国",
    timezone: "Asia/Shanghai",
    current: {
      temperature: 27.4,
      apparentTemperature: 30.1,
      humidity: 78,
      windSpeed: 12.3,
      weatherCode: 2,
      observedAt: "2026-10-19T10:00",
    },
    today: { date: "2026-10-19", high: 30, low: 24, weatherCode: 2 },
    tomorrow: { date: "2026-10-20", high: 28, low: 23, weatherCode: 61 },
    fetchedAt: Date.now(),
  };
}

function setupHook(overrides: Partial<UseWeatherResult> = {}) {
  const fns = {
    refresh: vi.fn(),
    setCity: vi.fn(async (_name: string) => {}),
    useMyLocation: vi.fn(async () => {}),
    reset: vi.fn(),
  };
  mockUseWeather.mockReturnValue({
    status: "live",
    data: snapshot(),
    error: null,
    location: location(),
    ...fns,
    ...overrides,
  } as UseWeatherResult);
  render(<WeatherDetail />);
  return fns;
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("WeatherDetail — input pre-fill & typing", () => {
  it("renders the city input prefilled with the resolved location", () => {
    setupHook({ location: location({ city: "上海", source: "manual" }) });
    const input = screen.getByLabelText("城市") as HTMLInputElement;
    expect(input.value).toBe("上海");
    expect(input.placeholder).toBe("输入城市（如 上海 / Shanghai）");
  });

  it("leaves the input empty when no location is resolved yet (cold start)", () => {
    setupHook({ location: null });
    const input = screen.getByLabelText("城市") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("keystrokes only update local state — they do NOT call setCity", async () => {
    const setCity = vi.fn(async () => {});
    setupHook({
      location: location({ city: "上海" }),
      setCity: setCity as unknown as UseWeatherResult["setCity"],
    });
    const user = userEvent.setup();
    const input = screen.getByLabelText("城市");
    await user.type(input, "Beijing");
    // Pre-fill "上海" + typed "Beijing".
    expect(input).toHaveValue("上海Beijing");
    expect(setCity).not.toHaveBeenCalled();
  });
});

describe("WeatherDetail — manual city commit (search button + Enter)", () => {
  it("pressing Enter on the input calls setCity with the trimmed value", async () => {
    const setCity = vi.fn(async () => {});
    setupHook({
      location: location({ city: "上海" }),
      setCity: setCity as unknown as UseWeatherResult["setCity"],
    });
    const user = userEvent.setup();
    const input = screen.getByLabelText("城市");
    await user.clear(input);
    await user.type(input, "  Berlin  ");
    await user.keyboard("{Enter}");
    expect(setCity).toHaveBeenCalledTimes(1);
    expect(setCity).toHaveBeenCalledWith("Berlin");
  });

  it("clicking the search (应用城市) button commits the trimmed value", async () => {
    const setCity = vi.fn(async () => {});
    setupHook({
      location: location({ city: "上海" }),
      setCity: setCity as unknown as UseWeatherResult["setCity"],
    });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("城市"));
    await user.type(screen.getByLabelText("城市"), "Tokyo");
    await user.click(screen.getByRole("button", { name: "应用城市" }));
    expect(setCity).toHaveBeenCalledTimes(1);
    expect(setCity).toHaveBeenCalledWith("Tokyo");
  });

  it("applying button is disabled while committing (in-flight setCity)", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => (resolve = r));
    const setCity = vi.fn(async () => {
      await pending;
    });
    setupHook({
      location: location({ city: "上海" }),
      setCity: setCity as unknown as UseWeatherResult["setCity"],
    });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("城市"));
    await user.type(screen.getByLabelText("城市"), "Hangzhou");
    const applyBtn = screen.getByRole("button", { name: "应用城市" });
    expect(applyBtn).not.toBeDisabled();
    await user.click(applyBtn);
    expect(applyBtn).toBeDisabled();
    expect(screen.getByLabelText("城市")).toBeDisabled();
    resolve();
    await Promise.resolve();
  });

  it("apply button is disabled when the input is empty or whitespace", async () => {
    setupHook({ location: location({ city: "上海" }) });
    const user = userEvent.setup();
    const applyBtn = screen.getByRole("button", { name: "应用城市" });
    // Pretilled with "上海", so enabled.
    expect(applyBtn).not.toBeDisabled();
    const input = screen.getByLabelText("城市") as HTMLInputElement;
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(applyBtn).toBeDisabled();
    await user.type(input, "   ");
    expect(applyBtn).toBeDisabled();
    await user.type(input, "Beijing");
    expect(applyBtn).not.toBeDisabled();
  });

  it("Enter does nothing while committing (debounce)", async () => {
    let resolveFirst!: () => void;
    const pending = new Promise<void>((r) => (resolveFirst = r));
    let callCount = 0;
    const setCity = vi.fn(async () => {
      callCount++;
      if (callCount === 1) await pending;
    });
    setupHook({
      location: location({ city: "上海" }),
      setCity: setCity as unknown as UseWeatherResult["setCity"],
    });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("城市"));
    await user.type(screen.getByLabelText("城市"), "Hangzhou");
    await user.keyboard("{Enter}");
    // Second Enter while the first is still pending should not enqueue
    // another setCity call because `committing` gates it.
    await user.keyboard("{Enter}");
    expect(callCount).toBe(1);
    resolveFirst();
    await Promise.resolve();
  });
});

describe("WeatherDetail — geolocation button", () => {
  it("clicking the crosshair button calls useMyLocation once", async () => {
    const useMyLocation = vi.fn(async () => {});
    setupHook({
      useMyLocation: useMyLocation as unknown as UseWeatherResult["useMyLocation"],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "使用我的位置" }));
    expect(useMyLocation).toHaveBeenCalledTimes(1);
  });

  it("the crosshair button shows the spinner (Loader2) and is disabled while requesting", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => (resolve = r));
    const useMyLocation = vi.fn(async () => {
      await pending;
    });
    setupHook({
      useMyLocation: useMyLocation as unknown as UseWeatherResult["useMyLocation"],
    });
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: "使用我的位置" });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(btn).toBeDisabled();
    resolve();
    await Promise.resolve();
  });
});

describe("WeatherDetail — refresh and reset", () => {
  it("clicking the refresh button calls the refresh callback exactly once", async () => {
    const refresh = vi.fn();
    setupHook({ refresh });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "刷新" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clicking reset calls reset and clears the input", async () => {
    const reset = vi.fn();
    setupHook({
      location: location({ city: "上海" }),
      reset,
    });
    const user = userEvent.setup();
    const input = screen.getByLabelText("城市") as HTMLInputElement;
    expect(input.value).toBe("上海");
    await user.click(screen.getByRole("button", { name: "重置为自动定位" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });
});

describe("WeatherDetail — source pill", () => {
  it("renders the resolved city name and the source tag (when not 'cached')", () => {
    setupHook({
      location: location({ city: "上海", source: "ip" }),
    });
    expect(screen.getByText(/当前位置/)).toBeInTheDocument();
    expect(screen.getByText("上海")).toBeInTheDocument();
    expect(screen.getByText(/自动定位（IP）/)).toBeInTheDocument();
  });

  it("does NOT show the source tag for 'cached' locations", () => {
    setupHook({
      location: location({ city: "上海", source: "cached" }),
    });
    expect(screen.queryByText(/已记忆/)).not.toBeInTheDocument();
  });

  it("omits the source pill entirely when no location is resolved", () => {
    setupHook({ location: null });
    expect(screen.queryByText(/当前位置/)).not.toBeInTheDocument();
  });
});

describe("WeatherDetail — summary + stats + day rows (live data)", () => {
  it("renders current temperature, feels-like, humidity, wind rounded to integers", () => {
    setupHook({
      data: snapshot(), // 27.4° / 30.1° / 78% / 12.3 km/h
    });
    expect(screen.getByText("27°")).toBeInTheDocument();
    // `体感 30°` shows up twice — once in the summary block, once in the
    // stats grid. Either match is fine for a sanity-check.
    expect(screen.getAllByText(/体感\s*30°/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("湿度 78%")).toBeInTheDocument();
    expect(screen.getByText(/风速\s*12 km\/h/)).toBeInTheDocument();
  });

  it("renders today + tomorrow rows with the wmoLabel and low~high range", () => {
    setupHook({ data: snapshot() });
    // Today: 多云 (code 2), 24~30
    expect(screen.getByText(/^今天$/)).toBeInTheDocument();
    expect(screen.getByText(/^明天$/)).toBeInTheDocument();
    // Both days should be rendered with their respective wmoLabel.
    expect(screen.getAllByText("多云").length).toBeGreaterThanOrEqual(1);
    // Low~high ranges.
    expect(screen.getByText(/24° ~ 30°/)).toBeInTheDocument();
    expect(screen.getByText(/23° ~ 28°/)).toBeInTheDocument();
  });

  it("renders the failed-refresh note when status is 'failed' while data is still present", () => {
    setupHook({
      status: "failed",
      data: snapshot(),
      error: "网络挂了",
    });
    expect(screen.getByText(/刷新失败：网络挂了/)).toBeInTheDocument();
    // The data block stays visible — failed-but-stale shows the prior
    // snapshot rather than blanking.
    expect(screen.getByText("27°")).toBeInTheDocument();
  });

  it("renders the '更新中…' note when status is 'loading' while data is still present", () => {
    setupHook({ status: "loading", data: snapshot() });
    expect(screen.getByText(/更新中…/)).toBeInTheDocument();
  });
});

describe("WeatherDetail — empty / failed-empty (no data)", () => {
  it("shows the loading spinner while data is null and status is not failed", () => {
    setupHook({ status: "loading", data: null });
    expect(screen.getByText("正在加载天气…")).toBeInTheDocument();
  });

  it("shows '正在获取位置…' when location source is 'ip' and no coords yet", () => {
    setupHook({
      status: "loading",
      data: null,
      location: { city: "广州", source: "ip" /* lat/lon undefined */ },
    });
    expect(screen.getByText("正在获取位置…")).toBeInTheDocument();
  });

  it("shows the failed-empty hint with the underlying error message", () => {
    setupHook({
      status: "failed",
      data: null,
      error: "无法解析 'xyz' 为城市",
    });
    expect(
      screen.getByText(/无法解析 'xyz' 为城市/),
    ).toBeInTheDocument();
  });

  it("falls back to a generic failed-empty hint when error is null", () => {
    setupHook({ status: "failed", data: null, error: null });
    expect(screen.getByText(/尚未获取到天气数据/)).toBeInTheDocument();
  });
});
