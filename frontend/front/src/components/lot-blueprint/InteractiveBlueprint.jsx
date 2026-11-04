import { useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";
import {
  saveBlueprintCorrections,
  deleteBlueprint,
  listBlueprintPolygons,
  listBlueprints,
  publishBlueprint,
  uploadBlueprint,
} from "../../services/blueprintApi";
import BlueprintEditor from "./BlueprintEditor";
import BlueprintViewer from "./BlueprintViewer";
import LotDetailsPanel from "./LotDetailsPanel";
import LotFilterBar from "./LotFilterBar";
import {
  canManageLots,
  coordinatesToApiPoints,
  lotStatusClass,
  normalizeBlueprint,
  normalizeLot,
} from "./lotBlueprintUtils";
import "./LotBlueprint.css";
import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";

const emptyFilters = {
  block: "",
  lot: "",
  status: "all",
  phase: "",
};

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function sumPrices(items) {
  return items.reduce((sum, lot) => sum + Number(lot.price || 0), 0);
}

function formatPeso(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  });
}

export default function InteractiveBlueprint({ mode = "auto" }) {
  const refreshVersion = useAnalyticsRefresh();
  const viewports = useRef({});
  const { user } = useContext(AuthContext);
  const role = user?.role || "agent";
  const isAdminMode = mode === "admin" || (mode === "auto" && canManageLots(role));
  const [blueprints, setBlueprints] = useState([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState(() => sessionStorage.getItem("selectedBlueprintId") || "");
  const [lotsByBlueprint, setLotsByBlueprint] = useState({});
  const [selectedLotRef, setSelectedLot] = useState(null);
  const baseline = useRef(null);
  const editor = useRef(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [isEditMode, setIsEditMode] = useState(false);
  const [detailsLot, setDetailsLot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lotsError, setLotsError] = useState("");
  const [lotsLoading, setLotsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isUploadingBlueprint, setIsUploadingBlueprint] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [recentLots, setRecentLots] = useState([]);

  const selectedBlueprint = useMemo(
    () => blueprints.find((blueprint) => String(blueprint.id) === String(selectedBlueprintId)) || blueprints[0] || null,
    [blueprints, selectedBlueprintId]
  );

  const lots = useMemo(
    () => (selectedBlueprint?.id ? lotsByBlueprint[selectedBlueprint.id] || [] : []),
    [lotsByBlueprint, selectedBlueprint?.id]
  );

  const selectedLot = lots.find((lot) => lot.id === selectedLotRef?.id) || null;
  const stagedDirty = baseline.current !== null && JSON.stringify(lots) !== JSON.stringify(baseline.current);
  const dirty = stagedDirty || draftDirty;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const discardCorrections = () => {
    if (saving) return false;
    if (dirty && !window.confirm("Discard unsaved corrections?")) return false;
    if (baseline.current) setCurrentLots(baseline.current);
    baseline.current = null;
    setDraftDirty(false);
    setEditorVersion((value) => value + 1);
    return true;
  };

  const enterCorrectionMode = (lot = null) => {
    baseline.current = lots;
    setDetailsLot(lot);
    setIsEditMode(true);
    setMessage("");
  };

  const saveCorrections = async () => {
    if (saving || !selectedBlueprint) return;
    const currentLots = editor.current ? editor.current.flush() : lots;
    if (!currentLots) return;
    const original = baseline.current || [];
    const fields = ["lot_number", "block_number", "category", "location_zone", "status", "description", "area_sqm", "price", "location_url", "coordinates"];
    const updates = [], creates = [];
    for (const lot of currentLots) {
      const previous = original.find((item) => item.id === lot.id);
      const changes = {};
      for (const field of fields) {
        if (!previous || JSON.stringify(previous[field]) !== JSON.stringify(lot[field])) {
          changes[field] = field === "coordinates" ? coordinatesToApiPoints(lot[field], selectedBlueprint.width, selectedBlueprint.height) : lot[field];
        }
      }
      if (!previous) creates.push({ id: lot.id, ...changes });
      else if (Object.keys(changes).length) updates.push({ id: lot.id, ...changes });
    }
    const deletes = original.filter((lot) => !currentLots.some((item) => item.id === lot.id)).map((lot) => lot.id);
    if (!updates.length && !creates.length && !deletes.length) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await saveBlueprintCorrections(selectedBlueprint.id, { updates, creates, deletes });
      const saved = response.data.map((lot) => normalizeLot(lot, selectedBlueprint));
      setCurrentLots(saved);
      baseline.current = saved;
      setDraftDirty(false);
      setDetailsLot(null);
      setEditorVersion((value) => value + 1);
      setMessage("Corrections saved successfully.");
    } catch (error) {
      const detail = error.response?.data;
      setMessage(`Unable to save corrections. Your edits are preserved. ${detail ? JSON.stringify(detail) : "Check your connection and try again."}`);
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (selectedBlueprint?.id) sessionStorage.setItem("selectedBlueprintId", String(selectedBlueprint.id));
  }, [selectedBlueprint?.id]);

  const filteredLots = useMemo(() => {
    return lots.filter((lot) => {
      const blockMatch = String(lot.block_number || "").toLowerCase().includes(filters.block.trim().toLowerCase());
      const lotMatch = String(lot.lot_number || "").toLowerCase().includes(filters.lot.trim().toLowerCase());
      const statusMatch = filters.status === "all" || lot.status === filters.status;
      const phaseMatch = String(lot.phase || selectedBlueprint?.phase || "").toLowerCase().includes(filters.phase.trim().toLowerCase());

      return blockMatch && lotMatch && statusMatch && phaseMatch;
    });
  }, [filters, lots, selectedBlueprint?.phase]);

  const dashboardStats = useMemo(() => {
    const totalLots = lots.filter((lot) => lot.status !== "open_space").length;
    const availableLots = lots.filter((lot) => lot.status === "available");
    const pendingLots = lots.filter((lot) => lot.status === "pending");
    const reservedLots = lots.filter((lot) => lot.status === "reserved");
    const soldLots = lots.filter((lot) => lot.status === "sold");

    return [
      { label: "Total Lots", value: totalLots.toLocaleString(), meta: "Excludes open spaces; entire subdivision" },
      { label: "Available Lots", value: availableLots.length.toLocaleString(), meta: `${percentage(availableLots.length, totalLots)}% of total` },
      { label: "Pending Lots", value: pendingLots.length.toLocaleString(), meta: `${percentage(pendingLots.length, totalLots)}% of total` },
      { label: "Reserved Lots", value: reservedLots.length.toLocaleString(), meta: `${percentage(reservedLots.length, totalLots)}% of total` },
      { label: "Sold Lots", value: soldLots.length.toLocaleString(), meta: `${percentage(soldLots.length, totalLots)}% of total` },
      { label: "Occupancy Rate", value: `${percentage(reservedLots.length + soldLots.length, totalLots)}%`, meta: "Reserved + sold" },
      { label: "Total Inventory Value", value: formatPeso(sumPrices(availableLots)), meta: "Available lot prices" },
    ];
  }, [lots]);

  const selectLot = (lot) => {
    setSelectedLot(lot);
    if (!lot) return;
    setRecentLots((current) => [
      lot,
      ...current.filter((item) => item.id !== lot.id),
    ].slice(0, 6));
  };

  const setCurrentLots = (nextLots) => {
    setLotsByBlueprint((current) => ({
      ...current,
      ...(selectedBlueprint?.id ? { [selectedBlueprint.id]: nextLots } : {}),
    }));
  };

  useEffect(() => {
    if (isEditMode) return;
    let isMounted = true;

    const loadBlueprints = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await listBlueprints();
        const nextBlueprints = response.data?.length
          ? response.data.map(normalizeBlueprint)
          : [];
        const nextLots = {};

        nextBlueprints.forEach((blueprint) => {
          nextLots[blueprint.id] = blueprint.lots?.length ? blueprint.lots : [];
        });

        if (!isMounted) return;

        setBlueprints(nextBlueprints);
        setLotsByBlueprint((current) => ({ ...current, ...nextLots }));
        setSelectedBlueprintId((current) => nextBlueprints.some((item) => String(item.id) === String(current)) ? current : nextBlueprints[0]?.id || "");
      } catch {
        if (isMounted) {
          setLoadError("Unable to load blueprints. Inventory statistics are unavailable.");
          setBlueprints([]);
          setLotsByBlueprint({});
          setSelectedBlueprintId("");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadBlueprints();

    return () => {
      isMounted = false;
    };
  }, [refreshVersion, isEditMode]);

  useEffect(() => {
    if (!selectedBlueprint?.id || isEditMode) return;

    let isMounted = true;

    const loadLots = async () => {
      setLotsLoading(true);
      setLotsError("");
      try {
        const response = await listBlueprintPolygons(selectedBlueprint.id);
        if (!isMounted) return;
        setLotsByBlueprint((current) => ({
          ...current,
          [selectedBlueprint.id]: response.data.map((lot) => normalizeLot(lot, selectedBlueprint)),
        }));
      } catch {
        if (isMounted) {
          setLotsError("Unable to refresh lot records. Displayed map data may be outdated.");
          setLotsByBlueprint((current) => ({
            ...current,
            [selectedBlueprint.id]: current[selectedBlueprint.id] || [],
          }));
        }
      } finally {
        if (isMounted) setLotsLoading(false);
      }
    };

    loadLots();
    return () => {
      isMounted = false;
    };
  }, [selectedBlueprint, isEditMode]);

  const handleImageSelected = async (file) => {
    if (!discardCorrections()) return;
    setIsEditMode(false);
    const formData = new FormData();
    formData.append("title", file.name.replace(/\.[^.]+$/, "") || "Subdivision Blueprint");
    formData.append("image", file);

    setIsUploadingBlueprint(true);
    setMessage("Uploading blueprint and detecting lot polygons...");

    try {
      const response = await uploadBlueprint(formData);
      const blueprint = normalizeBlueprint(response.data);
      const detectedLots = (response.data.lots || response.data.blueprint_lots || []).map((lot) =>
        normalizeLot(lot, blueprint)
      );

      setBlueprints((current) => [blueprint, ...current.filter((item) => item.id !== blueprint.id)]);
      setLotsByBlueprint((current) => ({ ...current, [blueprint.id]: detectedLots }));
      setSelectedBlueprintId(blueprint.id);
      selectLot(null);
      setMessage(
        detectedLots.length
          ? `${detectedLots.length} lot polygon${detectedLots.length === 1 ? "" : "s"} detected. Review and edit before publishing.`
          : "Blueprint uploaded, but no lot polygons were confidently detected. Use admin edit mode to add polygons manually."
      );
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to upload and process this blueprint.");
    } finally {
      setIsUploadingBlueprint(false);
    }
  };

  const removeSelectedBlueprint = async () => {
    if (!discardCorrections()) return;
    setIsEditMode(false);
    if (!selectedBlueprint?.id) {
      setMessage("No blueprint selected.");
      return;
    }

    const shouldRemove = window.confirm(`Remove ${selectedBlueprint.name}? This will also remove its lot polygons.`);
    if (!shouldRemove) return;

    const blueprintId = selectedBlueprint.id;
    const nextBlueprints = blueprints.filter((blueprint) => blueprint.id !== blueprintId);
    const fallbackBlueprint = nextBlueprints[0] || null;

    setBlueprints(nextBlueprints);
    setLotsByBlueprint((current) => {
      const nextLots = { ...current };
      delete nextLots[blueprintId];
      return nextLots;
    });
    setSelectedBlueprintId(fallbackBlueprint?.id || "");
    selectLot(null);

    try {
      if (!String(blueprintId).startsWith("local-")) {
        await deleteBlueprint(blueprintId);
      }
      setMessage("Blueprint removed.");
    } catch (error) {
      setBlueprints(blueprints);
      setLotsByBlueprint(lotsByBlueprint);
      setSelectedBlueprintId(blueprintId);
      setMessage(error.response?.data?.detail || "Unable to remove blueprint. Server records are unchanged.");
    }
  };

  const saveLot = (payload) => {
    const lot = { ...normalizeLot(payload, selectedBlueprint), coordinates: payload.coordinates, id: crypto.randomUUID() };
    setLotsByBlueprint((current) => ({ ...current, [selectedBlueprint.id]: [...(current[selectedBlueprint.id] || []), lot] }));
    selectLot(lot);
    return lot;
  };

  const updateLot = (lotId, payload) => {
    setLotsByBlueprint((current) => ({ ...current, [selectedBlueprint.id]: current[selectedBlueprint.id].map((lot) => lot.id === lotId ? { ...lot, ...payload } : lot) }));
  };

  const deleteLot = (lotId) => {
    setLotsByBlueprint((current) => ({ ...current, [selectedBlueprint.id]: current[selectedBlueprint.id].filter((lot) => lot.id !== lotId) }));
  };

  const updateStatus = (lotId, status) => {
    const lot = lots.find((item) => item.id === lotId);
    if (!lot) return;
    updateLot(lotId, { status });
  };

  const requestReservation = async (lot) => {
    setIsRequesting(true);
    setRequestMessage("");

    try {
      await api.post("reservation-requests/", { lot_id: lot.id });
      setRequestMessage("Reservation request sent for approval.");
      // The reservation endpoint persists this status; clients cannot PATCH admin lot fields.
      setCurrentLots(lots.map((item) => item.id === lot.id ? { ...item, status: "pending" } : item));
      selectLot({ ...lot, status: "pending" });
    } catch (error) {
      setRequestMessage(error.response?.data?.detail || "Unable to send reservation request.");
    } finally {
      setIsRequesting(false);
    }
  };

  const publishSelectedBlueprint = async () => {
    if (!selectedBlueprint?.id) {
      setMessage("Upload and review a blueprint before publishing.");
      return;
    }

    try {
      const response = await publishBlueprint(selectedBlueprint.id);
      const published = normalizeBlueprint(response.data);
      setBlueprints((current) => current.map((blueprint) => (blueprint.id === published.id ? published : blueprint)));
      setLotsByBlueprint((current) => ({
        ...current,
        [published.id]: (response.data.lots || response.data.blueprint_lots || []).map((lot) => normalizeLot(lot, published)),
      }));
      setMessage("Blueprint published. Public viewers will now see the admin-approved polygons.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to publish this blueprint.");
    }
  };

  return (
    <main className="interactive-blueprint-page">
      <section className="blueprint-page-header">
        <div>
          <p className="lot-panel-eyebrow">Interactive Lot Visualization</p>
          <h1>Interactive Blueprint</h1>
          <p>AI-assisted lot detection with admin-reviewed polygon overlays.</p>
        </div>
        <div className="blueprint-header-actions">
          <label className="blueprint-subdivision-control">
            Subdivision
            <select value={selectedBlueprintId} disabled={saving} onChange={(event) => { if (discardCorrections()) { setIsEditMode(false); setSelectedLot(null); setRecentLots([]); setSelectedBlueprintId(event.target.value); } }}>
              {!blueprints.length && <option value="">No blueprint uploaded</option>}
              {blueprints.map((blueprint) => (
                <option key={blueprint.id} value={blueprint.id}>
                  {blueprint.name}
                </option>
              ))}
            </select>
          </label>
          {selectedBlueprint?.status && (
            <span className="blueprint-status-pill">{selectedBlueprint.status}</span>
          )}
          {isAdminMode && (
            <>
              <label className="blueprint-file-control">
                {isUploadingBlueprint ? "Processing..." : "Add Blueprint"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingBlueprint || saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) handleImageSelected(file);
                  }}
                />
              </label>
              <button type="button" className="edit-mode-button" disabled={saving || lotsLoading || isLoading} onClick={() => { if (isEditMode) { if (discardCorrections()) setIsEditMode(false); } else enterCorrectionMode(); }}>
                {isEditMode ? "Preview" : "Correction Mode"}
              </button>
              {isEditMode && <button type="button" className={`save-corrections-button ${dirty ? "has-changes" : ""}`} disabled={!dirty || saving} onClick={saveCorrections}>{saving ? "Saving..." : "Save Corrections"}</button>}
              {dirty && <span role="status">Unsaved Changes</span>}
              <button type="button" className="edit-mode-button" disabled={dirty || saving} onClick={publishSelectedBlueprint}>
                Publish
              </button>
              <button
                type="button"
                className="remove-blueprint-button"
                onClick={removeSelectedBlueprint}
                disabled={!selectedBlueprint?.id || saving}
              >
                Remove Blueprint
              </button>
            </>
          )}
        </div>
      </section>

      <LotFilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(emptyFilters)} />

      {message && <p className="blueprint-message" role="status">{message}</p>}
      {isLoading && <p className="blueprint-message">Loading blueprints...</p>}
      {(loadError || lotsError) && <p className="blueprint-message" role="alert">{loadError || lotsError}</p>}

      {selectedBlueprint && !isLoading && !lotsLoading && !loadError && !lotsError && (
        <section className="blueprint-stats-grid" aria-label="Subdivision statistics">
          {dashboardStats.map((stat) => (
            <article key={stat.label} className="blueprint-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.meta}</small>
            </article>
          ))}
        </section>
      )}

      {!selectedBlueprint && !isLoading && !loadError && (
        <section className="empty-blueprint-state">
          <p className="lot-panel-eyebrow">No Blueprint Uploaded</p>
          <h2>Upload a subdivision blueprint to begin.</h2>
          {isAdminMode ? (
            <label className="blueprint-file-control">
              {isUploadingBlueprint ? "Detecting Lots..." : "Upload Blueprint"}
              <input
                type="file"
                accept="image/*"
                disabled={isUploadingBlueprint || saving}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) handleImageSelected(file);
                }}
              />
            </label>
          ) : (
            <p>No interactive subdivision map is available yet.</p>
          )}
        </section>
      )}

      {selectedBlueprint && isEditMode && isAdminMode ? (
        <>
        <fieldset disabled={saving} className="correction-workspace">
        <BlueprintEditor
          correctionRef={editor}
          onDirtyChange={setDraftDirty}
          initialLot={detailsLot}
          key={`${selectedBlueprint.id}-${editorVersion}`} 
          initialViewport={viewports.current[selectedBlueprint.id]}
          onViewportChange={(viewport) => { viewports.current[selectedBlueprint.id] = viewport; }}
          blueprint={selectedBlueprint}
          lots={lots}
          selectedLot={selectedLot}
          onSelectLot={selectLot}
          onSaveLot={saveLot}
          onUpdateLot={updateLot}
          onDeleteLot={deleteLot}
          onStatusChange={updateStatus}
          onImageSelected={handleImageSelected}
          isUploadingBlueprint={isUploadingBlueprint}
        />
        </fieldset>
        <LotDetailsPanel lot={selectedLot} role={role} />
        </>
      ) : selectedBlueprint ? (
        <>
          <section className="blueprint-gis-workspace">
            <BlueprintViewer
              key={selectedBlueprint.id}
              initialViewport={viewports.current[selectedBlueprint.id]}
              onViewportChange={(viewport) => { viewports.current[selectedBlueprint.id] = viewport; }}
              blueprint={selectedBlueprint}
              lots={filteredLots}
              selectedLot={selectedLot}
              onSelectLot={selectLot}
              showOpenSpaces
              panMode
            />

            <LotDetailsPanel
              onEditDetails={isAdminMode ? () => enterCorrectionMode(selectedLot) : undefined}
              lot={selectedLot}
              role={role}
              isRequesting={isRequesting}
              requestMessage={requestMessage}
              onRequestReservation={requestReservation}
            />
          </section>

          <section className="recent-lots-panel">
            <div className="recent-lots-heading">
              <p className="lot-panel-eyebrow">Recently Selected Lots</p>
              <h3>Quick Jump</h3>
            </div>
            <div className="recent-lots-list">
              {recentLots.length ? recentLots.map((recent) => lots.find((lot) => lot.id === recent.id)).filter(Boolean).map((lot) => (
                <article key={lot.id} className="recent-lot-card">
                  <strong>B{lot.block_number || "-"} L{lot.lot_number || "-"}</strong>
                  <span>{Number(lot.area_sqm || 0).toLocaleString()} sqm</span>
                  <span className={`lot-status-badge ${lotStatusClass(lot.status)}`}>{lot.status}</span>
                  <button type="button" onClick={() => selectLot(lot)}>Jump</button>
                </article>
              )) : <p className="lot-panel-muted">Select a polygon to build a quick access list.</p>}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
