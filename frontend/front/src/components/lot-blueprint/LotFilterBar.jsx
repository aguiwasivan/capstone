import "./LotBlueprint.css";

export default function LotFilterBar({ filters, onChange, onReset }) {
  const updateFilter = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <section className="lot-filter-bar" aria-label="Lot filters">
      <label>
        <span>Block</span>
        <input
          type="search"
          value={filters.block}
          onChange={(event) => updateFilter("block", event.target.value)}
          placeholder="Search block"
        />
      </label>
      <label>
        <span>Lot</span>
        <input
          type="search"
          value={filters.lot}
          onChange={(event) => updateFilter("lot", event.target.value)}
          placeholder="Search lot"
        />
      </label>
      <label>
        <span>Status</span>
        <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="all">All Status</option>
          <option value="available">Available</option>
          <option value="pending">Pending</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
          <option value="open_space">Open Space</option>
        </select>
      </label>
      <label>
        <span>Phase</span>
        <input
          type="search"
          value={filters.phase}
          onChange={(event) => updateFilter("phase", event.target.value)}
          placeholder="Search phase"
        />
      </label>
      <button type="button" className="lot-filter-reset" onClick={onReset}>
        Reset
      </button>
    </section>
  );
}
