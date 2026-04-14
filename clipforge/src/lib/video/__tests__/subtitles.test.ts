import { describe, it, expect } from "vitest";
import { hexToAssColor } from "../subtitles";

describe("hexToAssColor", () => {
  it("converts #RRGGBBAA to &HAABBGGRR& with inverted alpha", () => {
    // #000000D0: R=00, G=00, B=00, A=D0 (208/255 opaque)
    // ASS alpha = 255 - 208 = 47 = 0x2F
    expect(hexToAssColor("#000000D0")).toBe("&H2F000000&");
  });

  it("converts #RRGGBB to &H00BBGGRR& (fully opaque)", () => {
    // #FF0000: R=FF, G=00, B=00, no alpha -> 00 (opaque)
    expect(hexToAssColor("#FF0000")).toBe("&H000000FF&");
  });

  it("converts #RRGGBBAA with full alpha correctly", () => {
    // #00FF00FF: R=00, G=FF, B=00, A=FF (fully opaque)
    // ASS alpha = 255 - 255 = 0 = 0x00
    expect(hexToAssColor("#00FF00FF")).toBe("&H0000FF00&");
  });

  it("converts white without alpha to opaque white", () => {
    // #FFFFFF: R=FF, G=FF, B=FF, no alpha -> 00
    expect(hexToAssColor("#FFFFFF")).toBe("&H00FFFFFF&");
  });

  it("converts #RRGGBBAA with zero alpha (transparent)", () => {
    // #00000000: A=00 (fully transparent)
    // ASS alpha = 255 - 0 = 255 = 0xFF
    expect(hexToAssColor("#00000000")).toBe("&HFF000000&");
  });

  it("handles shorthand #RGB", () => {
    // #F00 -> #FF0000 -> &H000000FF&
    expect(hexToAssColor("#F00")).toBe("&H000000FF&");
  });

  it("handles shorthand #RGB for white", () => {
    // #FFF -> #FFFFFF -> &H00FFFFFF&
    expect(hexToAssColor("#FFF")).toBe("&H00FFFFFF&");
  });

  it("handles input without # prefix", () => {
    expect(hexToAssColor("FF0000")).toBe("&H000000FF&");
  });

  it("handles lowercase hex", () => {
    expect(hexToAssColor("#ff0000")).toBe("&H000000FF&");
  });

  it("handles mixed case hex", () => {
    expect(hexToAssColor("#Ff00Bb")).toBe("&H00BB00FF&");
  });

  it("returns opaque white for empty/invalid input", () => {
    expect(hexToAssColor("")).toBe("&H00FFFFFF&");
    expect(hexToAssColor("not-a-color")).toBe("&H00FFFFFF&");
  });

  it("handles semi-transparent black backgrounds (common AI output)", () => {
    // #000000B3: A=B3 (179/255 opaque)
    // ASS alpha = 255 - 179 = 76 = 0x4C
    expect(hexToAssColor("#000000B3")).toBe("&H4C000000&");
  });

  it("handles the exact color that caused the original bug", () => {
    // #000000D0 was producing &HFF(2barg instead of valid hex
    const result = hexToAssColor("#000000D0");
    expect(result).toMatch(/^&H[0-9A-F]{8}&$/); // valid format
    expect(result).toBe("&H2F000000&");
  });
});
