import { hasScore } from "./lotDemandUtils";

const ZONES = [
  { location_zone: "front", label: "Front Zone", color: "#ea580c", description: "Near the entrance / main access" },
  { location_zone: "central", label: "Central Zone", color: "#15803d", description: "Interior / middle lots" },
  { location_zone: "rear", label: "Rear Zone", color: "#2563eb", description: "Farthest from the entrance" },
];

export function preliminaryZoneEstimate(rows) {
  const scored = rows.filter((row) => row.available_lots > 0 && hasScore(row.average_score));
  const ranked = scored.map((row) => ({
    ...row,
    rank: 1 + scored.filter((other) => other.average_score > row.average_score).length,
  })).sort((a, b) => a.rank - b.rank);
  const leaders = ranked.filter((row) => row.rank === 1);
  let message = "Assign locations to available lots with demand scores to generate an estimate.";
  if (ranked.length === 1) message = `${ranked[0].label} is the only scored zone. More scored zones are needed for a comparison.`;
  if (ranked.length > 1) {
    message = leaders.length === ranked.length
      ? "The scored zones are tied; current signals do not favor one zone."
      : `${leaders.map((row) => row.label).join(" and ")} ${leaders.length > 1 ? "share" : "has"} the strongest current demand signals. If current conditions continue, ${leaders.length > 1 ? "these zones are" : "this zone is"} the preliminary choice for stronger buyer interest per available lot.`;
  }
  return { ranked, message };
}

export function zoneDemandRows(data) {
  return ZONES.map((zone) => {
    const summary = data?.distribution_by_zone?.find((row) => row.location_zone === zone.location_zone);
    const available = Number(summary?.available_lots || 0);
    const scored = Number(summary?.scored_lots || 0);
    const lots = (data?.predictions || []).filter((lot) => lot.location_zone === zone.location_zone && lot.lot_status === "available");
    // Sum event probabilities, not scores: this estimates distinct lots with
    // at least one request. Never manufacture a forecast from heuristic scores.
    const complete = data?.model_available && available > 0 && lots.length === available && lots.every((lot) =>
      hasScore(lot.demand_probability) && Number(lot.demand_probability) >= 0 && Number(lot.demand_probability) <= 1);
    return {
      ...zone, available_lots: available, scored_lots: scored,
      average_score: available > 0 && scored > 0 && hasScore(summary?.average_score) ? Number(summary.average_score) : null,
      expected_lots: complete ? lots.reduce((sum, lot) => sum + Number(lot.demand_probability), 0) : null,
    };
  });
}
