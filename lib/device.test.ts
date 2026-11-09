import { describe, expect, it } from "vitest";
import { describeDevice, isNewDevice } from "./device";

describe("device", () => {
  it("descreve navegador e sistema", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome no Windows");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari no iPhone/iPad");
  });
  it("só avisa quando já havia aparelho conhecido diferente", () => {
    expect(isNewDevice([], "Chrome no Windows")).toBe(false);
    expect(isNewDevice([null, null], "Chrome no Windows")).toBe(false);
    expect(isNewDevice(["Chrome no Windows"], "Chrome no Windows")).toBe(false);
    expect(isNewDevice(["Chrome no Windows"], "Safari no Mac")).toBe(true);
  });
});
