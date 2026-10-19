import { describe, expect, it } from "vitest";
import { wmoLabel, wmoMap } from "@/lib/weather";

/**
 * WMO weather codes → human-readable Chinese + an icon component. The
 * labels appear inside the home widget, the dialog detail row, the
 * bookmark icon fallback, and the speech-bubble hint on the city chip.
 * These tests pin down both the map completeness and the symbol
 * integrity so a stray edit can't silently turn "小雨" into "大雨".
 */

describe("wmoMap", () => {
  it("covers every documented WMO 4677 weather code", () => {
    // https://open-meteo.com/en/docs#weathervariables
    const expected = [
      0,
      1, 2, 3,
      45, 48,
      51, 53, 55,
      56, 57,
      61, 63, 65,
      66, 67,
      71, 73, 75,
      77,
      80, 81, 82,
      85, 86,
      95,
      96, 99,
    ];
    for (const code of expected) {
      expect(wmoMap[code], `code ${code} should be mapped`).toBeDefined();
    }
  });

  it("every entry has a non-empty Chinese label and a renderable icon component", () => {
    for (const [code, entry] of Object.entries(wmoMap)) {
      expect(entry.label.length).toBeGreaterThan(0);
      // lucide-react ships icons as either plain function components or
      // forwardRef objects — both `typeof === "function"` and
      // `typeof === "object"` are valid React component identities.
      expect(["function", "object"]).toContain(typeof entry.icon);
      // The forwardRef / memo shape carries a `$$typeof` Symbol —
      // either `react.element` / `react.forward_ref` / `react.memo`.
      // We only assert "looks React-component-ish", not exact tag.
      const tagged = entry.icon as unknown as { $$typeof?: unknown };
      expect(tagged.$$typeof).toBeDefined();
    }
  });
});

describe("wmoLabel", () => {
  it("returns the registered Chinese label for each code", () => {
    expect(wmoLabel(0)).toBe("晴");
    expect(wmoLabel(1)).toBe("晴间多云");
    expect(wmoLabel(2)).toBe("多云");
    expect(wmoLabel(3)).toBe("阴");
    expect(wmoLabel(45)).toBe("雾");
    expect(wmoLabel(48)).toBe("冰雾");
    expect(wmoLabel(51)).toBe("毛毛雨");
    expect(wmoLabel(55)).toBe("浓毛毛雨");
    expect(wmoLabel(61)).toBe("小雨");
    expect(wmoLabel(63)).toBe("中雨");
    expect(wmoLabel(65)).toBe("大雨");
    expect(wmoLabel(71)).toBe("小雪");
    expect(wmoLabel(73)).toBe("中雪");
    expect(wmoLabel(75)).toBe("大雪");
    expect(wmoLabel(77)).toBe("雪粒");
    expect(wmoLabel(80)).toBe("阵雨");
    expect(wmoLabel(82)).toBe("强阵雨");
    expect(wmoLabel(85)).toBe("阵雪");
    expect(wmoLabel(86)).toBe("强阵雪");
    expect(wmoLabel(95)).toBe("雷暴");
    expect(wmoLabel(96)).toBe("雷暴伴冰雹");
    expect(wmoLabel(99)).toBe("雷暴伴冰雹");
  });

  it("distinguishes drizzle vs rain vs freezing drizzle", () => {
    expect(wmoLabel(53)).not.toBe(wmoLabel(61));
    expect(wmoLabel(56)).not.toBe(wmoLabel(61));
    expect(wmoLabel(57)).not.toBe(wmoLabel(66));
  });

  it("falls back to '晴' for unknown codes", () => {
    expect(wmoLabel(100)).toBe("晴");
    expect(wmoLabel(-1)).toBe("晴");
    expect(wmoLabel(NaN)).toBe("晴");
  });

  it("treats freezing drizzle / freezing rain as distinct from non-freezing variants (label difference)", () => {
    // 51 (drizzle) vs 56 (freezing drizzle) and 61 (rain) vs 66 (freezing rain)
    // — both must have a mapping in `wmoMap` and yield different labels.
    expect(wmoLabel(51)).not.toBe(wmoLabel(56));
    expect(wmoLabel(61)).not.toBe(wmoLabel(66));
  });
});
