export const DEFAULT_BLUEPRINT_WIDTH = 1000;
export const DEFAULT_BLUEPRINT_HEIGHT = 650;

export function getBlueprintImage(blueprint) {
  return blueprint?.display_url || blueprint?.image_url || blueprint?.blueprint_data || blueprint?.image || "";
}

export function getBlueprintName(blueprint) {
  return blueprint?.name || blueprint?.title || blueprint?.subdivision || "Subdivision Blueprint";
}

export function normalizeCoordinates(value, width = DEFAULT_BLUEPRINT_WIDTH, height = DEFAULT_BLUEPRINT_HEIGHT) {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      const x = Array.isArray(point) ? point[0] : point?.x;
      const y = Array.isArray(point) ? point[1] : point?.y;
      const numericX = Number(x);
      const numericY = Number(y);
      return [
        numericX <= 1 ? numericX * width : numericX,
        numericY <= 1 ? numericY * height : numericY,
      ];
    })
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

export function normalizeLot(rawLot, blueprint = {}) {
  const width = Number(blueprint.width || DEFAULT_BLUEPRINT_WIDTH);
  const height = Number(blueprint.height || DEFAULT_BLUEPRINT_HEIGHT);
  const coordinates = normalizeCoordinates(
    rawLot.polygon_coordinates || rawLot.coordinates || rawLot.polygon_points || rawLot.points || [],
    width,
    height
  );

  return {
    id: rawLot.id || `${rawLot.block_number || rawLot.block || "B"}-${rawLot.lot_number || rawLot.lot || Date.now()}`,
    blueprint: rawLot.blueprint || blueprint.id || "",
    subdivision: rawLot.subdivision || rawLot.subdivision_name || getBlueprintName(blueprint),
    phase: rawLot.phase || blueprint.phase || "",
    block_number: String(rawLot.block_number || rawLot.block || ""),
    lot_number: String(rawLot.lot_number ?? rawLot.lot ?? ""),
    area_sqm: rawLot.area_sqm == null && !rawLot.area && !rawLot.size ? null : Number(rawLot.area_sqm ?? rawLot.area ?? rawLot.size),
    price: rawLot.price == null || rawLot.price === "" ? null : Number(rawLot.price),
    status: String(rawLot.status || "available").toLowerCase(),
    description: rawLot.description || "",
    category: rawLot.category ?? rawLot.model ?? rawLot.category_model ?? "",
    location_url: rawLot.location_url || rawLot.location || "",
    location_zone: rawLot.location_zone || "unassigned",
    confidence_score: Number(rawLot.confidence_score || 0),
    is_ai_detected: Boolean(rawLot.is_ai_detected),
    coordinates,
  };
}

export function normalizeBlueprint(rawBlueprint) {
  return {
    id: rawBlueprint.id || rawBlueprint.uuid || `blueprint-${Date.now()}`,
    name: getBlueprintName(rawBlueprint),
    phase: rawBlueprint.phase || "",
    image_url: getBlueprintImage(rawBlueprint),
    status: rawBlueprint.status || rawBlueprint.processing_status || "draft",
    processing_status: rawBlueprint.processing_status || "",
    width: Number(rawBlueprint.width || DEFAULT_BLUEPRINT_WIDTH),
    height: Number(rawBlueprint.height || DEFAULT_BLUEPRINT_HEIGHT),
    lots: Array.isArray(rawBlueprint.lots)
      ? rawBlueprint.lots.map((lot) => normalizeLot(lot, rawBlueprint))
      : [],
  };
}

export function polygonPoints(coordinates = []) {
  return coordinates.map(([x, y]) => `${x},${y}`).join(" ");
}

export function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!amount) return "-";

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

export function lotStatusClass(status) {
  if (status === "open_space" || status === "unavailable") return "open-space";
  if (status === "pending") return "pending";
  if (status === "reserved") return "reserved";
  if (status === "sold" || status === "occupied") return "sold";
  return "available";
}

export function coordinatesToApiPoints(coordinates = [], width = DEFAULT_BLUEPRINT_WIDTH, height = DEFAULT_BLUEPRINT_HEIGHT) {
  return coordinates.map(([x, y]) => [
    Number((Number(x) / width).toFixed(6)),
    Number((Number(y) / height).toFixed(6)),
  ]);
}

export function canManageLots(role) {
  return String(role || "").toLowerCase() === "admin";
}

export function canRequestReservation(role) {
  return String(role || "").toLowerCase() === "client";
}
