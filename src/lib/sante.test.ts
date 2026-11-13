import { describe, expect, it } from "vitest";
import { sante } from "./sante";

describe("sante", () => {
  it("répond ok", () => {
    expect(sante()).toEqual({ statut: "ok" });
  });
});
