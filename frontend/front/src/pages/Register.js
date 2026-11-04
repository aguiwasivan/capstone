import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eye, EyeOff, House, LoaderCircle, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import api from "../api";
import "./styles/AuthForms.css";

const initialForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  confirm_password: "",
  phone_number: "",
  address_line1: "",
  preferred_property: "",
};

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (!data) {
    return "Registration failed. Please check your connection and try again.";
  }

  if (typeof data === "string") {
    return data;
  }

  const messages = Object.entries(data).flatMap(([field, value]) => {
    if (Array.isArray(value)) {
      return value.map((message) => `${field}: ${message}`);
    }

    if (typeof value === "object" && value !== null) {
      return Object.values(value).flat();
    }

    return `${field}: ${value}`;
  });

  return messages.join(" ") || "Registration failed. Check your input.";
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ password: false, confirm_password: false });
  const submitting = useRef(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    setError("");

    if (form.password !== form.confirm_password) {
      setError("Password and confirm password do not match.");
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);

    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      password: form.password,
      role: "client",
      phone_number: form.phone_number,
      address_line1: form.address_line1,
      city: form.preferred_property,
      buyer_type: "individual",
      preferred_contact_method: "email",
    };

    try {
      await api.post("register/", payload);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const passwordsMatch = form.password === form.confirm_password;
  const personalFields = [
    { name: "first_name", label: "First name", placeholder: "First name", autoComplete: "given-name", required: true, icon: UserRound },
    { name: "last_name", label: "Last name", placeholder: "Last name", autoComplete: "family-name", required: true, icon: UserRound },
    { name: "email", label: "Email address", placeholder: "you@example.com", type: "email", autoComplete: "email", required: true, icon: Mail },
    { name: "phone_number", label: "Phone number", placeholder: "Your contact number", type: "tel", autoComplete: "tel", icon: Phone },
  ];

  return (
    <main className="cf-auth cf-auth--register">
      <header className="cf-auth-register-header">
        <Link to="/" className="cf-auth-brand" aria-label="CityFavor home">
          <span className="cf-auth-brand-icon"><House size={25} strokeWidth={1.6} /></span>
          <span>CityFavor<small>REAL ESTATE · PHILIPPINES</small></span>
        </Link>
        <Link to="/" className="cf-auth-home"><ArrowLeft size={16} /> Back to Home</Link>
      </header>
      <div className="cf-auth-register-intro">
        <p className="cf-auth-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
        <h1>Create Your Account</h1>
        <p className="cf-auth-subtitle">Start your property journey with CityFavor.</p>
      </div>
      <form className="cf-auth-register-card cf-auth-form" onSubmit={submit} aria-busy={isSubmitting} aria-label="Create your CityFavor account">
        <div className="cf-auth-card-heading"><span className="cf-auth-card-icon"><UserRound size={21} /></span><div><h2>Let's get to know you</h2><p>Fields marked <span aria-hidden="true">*</span> are required. Everything else is optional.</p></div><span className="cf-auth-buyer-tag">Buyer account</span></div>
        {error && <div className="cf-auth-error" role="alert"><CircleAlert size={18} /><p>{error}</p></div>}
        <fieldset disabled={isSubmitting} className="cf-auth-fields">
          <fieldset className="cf-auth-section">
            <legend><span>01</span> Personal Information</legend>
            <div className="cf-auth-grid">
              {personalFields.map(({ icon: Icon, name, label, required, ...inputProps }) => (
                <div className="cf-auth-field" key={name}>
                  <label htmlFor={`cf-register-${name}`}>{label} {required ? <span aria-hidden="true">*</span> : <span className="cf-auth-optional">(optional)</span>}</label>
                  <div className="cf-auth-input-wrap"><Icon size={17} /><input id={`cf-register-${name}`} name={name} value={form[name]} onChange={handleChange} required={required} {...inputProps} /></div>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset className="cf-auth-section">
            <legend><span>02</span> Property Information</legend>
            <div className="cf-auth-grid">
              <div className="cf-auth-field"><label htmlFor="cf-register-address">Address <span className="cf-auth-optional">(optional)</span></label><div className="cf-auth-input-wrap"><House size={17} /><input id="cf-register-address" name="address_line1" value={form.address_line1} onChange={handleChange} placeholder="Street address" autoComplete="address-line1" /></div></div>
              <div className="cf-auth-field"><label htmlFor="cf-register-location">Preferred property location <span className="cf-auth-optional">(optional)</span></label><div className="cf-auth-input-wrap"><MapPin size={17} /><input id="cf-register-location" name="preferred_property" value={form.preferred_property} onChange={handleChange} placeholder="Preferred city or location" /></div></div>
            </div>
          </fieldset>
          <fieldset className="cf-auth-section">
            <legend><span>03</span> Account Security</legend>
            <div className="cf-auth-grid">
              {[{ name: "password", label: "Password", placeholder: "Create a password" }, { name: "confirm_password", label: "Confirm password", placeholder: "Re-enter your password" }].map(({ name, label, placeholder }) => (
                <div className="cf-auth-field" key={name}>
                  <label htmlFor={`cf-register-${name}`}>{label} <span aria-hidden="true">*</span></label>
                  <div className="cf-auth-input-wrap cf-auth-input-wrap--password"><LockKeyhole size={17} />
                    <input id={`cf-register-${name}`} name={name} type={visiblePasswords[name] ? "text" : "password"} placeholder={placeholder} value={form[name]} onChange={handleChange} required autoComplete="new-password" aria-describedby={name === "password" ? "cf-password-requirements" : "cf-password-match"} aria-invalid={name === "confirm_password" && !!form.confirm_password && !passwordsMatch ? true : undefined} />
                    <button type="button" className="cf-auth-password-toggle" onClick={() => setVisiblePasswords({ ...visiblePasswords, [name]: !visiblePasswords[name] })} aria-controls={`cf-register-${name}`} aria-label={`${visiblePasswords[name] ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visiblePasswords[name]}>{visiblePasswords[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </div>
                  {name === "confirm_password" && <p id="cf-password-match" className={`cf-auth-password-feedback${form.confirm_password ? passwordsMatch ? " cf-auth-password-feedback--match" : " cf-auth-password-feedback--mismatch" : ""}`} aria-live="polite">{form.confirm_password && (passwordsMatch ? <><Check size={14} /> Passwords match</> : "Passwords do not match yet.")}</p>}
                </div>
              ))}
            </div>
            <p id="cf-password-requirements" className="cf-auth-password-help"><ShieldCheck size={16} /><span>Use at least 8 characters. Avoid common passwords, entirely numeric passwords, and personal information.</span></p>
          </fieldset>
        </fieldset>
        <button type="submit" className="cf-auth-submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="cf-auth-spinner" size={18} /> Creating account…</> : <>Create Account <ArrowRight size={18} /></>}</button>
        <p className="cf-auth-switch">Already have an account? <Link to="/login">Sign In <ArrowRight size={14} /></Link></p>
      </form>
      <p className="cf-auth-copyright">© {new Date().getFullYear()} CityFavor. All rights reserved.</p>
    </main>
  );
}
