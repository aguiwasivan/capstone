import api from "../api";

export function listBlueprints() {
  return api.get("blueprints/");
}

export function uploadBlueprint(formData) {
  return api.post("blueprints/upload/", formData);
}

export function publishBlueprint(blueprintId) {
  return api.post(`blueprints/${blueprintId}/publish/`);
}

export function listBlueprintPolygons(blueprintId) {
  return api.get(`blueprints/${blueprintId}/lots/`);
}

export function createBlueprintPolygon(blueprintId, payload) {
  return api.post(`blueprints/${blueprintId}/lots/`, payload);
}

export function updateBlueprintPolygon(lotId, payload) {
  return api.patch(`lots/${lotId}/`, payload);
}

export function deleteBlueprintPolygon(lotId) {
  return api.delete(`lots/${lotId}/`);
}

export function deleteBlueprint(blueprintId) {
  return api.delete(`blueprints/${blueprintId}/`);
}

export function saveBlueprintCorrections(blueprintId, payload) {
  return api.patch(`blueprints/${blueprintId}/lots/`, payload);
}
