import { useContext, useEffect, useMemo, useRef, useState } from "react";
import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";
import "./Profile.css";

const roleLabels = {
  admin: "Admin",
  agent: "Agent",
  manager: "Manager",
  broker: "Broker",
  client: "Client",
};

const emptyProfile = {
  id: "",
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  role: "",
  role_label: "",
  is_active: true,
  date_joined: "",
  last_login: "",
  phone_number: "",
  date_of_birth: "",
  address_line1: "",
  address_line2: "",
  city: "",
  province: "",
  postal_code: "",
  preferred_contact_method: "email",
};

const emptyProfileData = {
  user: emptyProfile,
  role: "",
  role_label: "",
  summary: {},
  reports: [],
  recent_activity: [],
};

function roleKey(role) {
  return String(role || "").toLowerCase();
}

function getRoleLabel(profile) {
  const key = roleKey(profile?.role);
  return profile?.role_label || roleLabels[key] || "User";
}

function normalizeUser(user) {
  return {
    ...emptyProfile,
    ...(user || {}),
    role: roleKey(user?.role),
    role_label: user?.role_label || roleLabels[roleKey(user?.role)] || "",
    date_of_birth: user?.date_of_birth || "",
    date_joined: user?.date_joined || "",
    last_login: user?.last_login || "",
  };
}

function normalizeProfileData(data, fallbackUser) {
  const sourceUser = data?.user || data || fallbackUser;

  return {
    ...emptyProfileData,
    ...(data || {}),
    user: normalizeUser(sourceUser),
    role: roleKey(data?.role || sourceUser?.role),
    role_label: data?.role_label || getRoleLabel(sourceUser),
    summary: data?.summary || {},
    reports: Array.isArray(data?.reports) ? data.reports : [],
    recent_activity: Array.isArray(data?.recent_activity) ? data.recent_activity : [],
  };
}

function fullName(profile) {
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.username ||
    getRoleLabel(profile)
  );
}

function address(profile) {
  return [
    profile?.address_line1,
    profile?.address_line2,
    profile?.city,
    profile?.province,
    profile?.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function initials(profile) {
  const name = fullName(profile);
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString();
}

function display(value, fallback = "Not recorded") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data;

  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;

  return Object.entries(data)
    .map(([field, value]) => {
      if (Array.isArray(value)) return `${field}: ${value.join(" ")}`;
      if (typeof value === "object" && value !== null) {
        return `${field}: ${Object.values(value).flat().join(" ")}`;
      }
      return `${field}: ${value}`;
    })
    .join(" ");
}

function validateProfileDraft(draft) {
  if (!draft.first_name.trim()) return "First name is required.";
  if (!draft.last_name.trim()) return "Last name is required.";
  if (!draft.email.trim()) return "Email address is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    return "Enter a valid email address.";
  }
  return "";
}

function validatePasswordDraft(draft) {
  if (!draft.current_password) return "Current password is required.";
  if (draft.new_password.length < 8) return "New password must be at least 8 characters.";
  if (draft.new_password !== draft.confirm_password) {
    return "New password and confirmation do not match.";
  }
  return "";
}

function Modal({ title, onClose, children }) {
  return (
    <div className="profile-modal-backdrop" role="presentation">
      <div className="profile-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="profile-modal-header">
          <h2>{title}</h2>
          <button type="button" className="profile-icon-button" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionCard({ title, eyebrow, children, className = "" }) {
  return (
    <section className={`profile-card ${className}`}>
      {eyebrow && <p className="profile-card-eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="profile-empty">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <dl className="profile-info-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{display(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryCards({ items }) {
  return (
    <div className="profile-summary-grid">
      {items.map((item) => (
        <section className="profile-summary-card" key={item.label}>
          <p>{item.label}</p>
          <strong>{display(item.value, "0")}</strong>
          {item.caption && <span>{item.caption}</span>}
        </section>
      ))}
    </div>
  );
}

function DataTable({ columns, rows, emptyTitle, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="profile-table-wrap">
      <table className="profile-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td key={column.header}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityList({ rows, emptyTitle, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="profile-activity-list">
      {rows.map((item) => (
        <article className="profile-activity-item" key={item.id}>
          <div>
            <span>{display(item.type, "Activity")}</span>
            <h3>{display(item.title, "Recent update")}</h3>
            <p>{display(item.description, "No details recorded")}</p>
          </div>
          <time>{formatDateTime(item.created_at)}</time>
        </article>
      ))}
    </div>
  );
}

export default function Profile() {
  const refreshVersion = useAnalyticsRefresh();
  const { user, updateUser } = useContext(AuthContext);
  const initialUserRef = useRef(user);
  const [profileData, setProfileData] = useState(() => normalizeProfileData({ user }, user));
  const [draft, setDraft] = useState(() => normalizeUser(user));
  const [passwordDraft, setPasswordDraft] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [activeTab, setActiveTab] = useState("personal");
  const [modal, setModal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const profile = profileData.user;
  const roleLabel = getRoleLabel(profile);
  const isAdminProfile = roleKey(profile.role || user?.role) === "admin";
  const summary = profileData.summary || {};

  useEffect(() => {
    if (!refreshVersion || !isAdminProfile || activeTab === "personal" || activeTab === "settings") return;
    let active = true;
    api.get("profile/data/").then(({ data }) => {
      if (active) { setProfileData(normalizeProfileData(data, initialUserRef.current)); setError(""); }
    }).catch(() => {
      if (active) { setProfileData((current) => ({ ...current, summary: {}, recent_activity: [] })); setError("Unable to refresh system summary and activity."); }
    });
    return () => { active = false; };
  }, [refreshVersion, isAdminProfile, activeTab]);

  const tabs = useMemo(() => {
    const items = [{ id: "personal", label: "Personal Details" }];

    if (isAdminProfile) {
      items.push(
        { id: "admin-summary", label: "System Summary" },
        { id: "reports", label: "Reports" },
        { id: "activity", label: "System Activity" }
      );
    }

    items.push({ id: "settings", label: "Account Settings" });
    return items;
  }, [isAdminProfile]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setError("");

      try {
        const res = await api.get("profile/data/");
        if (!isMounted) return;

        const nextProfileData = normalizeProfileData(res.data, initialUserRef.current);
        setProfileData(nextProfileData);
        setDraft(nextProfileData.user);
        updateUser(nextProfileData.user);
      } catch (profileDataError) {
        if (isMounted) setError("System summary and activity could not be loaded. Personal details may still be available.");
        try {
          const res = await api.get("profile/");
          if (!isMounted) return;

          const nextProfileData = normalizeProfileData({ user: res.data }, initialUserRef.current);
          setProfileData(nextProfileData);
          setDraft(nextProfileData.user);
          updateUser(nextProfileData.user);
        } catch (profileError) {
          if (!isMounted) return;
          setError(getErrorMessage(profileError, "Unable to load profile details."));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "personal");
    }
  }, [activeTab, tabs]);

  const openEditModal = () => {
    setDraft(normalizeUser(profile));
    setFormError("");
    setSuccess("");
    setModal("edit");
  };

  const openPasswordModal = () => {
    setPasswordDraft({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
    setFormError("");
    setSuccess("");
    setModal("password");
  };

  const closeModal = () => {
    setModal("");
    setFormError("");
  };

  const handleDraftChange = (event) => {
    setDraft((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handlePasswordChange = (event) => {
    setPasswordDraft((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    const validationError = validateProfileDraft(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError("");
    setError("");
    setSuccess("");

    const payload = {
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      email: draft.email.trim(),
      phone_number: draft.phone_number,
      date_of_birth: draft.date_of_birth || null,
      address_line1: draft.address_line1,
      address_line2: draft.address_line2,
      city: draft.city,
      province: draft.province,
      postal_code: draft.postal_code,
      preferred_contact_method: draft.preferred_contact_method,
    };

    try {
      const res = await api.put("profile/", payload);
      const nextUser = normalizeUser(res.data);
      setProfileData((current) => ({ ...current, user: nextUser }));
      setDraft(nextUser);
      updateUser(nextUser);
      setSuccess("Profile updated successfully.");
      closeModal();
    } catch (saveError) {
      setFormError(getErrorMessage(saveError, "Unable to update profile."));
    } finally {
      setIsSaving(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    const validationError = validatePasswordDraft(passwordDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError("");
    setSuccess("");

    try {
      await api.post("profile/change-password/", passwordDraft);
      setSuccess("Password changed successfully.");
      closeModal();
    } catch (passwordError) {
      setFormError(getErrorMessage(passwordError, "Unable to change password."));
    } finally {
      setIsSaving(false);
    }
  };

  const renderPersonalTab = () => (
    <div className="profile-section-grid">
      <SectionCard title="Personal Details">
        <InfoGrid
          items={[
            { label: "Full Name", value: fullName(profile) },
            { label: "Email Address", value: profile.email },
            { label: "Contact Number", value: profile.phone_number },
            { label: "Address", value: address(profile) },
          ]}
        />
      </SectionCard>

      <SectionCard title="Account Details">
        <InfoGrid
          items={[
            { label: "Username", value: profile.username },
            { label: "Role", value: roleLabel },
            { label: "Account Status", value: profile.is_active ? "Active" : "Inactive" },
            { label: "Date Joined", value: formatDate(profile.date_joined) },
            { label: "Last Login", value: formatDateTime(profile.last_login) },
          ]}
        />
      </SectionCard>

    </div>
  );

  const renderReportsTab = () => (
    <SectionCard title="Generated Reports">
      <DataTable
        columns={[
          { header: "Report", render: (row) => display(row.title || row.name) },
          { header: "Type", render: (row) => display(row.report_type || row.type) },
          { header: "Generated", render: (row) => formatDateTime(row.generated_at || row.created_at) },
          { header: "Status", render: (row) => display(row.status) },
        ]}
        rows={profileData.reports}
        emptyTitle="Report history is not recorded"
        emptyMessage="The current system can generate reports, but report history is not stored in the database yet."
      />
    </SectionCard>
  );

  const renderAdminSummaryTab = () => (
    <div className="profile-section-grid">
      <SectionCard title="User Management Access">
        <InfoGrid
          items={[
            { label: "Access", value: summary.user_management_access ? "Enabled" : "Not enabled" },
            { label: "Role", value: roleLabel },
            { label: "Account Status", value: profile.is_active ? "Active" : "Inactive" },
          ]}
        />
      </SectionCard>

      <SectionCard title="System Summary">
        <SummaryCards
          items={[
            { label: "Total Users", value: summary.total_users ?? "Unavailable" },
            { label: "Agents", value: summary.total_agents ?? "Unavailable" },
            { label: "Managers", value: summary.total_managers ?? "Unavailable" },
            { label: "Brokers", value: summary.total_brokers ?? "Unavailable" },
            { label: "Clients", value: summary.total_clients ?? "Unavailable" },
            { label: "Subdivisions", value: summary.total_subdivisions ?? "Unavailable" },
            { label: "Lots", value: summary.total_lots ?? "Unavailable" },
            { label: "Reservations", value: summary.total_reservations ?? "Unavailable" },
            { label: "Sales", value: summary.total_sales ?? "Unavailable" },
            { label: "Reports", value: summary.generated_reports ?? "Not recorded" },
          ]}
        />
      </SectionCard>
    </div>
  );

  const renderActivityTab = () => (
    <SectionCard title="Recent System Activity Logs">
      <ActivityList
        rows={profileData.recent_activity}
        emptyTitle="No system activity yet"
        emptyMessage="Recent users, reservations, sales, and notifications will appear here."
      />
    </SectionCard>
  );

  const renderSettingsTab = () => (
    <div className="profile-section-grid">
      <SectionCard title="Account Settings">
        <div className="profile-settings-actions">
          <button type="button" className="profile-primary-btn" onClick={openEditModal}>
            Edit Profile
          </button>
          <button type="button" className="profile-secondary-btn" onClick={openPasswordModal}>
            Change Password
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Security">
        <InfoGrid
          items={[
            { label: "Username", value: profile.username },
            { label: "Role", value: roleLabel },
            { label: "Last Login", value: formatDateTime(profile.last_login) },
            { label: "Account Status", value: profile.is_active ? "Active" : "Inactive" },
          ]}
        />
      </SectionCard>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "reports":
        return renderReportsTab();
      case "admin-summary":
        return renderAdminSummaryTab();
      case "activity":
        return renderActivityTab();
      case "settings":
        return renderSettingsTab();
      default:
        return renderPersonalTab();
    }
  };

  if (isLoading) {
    return (
      <div className="profile-page">
        <div className="profile-loading-card">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-identity">
          <span className="profile-avatar">{initials(profile)}</span>
          <div>
            <p className="profile-kicker">{roleLabel} Profile</p>
            <h1>{fullName(profile)}</h1>
            <p>{display(profile.email)}</p>
            <div className="profile-chip-row">
              <span>{roleLabel}</span>
              <span>{profile.is_active ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>
        <div className="profile-hero-actions">
          <button type="button" className="profile-secondary-btn" onClick={openPasswordModal}>
            Change Password
          </button>
          <button type="button" className="profile-primary-btn" onClick={openEditModal}>
            Edit Profile
          </button>
        </div>
      </section>

      {error && <div className="profile-alert profile-alert--error">{error}</div>}
      {success && <div className="profile-alert profile-alert--success">{success}</div>}

      <nav className="profile-tabs" aria-label="Profile sections" role="tablist">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="profile-tab-panel">{renderActiveTab()}</div>

      {modal === "edit" && (
        <Modal title="Edit Profile" onClose={closeModal}>
          <form className="profile-form" onSubmit={submitProfile}>
            {formError && <div className="profile-alert profile-alert--error">{formError}</div>}
            <div className="profile-form-grid">
              <label>
                First Name
                <input name="first_name" value={draft.first_name} onChange={handleDraftChange} required />
              </label>
              <label>
                Last Name
                <input name="last_name" value={draft.last_name} onChange={handleDraftChange} required />
              </label>
              <label>
                Email
                <input type="email" name="email" value={draft.email} onChange={handleDraftChange} required />
              </label>
              <label>
                Contact Number
                <input name="phone_number" value={draft.phone_number} onChange={handleDraftChange} />
              </label>
              <label>
                Date of Birth
                <input type="date" name="date_of_birth" value={draft.date_of_birth || ""} onChange={handleDraftChange} />
              </label>
              <label>
                Preferred Contact
                <select
                  name="preferred_contact_method"
                  value={draft.preferred_contact_method}
                  onChange={handleDraftChange}
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
              <label className="profile-wide-field">
                Street / House No.
                <input name="address_line1" value={draft.address_line1} onChange={handleDraftChange} />
              </label>
              <label className="profile-wide-field">
                Unit, Building, Barangay
                <input name="address_line2" value={draft.address_line2} onChange={handleDraftChange} />
              </label>
              <label>
                City
                <input name="city" value={draft.city} onChange={handleDraftChange} />
              </label>
              <label>
                Province
                <input name="province" value={draft.province} onChange={handleDraftChange} />
              </label>
              <label>
                Postal Code
                <input name="postal_code" value={draft.postal_code} onChange={handleDraftChange} />
              </label>
            </div>

            <div className="profile-actions">
              <button type="button" className="profile-secondary-btn" onClick={closeModal} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="profile-primary-btn" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "password" && (
        <Modal title="Change Password" onClose={closeModal}>
          <form className="profile-form" onSubmit={submitPassword}>
            {formError && <div className="profile-alert profile-alert--error">{formError}</div>}
            <div className="profile-form-grid">
              <label className="profile-wide-field">
                Current Password
                <input
                  type="password"
                  name="current_password"
                  value={passwordDraft.current_password}
                  onChange={handlePasswordChange}
                  required
                />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  name="new_password"
                  value={passwordDraft.new_password}
                  onChange={handlePasswordChange}
                  minLength="8"
                  required
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type="password"
                  name="confirm_password"
                  value={passwordDraft.confirm_password}
                  onChange={handlePasswordChange}
                  minLength="8"
                  required
                />
              </label>
            </div>
            <div className="profile-actions">
              <button type="button" className="profile-secondary-btn" onClick={closeModal} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="profile-primary-btn" disabled={isSaving}>
                {isSaving ? "Changing..." : "Change Password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
