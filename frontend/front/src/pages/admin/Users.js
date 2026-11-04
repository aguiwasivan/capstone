import "../../components/RoleDashboard.css";
import "./Users.css";
import { useCallback, useEffect, useState } from "react";
import api from "../../api";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  role: "agent",
  phone_number: "",
  is_active: true,
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(() => {
    api.get("users/").then((res) => setUsers(res.data)).catch(() => setMessage("Unable to load users."));
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const createUser = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await api.post("users/", form);
      setForm(emptyForm);
      setMessage("User created successfully.");
      loadUsers();
    } catch {
      setMessage("Unable to create user. Check the email and required fields.");
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.put(`users/${user.id}/`, { is_active: !user.is_active });
      loadUsers();
    } catch {
      setMessage("Unable to update user.");
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;

    try {
      await api.delete(`users/${userId}/`);
      loadUsers();
    } catch {
      setMessage("Unable to delete user.");
    }
  };

  return (
    <div className="role-dashboard">
      <div className="role-dashboard-header">
        <div>
          <h1>User Management</h1>
          <p>Administrators can create, disable, and remove system users.</p>
        </div>
      </div>

      {message && <p className="users-message">{message}</p>}

      <section className="role-panel users-create-panel">
        <div className="users-section-heading">
          <div>
            <h2>Create Staff Account</h2>
            <p>Add agent, manager, or broker accounts for sales and reservation workflows.</p>
          </div>
        </div>

        <form onSubmit={createUser} className="users-form">
          <div className="users-form-grid">
            <label>
              First Name
              <input name="first_name" value={form.first_name} onChange={handleChange} placeholder="Enter first name" required />
            </label>
            <label>
              Last Name
              <input name="last_name" value={form.last_name} onChange={handleChange} placeholder="Enter last name" required />
            </label>
            <label>
              Email
              <input name="email" value={form.email} onChange={handleChange} placeholder="name@example.com" type="email" required />
            </label>
            <label>
              Phone Number
              <input name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="Optional contact number" />
            </label>
            <label>
              Temporary Password
              <input name="password" value={form.password} onChange={handleChange} placeholder="Leave blank to auto-generate" type="password" />
            </label>
            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="agent">Agent</option>
                <option value="manager">Manager</option>
                <option value="broker">Broker</option>
              </select>
            </label>
          </div>
          <label className="users-checkbox">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
            <span>Activate this account immediately</span>
          </label>
          <button type="submit" className="btn-primary users-create-button">Create User</button>
        </form>
      </section>

      <section className="role-panel properties-panel">
        <h2>All Users</h2>
        <div className="properties-table-wrap">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`users-role-chip ${user.role}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className={`users-status-badge ${user.is_active ? "active" : "disabled"}`}>
                      {user.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="users-actions">
                    <button type="button" className="users-action-button" onClick={() => toggleActive(user)}>
                      {user.is_active ? "Disable" : "Enable"}
                    </button>
                    <button type="button" className="users-action-button danger" onClick={() => deleteUser(user.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="5" className="users-empty-state">No users found yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

