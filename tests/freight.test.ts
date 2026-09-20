import { describe, expect, it } from "vitest";
import { facilityKey, facilityType, normState, normStreet } from "../src/lib/freight/facilities";
import { looksLikeRateCon } from "../src/lib/mail/filter";
import { laneMedian } from "../src/lib/freight/profile";

describe("facility resolution", () => {
  it("lands the same dock on the same key regardless of formatting", () => {
    const a = facilityKey("4200 E. Airport Drive, Ste 4", "Ontario", "California", "Lineage");
    const b = facilityKey("4200 EAST AIRPORT DR", "ontario", "CA", "LINEAGE ONTARIO");
    expect(a).toBe(b);
  });
  it("falls back to name + city without a street", () => {
    expect(facilityKey(null, "Phoenix", "AZ", "SW Distribution Center")).toBe("name:sw distribution center|phoenix|AZ");
  });
  it("normalizes states and streets", () => {
    expect(normState("texas")).toBe("TX"); expect(normState("tx")).toBe("TX");
    expect(normStreet("900 West Rincon Street, Building B")).toBe("900 w rincon st");
  });
  it("types third-party cold storage", () => {
    expect(facilityType("Lineage Ontario 4", "Sunrise Frozen Foods")).toBe("3pl");
    expect(facilityType("Del Rio Produce DC", "Del Rio Produce Co")).toBe("dc");
  });
});

describe("rate con pre-filter", () => {
  it("accepts a PDF with a rate con subject", () => {
    expect(looksLikeRateCon("Rate Confirmation #4412", "please sign and return", ["ratecon.pdf"])).toBe(true);
  });
  it("rejects a newsletter", () => {
    expect(looksLikeRateCon("Weekly market update", "Spot rates rose 2% this week across dry van lanes.", [])).toBe(false);
  });
});

describe("lane median", () => {
  it("needs three loads and returns the middle value", () => {
    const rows = [1.9, 2.6, 2.2].map((perMile) => ({ originCity: "Ontario", destCity: "Phoenix", perMile }));
    expect(laneMedian(rows, "Ontario", "Phoenix")).toBe(2.2);
    expect(laneMedian(rows.slice(0, 2), "Ontario", "Phoenix")).toBeNull();
  });
});

import { subjectPasses } from "../src/lib/mail/filter";
describe("strict subject gate", () => {
  it("passes the subjects brokers actually use", () => {
    for (const s of ["Rate Confirmation #4412093", "RATE CON - Ontario to Phoenix", "Load Tender BG686349323", "Carrier Confirmation Load 88213", "Tender-BG686349323", "Load # 4412 pickup Thursday", "Dispatch Sheet 9921", "BOL and rate con attached"]) expect(subjectPasses(s), s).toBe(true);
  });
  it("drops the rest without a model call", () => {
    for (const s of ["Weekly market update", "Invoice #22910 past due", "Re: lunch Thursday", "Your QuickPay remittance", "Detention request load 4412"]) expect(subjectPasses(s), s).toBe(false);
  });
});
