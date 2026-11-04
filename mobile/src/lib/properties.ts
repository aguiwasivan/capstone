import type { Blueprint, Lot, Property } from './types';

const rank: Record<string, number> = { available: 0, pending: 1, reserved: 2, unavailable: 3, occupied: 4, sold: 5 };
function numberKey(value: string | number) {
  const digits = String(value).replace(/\D/g, '');
  return digits ? String(Number(digits)) : '';
}
const identity = (name: string, block: string, number: string | number) => JSON.stringify([name, block, numberKey(number)]);
export const canReview = (role: string) => ['admin', 'manager', 'broker'].includes(role);
export const canReserve = (role: string, property: Property) => role === 'client' && property.status === 'available' && !property.needsReview;

export function buildProperties(lots: Lot[], blueprints: Blueprint[]): Property[] {
  const published = blueprints.filter((blueprint) => blueprint.status === 'published');
  const counts = new Map<string, number>();
  const inventory = new Map(lots.map((lot) => [identity(lot.subdivision_name || '', lot.block, lot.lot_number), lot]));
  for (const blueprint of published) for (const lot of blueprint.lots || []) {
    if (lot.status === 'open_space') continue;
    const key = identity(blueprint.title || 'Subdivision Blueprint', lot.block_number, lot.lot_number);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const represented = new Set<number>();
  const properties: Property[] = [];
  for (const blueprint of published) for (const lot of blueprint.lots || []) {
    if (lot.status === 'open_space') continue;
    const subdivision = blueprint.title || 'Subdivision Blueprint';
    const key = identity(subdivision, lot.block_number, lot.lot_number);
    const existing = inventory.get(key);
    const ambiguous = (counts.get(key) || 0) > 1 || !numberKey(lot.lot_number);
    if (existing) represented.add(existing.id);
    // If either web representation is unavailable, do not offer a reservation.
    const state = existing && !ambiguous && (rank[existing.status] ?? 3) > (rank[lot.status] ?? 3) ? existing.status : lot.status;
    properties.push({
      key: `map-${lot.id}`, reservationId: existing && !ambiguous ? existing.id : lot.id,
      title: `Lot ${numberKey(lot.lot_number) || lot.lot_number}`, subdivision,
      block: lot.block_number, number: String(lot.lot_number),
      area: Number(lot.area_sqm || lot.size || existing?.area || 0),
      price: Number(lot.price || existing?.price || 0), status: state,
      image: existing?.photo_data || blueprint.display_url || blueprint.image_url,
      location: lot.location_url || existing?.location_url,
      needsReview: ambiguous,
    });
  }
  for (const lot of lots) if (!represented.has(lot.id)) properties.push({
    key: `lot-${lot.id}`, reservationId: lot.id, title: `Lot ${lot.lot_number}`,
    subdivision: lot.subdivision_name || 'Subdivision', block: lot.block, number: String(lot.lot_number),
    area: Number(lot.area), price: Number(lot.price), status: lot.status,
    image: lot.photo_data, location: lot.location_url, needsReview: false,
  });
  return properties.sort((a, b) => a.subdivision.localeCompare(b.subdivision) || a.block.localeCompare(b.block, undefined, { numeric: true }) || a.number.localeCompare(b.number, undefined, { numeric: true }));
}
