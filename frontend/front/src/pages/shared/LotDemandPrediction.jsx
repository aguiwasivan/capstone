import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../../api";
import { hasScore, formatDemandScore, locationComparison } from "./lotDemandUtils";
import "../../components/RoleDashboard.css";
import "./LotDemandPrediction.css";
import { zoneDemandRows, preliminaryZoneEstimate } from "./zoneDemandUtils";
import AnalyticsSkeleton from "./AnalyticsSkeleton";

export default function LotDemandPrediction({ embedded = false }) {
  const refreshVersion = useAnalyticsRefresh();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [subdivisions, setSubdivisions] = useState([]);
  const [subdivisionId, setSubdivisionId] = useState("");
  const [subdivisionsLoading, setSubdivisionsLoading] = useState(true);
  const [subdivisionsError, setSubdivisionsError] = useState("");
  const [training, setTraining] = useState(false);
  const [trainingMessage, setTrainingMessage] = useState("");
  const [modelVersion, setModelVersion] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);

  const updateModel = async () => {
    setTraining(true);
    setTrainingMessage("");
    try {
      const response = await api.post("analytics/lot-demand/train/");
      setTrainingMessage(response.data.message);
      setModelVersion((version) => version + 1);
    } catch (error) {
      setTrainingMessage(error.response?.data?.detail || "Unable to update the prediction model.");
    } finally {
      setTraining(false);
    }
  };

  useEffect(() => {
    let active = true;
    setSubdivisionsError("");
    api.get("subdivisions/", { params: { compact: "true" } }).then(({ data: items }) => {
      if (!active) return;
      setSubdivisions(items);
      setSubdivisionId((current) => items.some((item) => String(item.id) === current) ? current : String(items[0]?.id || ""));
    }).catch(() => {
      if (active) setSubdivisionsError("Unable to load subdivisions.");
    }).finally(() => {
      if (active) setSubdivisionsLoading(false);
    });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    if (!subdivisionId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    let isActive = true;
    setIsLoading(true);
    setError("");

    api
      .get("analytics/lot-demand/", { params: { subdivision_id: subdivisionId } })
      .then((response) => {
        if (isActive) {
          setData(response.data);
        }
      })
      .catch((apiError) => {
        if (isActive) {
          setError(apiError.response?.data?.detail || "Unable to load zone demand analytics.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [refreshVersion, subdivisionId, modelVersion, retryVersion]);

  const locationRows = zoneDemandRows(data);
  const unassigned = data?.distribution_by_zone?.find((row) => row.location_zone === "unassigned");
  const comparison = locationComparison(locationRows);
  const assignedLots = locationRows.reduce((sum, row) => sum + row.available_lots, 0);
  const estimate = preliminaryZoneEstimate(locationRows);

  return (
    <div className={`lot-demand-analytics${embedded ? " embedded" : ""}`}>
      {!embedded && (
        <div className="role-dashboard-header">
          <div>
            <h1>Zone Demand</h1>
            <p>Compare demand across Front, Central, and Rear zones.</p>
          </div>
        </div>
      )}

      <div className="lot-demand-filters">
        <label>
          Subdivision
          <select value={subdivisionId} disabled={subdivisionsLoading || !subdivisions.length} onChange={(event) => {
            setSubdivisionId(event.target.value);
            setData(null);
            setIsLoading(true);
          }}>
            {!subdivisions.length && <option value="">{subdivisionsLoading ? "Loading subdivisions..." : "No subdivisions available"}</option>}
            {subdivisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {subdivisionsError && <p className="lot-demand-state error">{subdivisionsError}</p>}
      {!subdivisionsLoading && !subdivisionsError && !subdivisions.length && <p className="lot-demand-state">No subdivisions available.</p>}
      {(isLoading || subdivisionsLoading) && <AnalyticsSkeleton label={data && String(data.subdivision_id) === subdivisionId ? "Updating zone demand analytics..." : "Loading zone demand analytics..."} cards={4} charts={1} />}
      {error && <div className="analytics-section-error" role="alert"><p>{error}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry zone demand analytics</button></div>}

      {!isLoading && !error && data && String(data.subdivision_id) === subdivisionId && (
        <div className="analytics-section-content">
          <section className="role-panel lot-demand-mode-panel">
            <div>
              <strong>{data.model_available ? "30-Day Zone Demand Prediction" : "Preliminary Zone Demand Estimate"}</strong>
              <p>{data.model_available
                ? "Zone forecasts combine predictions for currently available lots. Expected lots means lots receiving at least one request within 30 days, not the total number of requests."
                : "Zone scores average the current demand scores of available lots. They are rankings out of 100, not probabilities or forecasts of reservation counts."}</p>
              {!data.model_available && <>
                <p className="lot-demand-insight" aria-live="polite">{estimate.message}</p>
                <div className="zone-estimate-visual" aria-label="Preliminary zone demand visualization">
                  <div className="zone-estimate-scale"><span>Demand score</span><span>0 to 100 points</span></div>
                  {[...estimate.ranked, ...locationRows.filter((row) => !hasScore(row.average_score))].map((row) => (
                    <div className="zone-estimate-row" key={row.location_zone} style={{ "--zone-color": row.color }}>
                      <div className="zone-estimate-label">
                        <strong>{row.rank ? `Rank ${row.rank}: ${row.label}` : row.label}</strong>
                        <span>{row.description}</span>
                      </div>
                      <div className="zone-estimate-value">
                        <strong>{formatDemandScore(row.average_score)}</strong>
                        {hasScore(row.average_score) ? <div className="zone-estimate-track" role="meter"
                          aria-label={`${row.label} demand score`} aria-valuemin={0} aria-valuemax={100}
                          aria-valuenow={row.average_score} aria-valuetext={formatDemandScore(row.average_score)}>
                          <div className="zone-estimate-fill" style={{ width: `${Math.max(0, Math.min(100, row.average_score))}%` }} />
                        </div> : <div className="zone-estimate-track zone-estimate-empty" aria-hidden="true" />}
                        <span>{row.scored_lots} scored / {row.available_lots} available lots</span>
                      </div>
                    </div>
                  ))}
                  <div className="zone-position-guide" aria-label="Relative zone positions, not to scale">
                    <span className="zone-position-rear">Rear</span>
                    <span className="zone-position-central">Central</span>
                    <span className="zone-position-front">Front</span>
                    <span className="zone-position-entrance">Entrance &#8594;</span>
                  </div>
                  <p>Relative positions only; not a lot map. Bar lengths show scores, not reservation probabilities.</p>
                </div>
                <p>Based on current lot prices, areas, and recent recorded reservation and sales activity, grouped by location. This preliminary estimate is not yet validated against future outcomes.</p>
                <details><summary>30-day model readiness</summary><p>{data.training_status?.message} {data.training_status?.valid_observations || 0} mature observations; {data.training_status?.pending_observations || 0} awaiting outcomes.</p></details>
              </>}
              <button type="button" disabled={training} onClick={updateModel}>{training ? "Updating model..." : "Update prediction model"}</button>
              {trainingMessage && <p role="status">{trainingMessage}</p>}
            </div>
          </section>

          <div className="role-stat-grid">
            <section className="role-stat-card lot-demand-top-zone">
              <p>Top Zone</p><strong>{comparison.top}</strong>
              <span>Highest average {data.model_available ? "predicted likelihood" : "demand score"}</span>
            </section>
            <section className="role-stat-card">
              <p>Available Lots in Zones</p><strong>{assignedLots}</strong><span>Front, Central, and Rear combined</span>
            </section>
            <section className="role-stat-card">
              <p>Unassigned Lots</p><strong>{unassigned?.available_lots || 0}</strong><span>Excluded from zone comparisons</span>
            </section>
          </div>

          <section className="role-panel lot-demand-chart-card">
            <h3>Demand by Zone</h3>
            <p className="lot-demand-note">{data.model_available ? "Average predicted 30-day request likelihood (%) per available lot." : "Average demand score per available lot (0-100)."} Averages allow comparison between zones with different inventory sizes.</p>
            <div className="lot-demand-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis domain={[0, 100]} width={42} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    const row = payload?.[0]?.payload;
                    return active && row ? <div className="lot-demand-tooltip"><strong>{row.label}</strong><p>Average: {data.model_available ? `${Number(row.average_score).toFixed(1)}%` : formatDemandScore(row.average_score)}</p><p>{row.scored_lots} scored / {row.available_lots} available lots</p></div> : null;
                  }} />
                  <Bar dataKey="average_score" name={data.model_available ? "Average Likelihood (%)" : "Average Demand Score"} radius={[4, 4, 0, 0]}>
                    {locationRows.map((row) => <Cell key={row.location_zone} fill={row.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!locationRows.some((row) => hasScore(row.average_score)) && <p className="lot-demand-state">No scored available lots in the assigned zones.</p>}
            {!data.model_available && <p className="lot-demand-insight" aria-live="polite">{comparison.insight}</p>}
          </section>

          <section className="role-panel properties-panel lot-demand-table-panel">
            <div className="properties-panel-header"><div><h2>Zone Demand Summary</h2><p>Location groups in the selected subdivision.</p></div></div>
            <div className="properties-table-wrap">
              <table className="properties-table lot-demand-table">
                <thead><tr><th>Zone</th><th>Location</th><th>Available Lots</th><th>Scored Lots</th><th>{data.model_available ? "Average Likelihood" : "Average Demand Score"}</th><th>{data.model_available ? "Expected Lots with Requests (30 Days)" : "Preliminary Rank"}</th></tr></thead>
                <tbody>{locationRows.map((row) => <tr key={row.location_zone}>
                  <td><span aria-hidden="true" style={{ color: row.color }}>&#9679; </span>{row.label}</td>
                  <td>{row.description}</td><td>{row.available_lots}</td><td>{row.scored_lots}</td>
                  <td>{data.model_available && hasScore(row.average_score) ? `${Number(row.average_score).toFixed(1)}%` : formatDemandScore(row.average_score)}</td>
                  <td>{data.model_available ? (row.expected_lots === null ? "Not available" : row.expected_lots.toFixed(1)) : (estimate.ranked.find((item) => item.location_zone === row.location_zone)?.rank ? `Rank ${estimate.ranked.find((item) => item.location_zone === row.location_zone).rank}` : "Not available")}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="lot-demand-note">Unassigned: {unassigned?.available_lots || 0} available lots. Assign their locations to include them in a zone. Empty zones have no demand score.</p>
          </section>
        </div>
      )}
    </div>
  );
}
