import { demandTablePage, formatDemandScore, locationComparison } from "./lotDemandUtils";

test("missing scores stay missing and zero remains a score", () => {
  expect(formatDemandScore(null)).toBe("Not scored");
  expect(formatDemandScore(0)).toBe("0.0 / 100");
});

test("comparison uses scored zones, handles ties, and excludes Unassigned", () => {
  const rows = [
    { location_zone: "front", average_score: 75, scored_lots: 3 },
    { location_zone: "rear", average_score: 42, scored_lots: 2 },
    { location_zone: "unassigned", average_score: 100, scored_lots: 10 },
  ];
  expect(locationComparison(rows).top).toBe("Front Area");
  expect(locationComparison(rows).insight).toContain("75.0 / 100, 3 scored lots");
  expect(locationComparison(rows).insight).toContain("42.0 / 100, 2 scored lots");
  rows[1].average_score = 75;
  expect(locationComparison(rows).top).toBe("Front Area / Rear Area (tie)");
  expect(locationComparison(rows).insight).toContain("same average demand score");
  expect(locationComparison([]).insight).toBe("Insufficient data to compare location demand.");
  expect(locationComparison(rows.slice(0, 1)).insight).toBe("Insufficient data to compare location demand.");
});

test("zone filtering precedes pagination and empty results have a valid page", () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ lot_id: i, location_zone: i < 12 ? "front" : "rear" }));
  expect(demandTablePage(rows, "front", 2).rows).toHaveLength(2);
  expect(demandTablePage(rows, "front", 2).first).toBe(11);
  expect(demandTablePage(rows, "rear", 1).rows[0].lot_id).toBe(12);
  expect(demandTablePage(rows, "central", 3)).toMatchObject({ rows: [], count: 0, first: 0, last: 0, currentPage: 1 });
});
