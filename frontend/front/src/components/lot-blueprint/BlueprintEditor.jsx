import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BlueprintViewer from "./BlueprintViewer";
import { lotStatusClass, polygonPoints } from "./lotBlueprintUtils";
import "./LotBlueprint.css";
import { LOCATION_ZONES } from "../../pages/shared/lotDemandUtils";

const emptyDraft = {
  block_number: "",
  lot_number: "",
  area_sqm: "",
  price: "",
  status: "available",
  category: "",
  description: "",
  location_url: "",
  location_zone: "unassigned",
};

export function getSvgPoint(event, width, height) {
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * width;
  const y = ((event.clientY - rect.top) / rect.height) * height;

  return [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))];
}

export default function BlueprintEditor({
  blueprint,
  lots,
  selectedLot,
  onSelectLot,
  onSaveLot,
  onUpdateLot,
  onDeleteLot,
  onStatusChange,
  onImageSelected,
  isUploadingBlueprint = false,
  initialViewport,
  onViewportChange,
  initialLot,
  correctionRef,
  onDirtyChange,
}) {
  const [points, setPoints] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const originalDraft = useRef(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [tool, setTool] = useState(initialLot ? "select" : "draw");
  const initialized = useRef(false);
  const drag = useRef(null);
  const pointerStart = useRef(null);
  const suppressClick = useRef(false);
  const width = blueprint?.width || 1000;
  const height = blueprint?.height || 650;

  const editingLot = useMemo(
    () => lots.find((lot) => lot.id === editingId),
    [editingId, lots]
  );

  const flushRef = useRef(null);
  const startEdit = useCallback((lot) => {
    if (flushRef.current) {
      const staged = flushRef.current();
      if (staged === false) return;
      lot = staged.find((item) => item.id === lot.id) || lot;
    }
    setTool("select");
    setEditingId(lot.id);
    setPoints(lot.coordinates || []);
    const values = {
      block_number: lot.block_number || "",
      lot_number: lot.lot_number || "",
      area_sqm: lot.area_sqm ?? "",
      price: lot.price ?? "",
      status: lot.status || "available",
      category: lot.category || "",
      description: lot.description || "",
      location_url: lot.location_url || "",
      location_zone: lot.location_zone || "unassigned",
    };
    originalDraft.current = values;
    setDraft(values);
    onSelectLot(lot);
  }, [onSelectLot]);

  useEffect(() => {
    if (initialLot && !initialized.current) {
      initialized.current = true;
      startEdit(initialLot);
    }
  }, [initialLot, startEdit]);

  const resetDraft = () => {
    drag.current = null;
    setPoints([]);
    setDraft(emptyDraft);
    originalDraft.current = emptyDraft;
    setEditingId(null);
  };

  const removeEditingLot = () => {
    if (!editingLot) return;
    onDeleteLot(editingLot.id);
    resetDraft();
  };

  const splitEditingLot = () => {
    if (!editingLot || points.length < 4) return;
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const midX = Math.round((minX + maxX) / 2);
    const basePayload = {
      ...draft,
      area_sqm: Number(draft.area_sqm) / 2 || 0,
      price: Number(draft.price) / 2 || 0,
      subdivision: blueprint.name,
      phase: blueprint.phase,
      blueprint: blueprint.id,
    };

    onUpdateLot(editingLot.id, {
      ...basePayload,
      lot_number: `${draft.lot_number || editingLot.lot_number}A`,
      coordinates: [[minX, minY], [midX, minY], [midX, maxY], [minX, maxY]],
    });
    onSaveLot({
      ...basePayload,
      lot_number: `${draft.lot_number || editingLot.lot_number}B`,
      coordinates: [[midX, minY], [maxX, minY], [maxX, maxY], [midX, maxY]],
    });
    resetDraft();
  };

  const changes = Object.fromEntries(Object.keys(draft)
    .filter((field) => String(draft[field]) !== String(originalDraft.current[field]))
    .map((field) => [field, ["area_sqm", "price"].includes(field) ? (draft[field] === "" ? null : Number(draft[field])) : draft[field]]));
  if (editingLot && JSON.stringify(points) !== JSON.stringify(editingLot.coordinates)) changes.coordinates = points;
  const hasDraft = editingLot ? Object.keys(changes).length > 0 : points.length > 0 || Object.keys(draft).some((key) => draft[key] !== emptyDraft[key]);
  useEffect(() => { onDirtyChange?.(hasDraft); }, [hasDraft, onDirtyChange]);

  const flush = () => {
    if (!hasDraft) return lots;
    if (points.length < 3) {
      window.alert("Add at least three polygon points, or Clear the unfinished polygon before saving.");
      return false;
    }
    let next;
    if (editingLot) {
      onUpdateLot(editingLot.id, changes);
      next = lots.map((lot) => lot.id === editingLot.id ? { ...lot, ...changes } : lot);
    } else {
      const payload = { ...draft, area_sqm: draft.area_sqm === "" ? null : Number(draft.area_sqm), price: draft.price === "" ? null : Number(draft.price), coordinates: points, blueprint: blueprint.id };
      const created = onSaveLot(payload);
      next = created ? [...lots, created] : lots;
    }
    return next;
  };
  flushRef.current = correctionRef ? flush : null;
  if (correctionRef) correctionRef.current = { flush: () => { const next = flush(); if (next !== false) resetDraft(); return next; } };

  const submitLot = (event) => {
    event.preventDefault();
    if (flush() !== false) resetDraft();
  };

  const movePoint = (event) => {
    const gesture = drag.current;
    if (!gesture) return;
    if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) < 4 && !gesture.moved) return;
    gesture.moved = true;
    suppressClick.current = true;
    const nextPoint = getSvgPoint(event, width, height);
    if (gesture.index !== null) {
      setPoints((current) => current.map((point, index) => index === gesture.index ? nextPoint : point));
    } else {
      const xs = gesture.points.map((point) => point[0]);
      const ys = gesture.points.map((point) => point[1]);
      const dx = Math.max(-Math.min(...xs), Math.min(width - Math.max(...xs), nextPoint[0] - gesture.start[0]));
      const dy = Math.max(-Math.min(...ys), Math.min(height - Math.max(...ys), nextPoint[1] - gesture.start[1]));
      setPoints(gesture.points.map(([x, y]) => [x + dx, y + dy]));
    }
  };

  return (
    <section className="blueprint-editor">
      <div className="editor-header">
        <div>
          <p className="lot-panel-eyebrow">Admin Edit Mode</p>
          <h3>Manual Polygon Editor</h3>
        </div>
        <label className="blueprint-file-control">
          {isUploadingBlueprint ? "Detecting Lots..." : "Upload Blueprint"}
          <input
            type="file"
            accept="image/*"
            disabled={isUploadingBlueprint}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImageSelected(file);
            }}
          />
        </label>
      </div>

      <div className="editor-layout">
        <div className="editor-map">
        <div className="blueprint-toolbar" aria-label="Polygon tools">
          <button type="button" onClick={() => { if (flush() !== false) { resetDraft(); setTool("draw"); } }}>Add New Lot</button>
          {[["pan", "Pan Map"], ["select", "Select / Edit"], ["draw", "Draw Polygon"], ["move", "Move Polygon"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={tool === value} onClick={() => { drag.current = null; setTool(value); }}>{label}</button>
          ))}
        </div>
        <p className="lot-panel-muted">{tool === "pan" ? "Drag to pan the map." : tool === "draw" ? "Click empty map space to add points. Clear to start a new polygon." : tool === "move" ? "Drag the selected draft polygon to move it. Save to apply." : "Select a lot, then drag its handles to edit. Save to apply."}</p>
        <BlueprintViewer blueprint={blueprint} lots={[]} selectedLot={selectedLot} onSelectLot={onSelectLot} className="editor-viewer" panMode={tool === "pan"} initialViewport={initialViewport} onViewportChange={onViewportChange}>
          <svg
            className="blueprint-draw-layer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            onPointerDown={(event) => {
              suppressClick.current = false;
              pointerStart.current = [event.clientX, event.clientY];
              if (tool === "pan") return;
              const index = event.target.dataset.pointIndex;
              const moving = tool === "move" && event.target.classList.contains("draft-polygon");
              if ((tool === "select" && index !== undefined) || moving) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { index: moving ? null : Number(index), start: getSvgPoint(event, width, height), points: points.map((point) => [...point]), clientX: event.clientX, clientY: event.clientY };
              }
            }}
            onClick={(event) => {
              if (tool !== "draw" || suppressClick.current) return;
              if (pointerStart.current && Math.hypot(event.clientX - pointerStart.current[0], event.clientY - pointerStart.current[1]) > 4) return;
              if (event.target !== event.currentTarget) return;
              const nextPoint = getSvgPoint(event, width, height);
              setPoints((current) => [...current, nextPoint]);
            }}
            onPointerMove={movePoint}
            onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
          >
            {lots.map((lot) => {
              const statusClass = lotStatusClass(lot.status);
              const isSelected = selectedLot?.id === lot.id || editingId === lot.id;

              return (
                <polygon
                  key={lot.id}
                  className={`lot-polygon ${statusClass} ${isSelected ? "selected" : ""}`}
                  points={polygonPoints(lot.coordinates)}
                  role="button"
                  tabIndex="0"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (tool !== "select" || suppressClick.current) return;
                    startEdit(lot);
                  }}
                  onKeyDown={(event) => {
                    if (tool === "select" && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      startEdit(lot);
                    }
                  }}
                >
                  <title>{`Block ${lot.block_number || "-"} | Lot ${lot.lot_number || "-"} | ${lot.status}`}</title>
                </polygon>
              );
            })}
            {points.length > 1 && <polyline className="draft-polyline" points={polygonPoints(points)} />}
            {points.length >= 3 && <polygon className="draft-polygon" style={{ pointerEvents: tool === "move" ? "auto" : "none", cursor: "move" }} points={polygonPoints(points)} />}
            {points.map(([x, y], index) => (
              <circle
                key={index}
                data-point-index={index}
                className="draft-point"
                cx={x}
                cy={y}
                r="6"
                style={{ pointerEvents: tool === "select" ? "auto" : "none" }}
              />
            ))}
          </svg>
        </BlueprintViewer>
        </div>

        <aside className="editor-panel">
          <form onSubmit={submitLot} className="editor-form">
            <div className="editor-form-heading">
              <strong>{editingLot ? "Edit Lot Polygon" : "New Lot Polygon"}</strong>
              <span>{points.length} point{points.length === 1 ? "" : "s"}</span>
            </div>

            <label>
              Block Number
              <input value={draft.block_number} onChange={(event) => setDraft({ ...draft, block_number: event.target.value })} />
            </label>
            <label>
              Lot Number
              <input value={draft.lot_number} onChange={(event) => setDraft({ ...draft, lot_number: event.target.value })} />
            </label>
            <label>
              Area/sqm
              <input type="number" min="0" value={draft.area_sqm} onChange={(event) => setDraft({ ...draft, area_sqm: event.target.value })} />
            </label>
            <label>
              Price
              <input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
                <option value="open_space">Open Space</option>
              </select>
            </label>
            <label>
              Classification
              <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Category" />
            </label>
            <label>
              Description
              <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </label>
            <label>
              Location Zone
              <select value={draft.location_zone} onChange={(event) => setDraft({ ...draft, location_zone: event.target.value })} aria-describedby="location-zone-help">
                {LOCATION_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
              </select>
            </label>
            <p id="location-zone-help" className="lot-panel-muted">
              Confirm the subdivision entrance and zone boundaries before assigning a zone. Leave Unassigned until confirmed.
            </p>
            <label>
              Location
              <input
                value={draft.location_url}
                onChange={(event) => setDraft({ ...draft, location_url: event.target.value })}
                placeholder="Paste Google Maps link or address"
              />
            </label>

            <div className="editor-actions">
              <button type="submit" disabled={points.length < 3}>
                {correctionRef ? (editingLot ? "Apply to Draft" : "Add to Draft") : (editingLot ? "Update Lot" : "Save Polygon")}
              </button>
              {editingLot && (
                <button type="button" className="delete-lot-button" onClick={removeEditingLot}>
                  Remove Lot
                </button>
              )}
              {editingLot && (
                <button type="button" onClick={splitEditingLot} disabled={points.length < 4}>
                  Split Lot
                </button>
              )}
              <button type="button" onClick={resetDraft}>
                Clear
              </button>
            </div>
          </form>

          <div className="editor-lot-list">
            <strong>Existing Polygons</strong>
            {lots.map((lot) => (
              <div key={lot.id} className="editor-lot-row">
                <button type="button" onClick={() => startEdit(lot)}>
                  B{lot.block_number} L{lot.lot_number}
                  {lot.is_ai_detected ? " AI" : ""}
                </button>
                <select
                  value={lot.status}
                  className={lotStatusClass(lot.status)}
                  onChange={(event) => onStatusChange(lot.id, event.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="pending">Pending</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                  <option value="open_space">Open Space</option>
                </select>
                <button type="button" className="delete-lot-button" onClick={() => { onDeleteLot(lot.id); if (editingId === lot.id) resetDraft(); }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
