import { useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { lotStatusClass, polygonPoints } from "./lotBlueprintUtils";
import "./LotBlueprint.css";

export default function BlueprintViewer({
  blueprint,
  lots,
  selectedLot,
  onSelectLot,
  children,
  className = "",
  showLabels = false,
  showSqm = false,
  showOpenSpaces = true,
  panMode = true,
  initialViewport,
  onViewportChange,
}) {
  const viewerRef = useRef(null);
  const [scale, setScale] = useState(initialViewport?.scale || 1);
  const pointerStart = useRef(null);
  const width = blueprint?.width || 1000;
  const height = blueprint?.height || 650;
  const imageUrl = blueprint?.image_url || blueprint?.display_url || blueprint?.blueprint_data || "";
  const visibleLots = showOpenSpaces ? lots : lots.filter((lot) => lotStatusClass(lot.status) !== "open-space");

  const polygonCenter = (coordinates = []) => {
    if (!coordinates.length) return [0, 0];
    return [
      coordinates.reduce((sum, point) => sum + Number(point[0] || 0), 0) / coordinates.length,
      coordinates.reduce((sum, point) => sum + Number(point[1] || 0), 0) / coordinates.length,
    ];
  };

  const enterFullscreen = () => {
    const element = viewerRef.current;
    if (element?.requestFullscreen) {
      element.requestFullscreen();
    }
  };

  return (
    <section className={`blueprint-viewer ${className}`} ref={viewerRef}>
      <TransformWrapper
        initialScale={initialViewport?.scale || 1}
        initialPositionX={initialViewport?.positionX || 0}
        initialPositionY={initialViewport?.positionY || 0}
        minScale={0.5}
        maxScale={4}
        centerOnInit={false}
        wheel={{ disabled: true }}
        pinch={{ disabled: true }}
        trackPadPanning={{ disabled: true }}
        autoAlignment={{ disabled: true }}
        velocityAnimation={{ disabled: true }}
        onTransform={(_, state) => { setScale(state.scale); onViewportChange?.(state); }}
        doubleClick={{ disabled: true }}
        panning={{ disabled: !panMode, velocityDisabled: true }}
      >
        {({ setTransform, instance }) => {
          const changeZoom = (step) => {
            const current = instance.state;
            const next = Math.min(4, Math.max(0.5, Math.round((current.scale + step) * 100) / 100));
            const wrapper = instance.wrapperComponent;
            const cx = (wrapper?.clientWidth || 0) / 2;
            const cy = (wrapper?.clientHeight || 0) / 2;
            const ratio = next / current.scale;
            setTransform(cx - (cx - current.positionX) * ratio, cy - (cy - current.positionY) * ratio, next, 0);
          };
          return (
          <>
            <div className="blueprint-toolbar">
              <button type="button" onClick={() => changeZoom(0.25)} disabled={scale >= 4}>
                + Zoom In
              </button>
              <button type="button" onClick={() => changeZoom(-0.25)} disabled={scale <= 0.5}>
                − Zoom Out
              </button>
              <output aria-label="Zoom level">{Math.round(scale * 100)}%</output>
              <button type="button" onClick={() => setTransform(0, 0, 1, 0)}>
                Reset
              </button>
              <button type="button" onClick={enterFullscreen}>
                Fullscreen
              </button>
            </div>
            <TransformComponent wrapperClass="blueprint-transform-wrapper" contentClass="blueprint-transform-content">
              <div className="blueprint-canvas" style={{ aspectRatio: `${width} / ${height}` }}>
                {imageUrl ? (
                  <img src={imageUrl} alt={blueprint?.name || "Subdivision blueprint"} draggable="false" />
                ) : (
                  <div className="blueprint-empty">Select or upload a blueprint image.</div>
                )}

                <svg
                  className="blueprint-svg-layer"
                  viewBox={`0 0 ${width} ${height}`}
                  preserveAspectRatio="none"
                  aria-label="Clickable lot map"
                  onPointerDown={(event) => { pointerStart.current = [event.clientX, event.clientY]; }}
                >
                  {visibleLots.map((lot) => {
                    const statusClass = lotStatusClass(lot.status);
                    const isSelected = selectedLot?.id === lot.id;
                    const [labelX, labelY] = polygonCenter(lot.coordinates);

                    return (
                      <g key={lot.id}>
                        <polygon
                          className={`lot-polygon ${statusClass} ${isSelected ? "selected" : ""}`}
                          points={polygonPoints(lot.coordinates)}
                          tabIndex="0"
                          role="button"
                          aria-label={`Block ${lot.block_number}, Lot ${lot.lot_number}, ${lot.status}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (pointerStart.current && Math.hypot(event.clientX - pointerStart.current[0], event.clientY - pointerStart.current[1]) > 4) return;
                            onSelectLot(lot);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectLot(lot);
                            }
                          }}
                        >
                          <title>{`Block ${lot.block_number} | Lot ${lot.lot_number} | ${lot.status}`}</title>
                        </polygon>
                        {(showLabels || showSqm) && (
                          <text className="lot-map-label" x={labelX} y={labelY} textAnchor="middle">
                            {showLabels && `L${lot.lot_number || "-"}`}
                            {showLabels && showSqm ? " | " : ""}
                            {showSqm && `${Number(lot.area_sqm || 0).toLocaleString()} sqm`}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                {children}
              </div>
            </TransformComponent>
          </>
        ); }}
      </TransformWrapper>
    </section>
  );
}
