import { zoneDemandRows, preliminaryZoneEstimate } from "./zoneDemandUtils";

test("preliminary estimates rank live scores and handle ties and missing zones", () => {
  const rows = [
    { label: "Rear Zone", available_lots: 2, average_score: 20 },
    { label: "Front Zone", available_lots: 3, average_score: 27 },
    { label: "Central Zone", available_lots: 4, average_score: 27 },
    { label: "Missing", available_lots: 0, average_score: null },
  ];
  const result = preliminaryZoneEstimate(rows);
  expect(result.ranked.map((row) => row.rank)).toEqual([1, 1, 3]);
  expect(result.message).toContain("Front Zone and Central Zone share");
  expect(preliminaryZoneEstimate(rows.slice(1, 3)).message).toContain("tied");
  expect(preliminaryZoneEstimate(rows.slice(0, 1)).message).toContain("only scored zone");
  expect(preliminaryZoneEstimate([]).ranked).toEqual([]);
});

const data = {
  model_available: true,
  distribution_by_zone: [{ location_zone: "front", available_lots: 2, scored_lots: 2, average_score: 50 },
    { location_zone: "unassigned", available_lots: 1, scored_lots: 1, average_score: 100 }],
  predictions: [0.2, 0.8].map((p) => ({ location_zone: "front", lot_status: "available", demand_probability: p })),
};

test("aggregates validated probabilities into expected lots, excluding unassigned and empty zones", () => {
  const rows = zoneDemandRows(data);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ expected_lots: 1, average_score: 50, available_lots: 2 });
  expect(rows[1]).toMatchObject({ expected_lots: null, average_score: null, available_lots: 0 });
});

test("does not turn heuristic scores or incomplete probabilities into forecasts", () => {
  expect(zoneDemandRows({ ...data, model_available: false })[0].expected_lots).toBeNull();
  expect(zoneDemandRows({ ...data, predictions: data.predictions.slice(0, 1) })[0].expected_lots).toBeNull();
  expect(zoneDemandRows({ ...data, predictions: data.predictions.map((p) => ({ ...p, demand_probability: null })) })[0].expected_lots).toBeNull();
});

test("zero is a valid prediction and score", () => {
  const zero = { ...data, distribution_by_zone: [{ ...data.distribution_by_zone[0], average_score: 0 }],
    predictions: data.predictions.map((p) => ({ ...p, demand_probability: 0 })) };
  expect(zoneDemandRows(zero)[0]).toMatchObject({ expected_lots: 0, average_score: 0 });
});
