export const LOCATION_ZONES = [
  { value: "front", label: "Front Area" },
  { value: "central", label: "Central Area" },
  { value: "rear", label: "Rear Area" },
  { value: "unassigned", label: "Unassigned" },
];

export const zoneLabel = (value) => LOCATION_ZONES.find((zone) => zone.value === value)?.label || "Unassigned";
export const hasScore = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
export const formatDemandScore = (value) => hasScore(value) ? `${Number(value).toFixed(1)} / 100` : "Not scored";

export function locationComparison(rows = []) {
  const scored = rows.filter((row) => row.location_zone !== "unassigned" && row.scored_lots > 0 && hasScore(row.average_score));
  if (!scored.length) return { top: "—", insight: "Insufficient data to compare location demand." };
  const maximum = Math.max(...scored.map((row) => Number(row.average_score)));
  const minimum = Math.min(...scored.map((row) => Number(row.average_score)));
  const winners = scored.filter((row) => Number(row.average_score) === maximum);
  const top = `${winners.map((row) => zoneLabel(row.location_zone)).join(" / ")}${winners.length > 1 ? " (tie)" : ""}`;
  if (scored.length < 2) return { top, insight: "Insufficient data to compare location demand." };
  if (maximum === minimum) {
    return { top, insight: `The scored location zones have the same average demand score (${formatDemandScore(maximum)}): ${scored.map((row) => `${zoneLabel(row.location_zone)} (${row.scored_lots} scored available lots)`).join(", ")}.` };
  }
  const highest = winners[0];
  const lowest = scored.find((row) => Number(row.average_score) === minimum);
  return {
    top,
    insight: `${zoneLabel(highest.location_zone)} has a higher average demand score (${formatDemandScore(highest.average_score)}, ${highest.scored_lots} scored lots) than ${zoneLabel(lowest.location_zone)} (${formatDemandScore(lowest.average_score)}, ${lowest.scored_lots} scored lots) among currently scored available lots.`,
  };
}

export function demandTablePage(predictions, zone, page, pageSize = 10) {
  const filtered = predictions.filter((item) => zone === "all" || (item.location_zone || "unassigned") === zone);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), totalPages, currentPage,
    count: filtered.length, first: filtered.length ? start + 1 : 0, last: Math.min(start + pageSize, filtered.length) };
}
