import { useState, useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, EyeOff, House, LoaderCircle, LockKeyhole, ShieldCheck, UserRound, CircleAlert } from "lucide-react";
import { getDashboardRoute } from "../routes";
import api from "../api";
import "./styles/AuthForms.css";

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const res = await api.post("login/", form);
      const loggedInUser = res.data?.user || res.data;
      login(res.data);
      navigate(getDashboardRoute(loggedInUser?.role), { replace: true });
    } catch {
      setError("Login failed. Check your email/username and password.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="cf-auth cf-auth--login">
      <section className="cf-auth-story" aria-labelledby="cf-welcome-title">
        <img className="cf-auth-story-image" src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=85" alt="" fetchPriority="high" />
        <div className="cf-auth-story-overlay" />
        <Link to="/" className="cf-auth-brand" aria-label="CityFavor home">
          <span className="cf-auth-brand-icon"><House size={25} strokeWidth={1.6} /></span>
          <span>CityFavor<small>REAL ESTATE · PHILIPPINES</small></span>
        </Link>
        <div className="cf-auth-story-copy">
          <span className="cf-auth-eyebrow">A PLACE FOR YOUR NEXT CHAPTER</span>
          <h1 id="cf-welcome-title">Welcome to<br /><span>CityFavor.</span></h1>
          <p>Your trusted partner in finding the perfect property.</p>
          <div className="cf-auth-story-rule" />
          <span className="cf-auth-story-caption">Good places. New beginnings.<br />Find a place that feels like you.</span>
        </div>
        <div className="cf-auth-story-bottom"><span className="cf-auth-location-dot" /> Rooted in the Philippines. Built around you.</div>
      </section>

      <section className="cf-auth-login-panel" aria-labelledby="cf-login-title">
        <Link to="/" className="cf-auth-home"><ArrowLeft size={16} /> Back to Home</Link>
        <div className="cf-auth-login-content">
          <div className="cf-auth-form-icon"><House size={27} strokeWidth={1.5} /></div>
          <p className="cf-auth-eyebrow">YOUR CITYFAVOR ACCOUNT</p>
          <h2 id="cf-login-title">Welcome Back</h2>
          <p className="cf-auth-subtitle">Sign in to access your CityFavor account.</p>

          <form className="cf-auth-form" onSubmit={submit} aria-busy={isSubmitting}>
            {error && <div className="cf-auth-error" role="alert"><CircleAlert size={18} /><p>{error}</p></div>}
            <fieldset disabled={isSubmitting} className="cf-auth-fields">
              <div className="cf-auth-field">
                <label htmlFor="cf-login-username">Email or username</label>
                <div className="cf-auth-input-wrap"><UserRound size={18} />
                  <input id="cf-login-username" name="username" placeholder="Enter your email or username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
                </div>
              </div>
              <div className="cf-auth-field">
                <label htmlFor="cf-login-password">Password</label>
                <div className="cf-auth-input-wrap cf-auth-input-wrap--password"><LockKeyhole size={18} />
                  <input id="cf-login-password" name="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
                  <button type="button" className="cf-auth-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="cf-login-password">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
            </fieldset>
            <button type="submit" className="cf-auth-submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="cf-auth-spinner" size={18} /> Signing in…</> : <>Sign In <ArrowRight size={18} /></>}</button>
          </form>
          <p className="cf-auth-switch">Don't have an account? <Link to="/register">Create Account <ArrowRight size={14} className="cf-auth-link-arrow" /></Link></p>
          <div className="cf-auth-assurance"><ShieldCheck size={17} /><span>Your next chapter starts with a secure sign-in.</span></div>
        </div>
        <p className="cf-auth-copyright">© {new Date().getFullYear()} CityFavor. All rights reserved.</p>
      </section>
    </main>
  );
}
