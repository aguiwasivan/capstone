import "../../components/RoleDashboard.css";
import { useCallback, useEffect, useState } from "react";
import api from "../../api";

const defaultParameters = [
  {
    key: "agent-commission-percent",
    label: "Agent Commission %",
    value: "3",
    description: "Default commission percentage for agents.",
  },
  {
    key: "manager-commission-percent",
    label: "Manager Commission %",
    value: "1",
    description: "Default commission percentage for managers.",
  },
  {
    key: "broker-commission-percent",
    label: "Broker Commission %",
    value: "2",
    description: "Default commission percentage for brokers.",
  },
];

export default function Settings() {
  const [parameters, setParameters] = useState([]);
  const [message, setMessage] = useState("");

  const loadParameters = useCallback(() => {
    api
      .get("system-parameters/")
      .then((res) => setParameters(res.data))
      .catch(() => setMessage("Unable to load system parameters."));
  }, []);

  useEffect(() => {
    loadParameters();
  }, [loadParameters]);

  const createDefaults = async () => {
    setMessage("");
    try {
      for (const parameter of defaultParameters) {
        if (!parameters.some((item) => item.key === parameter.key)) {
          await api.post("system-parameters/", parameter);
        }
      }
      setMessage("Default commission settings are ready.");
      loadParameters();
    } catch {
      setMessage("Unable to create default settings.");
    }
  };

  const updateParameter = async (parameter, value) => {
    setParameters((prev) => prev.map((item) => (item.id === parameter.id ? { ...item, value } : item)));
  };

  const saveParameter = async (parameter) => {
    try {
      await api.put(`system-parameters/${parameter.id}/`, parameter);
      setMessage("Setting saved.");
      loadParameters();
    } catch {
      setMessage("Unable to save setting.");
    }
  };

  return (
    <div className="role-dashboard">
      <div className="role-dashboard-header">
        <div>
          <h1>System Parameters</h1>
          <p>Configure commission percentages and system-level settings.</p>
        </div>
        <button type="button" onClick={createDefaults}>Create Default Commissions</button>
      </div>

      {message && <p>{message}</p>}

      <section className="role-panel properties-panel">
        <div className="properties-table-wrap">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Value</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((parameter) => (
                <tr key={parameter.id}>
                  <td>{parameter.label}</td>
                  <td>
                    <input
                      value={parameter.value}
                      onChange={(event) => updateParameter(parameter, event.target.value)}
                    />
                  </td>
                  <td>{parameter.description}</td>
                  <td><button type="button" onClick={() => saveParameter(parameter)}>Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

