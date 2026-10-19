import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { WeatherLocation } from "@/lib/weather";

// `useWeather` is dynamically imported per test (after `vi.resetModules()`)
// so the module-level `sharedLocationPromise` starts at `null` and tests
// stay isolated from each other.

// ------------------------------------------------------------------
// Per-test browser / network stubs
// ------------------------------------------------------------------

type GeoStub = {
  getCurrentPosition: (
    success: (pos: {
      coords: { latitude: number; longitude: number };
    }) => void,
    error?: (err: { code: number; message: string }) => void,
  ) => void;
  watchPosition: () => number;
  clearWatch: () => void;
};

function installGeolocationStub() {
  const geo: GeoStub = {
    getCurrentPosition: () => {},
    watchPosition: () => 0,
    clearWatch: () => {},
  };
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: geo,
  });
  return geo;
}

function nextFetchReturns(value: unknown, opts: { ok?: boolean } = {}) {
  const stub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  stub.mockResolvedValueOnce(
    new Response(JSON.stringify(value), {
      status: opts.ok === false ? 500 : 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function ipBody(city = "广州", lat = 23.13, lon = 113.27) {
  return {
    city,
    country: "中国",
    country_name: "中国",
    latitude: lat,
    longitude: lon,
    timezone: "Asia/Shanghai",
  };
}

function forecastBody(city = "广州", lat = 23.13, lon = 113.27) {
  return {
    current: {
      time: "2026-10-19T10:00",
      temperature_2m: 27.4,
      apparent_temperature: 30.1,
      relative_humidity_2m: 78,
      weather_code: 2,
      wind_speed_10m: 12.3,
    },
    daily: {
      time: ["2026-10-19", "2026-10-20"],
      weather_code: [2, 61],
      temperature_2m_max: [30, 28],
      temperature_2m_min: [24, 23],
    },
    timezone: "Asia/Shanghai",
  };
}

function geocodeBody(city = "上海", lat = 31.23, lon = 121.47) {
  return { results: [{ name: city, latitude: lat, longitude: lon }] };
}

beforeEach(() => {
  // Critical: re-evaluate @/lib/weather on every test so the
  // module-level `sharedLocationPromise` variable is null at mount.
  vi.resetModules();
  installGeolocationStub();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), { status: 200 }),
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// `resetModules` invalidates the cached import in the test module itself
// too — so always load `useWeather` per test via dynamic import.
async function loadUseWeather() {
  const mod = await import("@/lib/weather");
  return mod.useWeather;
}

// ------------------------------------------------------------------
// Cold-start IP path (no localStorage cache)
// ------------------------------------------------------------------

describe("useWeather — cold start, no cache", () => {
  it("resolves location via IP, then fetches forecast, and ends up 'live'", async () => {
    nextFetchReturns(ipBody("广州"));
    nextFetchReturns(forecastBody("广州"));

    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());

    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    expect(result.current.data?.cityLabel).toBe("广州");
    expect(result.current.location?.source).toBe("ip");
    expect(result.current.error).toBeNull();

    const stub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(stub).toHaveBeenCalledTimes(2);
    expect(stub.mock.calls[0][0]).toContain("ipapi.co");
    expect(stub.mock.calls[1][0]).toContain("api.open-meteo.com");
  });

  it("persists the IP-resolved location to localStorage as the new default", async () => {
    nextFetchReturns(ipBody("Guangzhou"));
    nextFetchReturns(forecastBody("Guangzhou"));

    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());

    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    const raw = window.localStorage.getItem("hitab:weather:location");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as WeatherLocation;
    expect(parsed.city).toBe("Guangzhou");
    expect(parsed.source).toBe("ip");
  });

  it("ends 'failed' (with no data) when the IP fetch returns no usable payload", async () => {
    // ipapi returns 200 with an error payload on rate-limit; the hook
    // treats that as a failure.
    nextFetchReturns({
      error: true,
      reason: "RateLimited",
      message: "out of quota",
    });

    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toMatch(/无法/);
  });
});

// ------------------------------------------------------------------
// Cold-start with localStorage cache
// ------------------------------------------------------------------

describe("useWeather — cold start with cached city", () => {
  it("uses the cached city and skips the IP fetch entirely", async () => {
    const cached: WeatherLocation = {
      city: "上海",
      country: "中国",
      lat: 31.23,
      lon: 121.47,
      source: "cached",
    };
    window.localStorage.setItem(
      "hitab:weather:location",
      JSON.stringify(cached),
    );

    nextFetchReturns(forecastBody("上海", 31.23, 121.47));

    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());

    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });
    expect(result.current.location?.city).toBe("上海");
    expect(result.current.data?.cityLabel).toBe("上海");

    const stub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(stub).toHaveBeenCalledTimes(1);
    expect(stub.mock.calls[0][0]).toContain("api.open-meteo.com");
    expect(stub.mock.calls[0][0]).toContain("latitude=31.23");
  });

  it("treats a missing / corrupt cache as 'no cache' (falls through to IP)", async () => {
    window.localStorage.setItem("hitab:weather:location", "not-json");
    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());

    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());

    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });
  });
});

// ------------------------------------------------------------------
// setCity (manual entry)
// ------------------------------------------------------------------

describe("useWeather — setCity", () => {
  it("geocodes the typed city and updates the snapshot", async () => {
    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    nextFetchReturns(geocodeBody("Shanghai"));
    nextFetchReturns(forecastBody("Shanghai", 31.23, 121.47));

    await act(async () => {
      await result.current.setCity("Shanghai");
    });

    await waitFor(() => {
      expect(result.current.location?.city).toBe("Shanghai");
      expect(result.current.location?.source).toBe("manual");
    });
    expect(result.current.data?.cityLabel).toBe("Shanghai");
  });

  it("leaves existing data untouched when the geocode returns no results", async () => {
    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    nextFetchReturns({ results: [] });

    await act(async () => {
      await result.current.setCity("xyzz-does-not-exist");
    });

    // Location + data unchanged.
    expect(result.current.location?.city).toBe("广州");
    expect(result.current.status).toBe("live");
  });
});

// ------------------------------------------------------------------
// useMyLocation (browser geolocation)
// ------------------------------------------------------------------

describe("useWeather — useMyLocation", () => {
  it("prompts geolocation, stores the granted coords, and re-fetches forecast", async () => {
    const geo = globalThis.navigator.geolocation as unknown as GeoStub;
    geo.getCurrentPosition = (success) => {
      success({ coords: { latitude: 31.23, longitude: 121.47 } });
    };

    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    nextFetchReturns(forecastBody("我的位置", 31.23, 121.47));

    await act(async () => {
      await result.current.useMyLocation();
    });

    await waitFor(() => {
      expect(result.current.location?.source).toBe("geo");
    });
    expect(result.current.location?.city).toBe("我的位置");
    expect(result.current.location?.lat).toBe(31.23);
    expect(result.current.location?.lon).toBe(121.47);
  });

  it("leaves state untouched when permission is denied", async () => {
    const geo = globalThis.navigator.geolocation as unknown as GeoStub;
    geo.getCurrentPosition = (_success, error) => {
      error?.({ code: 1, message: "Permission denied" });
    };

    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });
    const before = result.current.location;

    await act(async () => {
      await result.current.useMyLocation();
    });

    expect(result.current.location).toBe(before);
  });
});

// ------------------------------------------------------------------
// reset
// ------------------------------------------------------------------

describe("useWeather — reset", () => {
  it("clears the localStorage cache and the module-level shared location promise", async () => {
    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });
    expect(
      window.localStorage.getItem("hitab:weather:location"),
    ).not.toBeNull();

    // Reset triggers a fresh IP fetch (clear localStorage + the
    // module-level sharedLocationPromise). Queue two more responses.
    nextFetchReturns(ipBody("上海", 31.23, 121.47));
    nextFetchReturns(forecastBody("上海", 31.23, 121.47));

    await act(async () => {
      await result.current.reset();
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem("hitab:weather:location");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as WeatherLocation;
      expect(parsed.city).toBe("上海");
    });
  });
});

// ------------------------------------------------------------------
// refresh
// ------------------------------------------------------------------

describe("useWeather — refresh", () => {
  it("calls fetch again even when memo hasn't expired", async () => {
    nextFetchReturns(ipBody());
    nextFetchReturns(forecastBody());
    const useWeather = await loadUseWeather();
    const { result } = renderHook(() => useWeather());
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    const stub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const before = stub.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(2);

    nextFetchReturns(forecastBody());
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });
    expect(stub.mock.calls.length).toBe(before + 1);
  });
});
