import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUpRight, Building2, Check, ChevronDown, Clock3, Compass, House, MapPin, Menu, Search, Send, ShieldCheck, UsersRound, X } from "lucide-react";
import "./styles/Landing.css";

const navigation = [["home", "Home"], ["about", "About"], ["services", "Services"], ["properties", "Properties"], ["contact", "Contact"]];
const properties = [
  { id: "modern-house", name: "Modern House", type: "House", price: "₱3,500,000", location: "Laguna", img: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6" },
  { id: "luxury-condo", name: "Luxury Condo", type: "Condo", price: "₱5,200,000", location: "Makati", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c" },
  { id: "townhouse", name: "Townhouse", type: "Townhouse", price: "₱2,200,000", location: "Batangas", img: "https://images.unsplash.com/photo-1570129477492-45c003edd2be" },
];
const services = [
  { icon: Building2, title: "Property Listings", text: "Explore places that fit your lifestyle. Compare locations, discover possibilities, and find a place to call your own." },
  { icon: UsersRound, title: "Agent Assistance", text: "Take the next step with a little more clarity. Connect with our team for guidance throughout your property journey." },
  { icon: Compass, title: "Property Investment", text: "See the potential beyond the property. Explore opportunities with your goals, budget, and long-term plans in mind." },
];
function goToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
function Brand() {
  return <a href="#home" className="cf-brand" aria-label="CityFavor home"><span className="cf-brand-mark"><House size={23} strokeWidth={1.6} /></span><span>CityFavor<span className="cf-brand-caption">REAL ESTATE · PHILIPPINES</span></span></a>;
}
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("home");
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [filters, setFilters] = useState(null);
  const [contactStatus, setContactStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const menuButton = useRef(null);
  const dialog = useRef(null);
  const page = useRef(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!("IntersectionObserver" in window)) return () => window.removeEventListener("scroll", onScroll);
    const sections = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) setActive(entry.target.id);
    }), { rootMargin: "-18% 0px -60% 0px" });
    navigation.forEach(([id]) => { const element = document.getElementById(id); if (element) sections.observe(element); });
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("cf-visible"); reveal.unobserve(entry.target); }
    }), { threshold: 0.08 });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) page.current.querySelectorAll("[data-cf-reveal]").forEach(element => {
      element.classList.add("cf-reveal-ready"); reveal.observe(element);
    });
    return () => { window.removeEventListener("scroll", onScroll); sections.disconnect(); reveal.disconnect(); };
  }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = event => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  useEffect(() => { if (selected && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [selected]);
  const shownProperties = properties.filter(property => !filters || (
    property.location.toLowerCase().includes(filters.location.toLowerCase()) && (!filters.type || property.type === filters.type)
  ));
  function resetFilters() { setFilters(null); setLocation(""); setPropertyType(""); }
  function handleSearch(event) {
    event.preventDefault(); setFilters({ location: location.trim(), type: propertyType }); goToSection("properties");
  }
  function handleContact(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!["name", "email", "message"].every(field => String(form.get(field) || "").trim())) {
      setContactStatus("Please enter your name, email address, and message."); return;
    }
    setContactStatus("Your message has not been sent. Online enquiries are not connected yet. Please sign in to continue with CityFavor.");
  }
  function closeDetails() { dialog.current?.close(); setSelected(null); }
  return <div className="cf-landing" ref={page}>
    <a className="cf-skip-link" href="#main-content">Skip to content</a>
    <header className={`cf-header${scrolled || menuOpen ? " cf-header-solid" : ""}`}>
      <nav className="cf-container cf-nav" aria-label="Main navigation"><Brand />
        <button type="button" className="cf-menu-toggle" ref={menuButton} aria-expanded={menuOpen} aria-controls="cf-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <div id="cf-navigation" className={`cf-nav-menu${menuOpen ? " cf-menu-open" : ""}`}>
          {navigation.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined} onClick={() => { setActive(id); setMenuOpen(false); }}>{label}</a>)}
          <Link to="/login" className="cf-button cf-button-primary" onClick={() => setMenuOpen(false)}>Get Started <ArrowUpRight size={17} /></Link>
        </div>
      </nav>
    </header>
    <main id="main-content">
      <section id="home" className="cf-hero">
        <img className="cf-hero-image" src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2200&q=85" alt="" fetchPriority="high" />
        <div className="cf-hero-shade" />
        <div className="cf-container cf-hero-content"><div className="cf-eyebrow cf-eyebrow-light">YOUR NEXT CHAPTER STARTS HERE</div><h1>Find your<br /><span>dream home.</span></h1><p>A place to belong. A future to build.<br />Discover your next home across the Philippines.</p><div className="cf-hero-actions"><Link to="/login" className="cf-button cf-button-primary">Get Started <ArrowUpRight size={18} /></Link><a href="#properties" className="cf-text-link">Explore properties <ArrowRight size={18} /></a></div></div>
        <div className="cf-hero-bottom cf-container"><span><MapPin size={15} /> Rooted in the Philippines. Built around you.</span><a href="#about" aria-label="Discover CityFavor"><ArrowDown size={19} /></a></div>
      </section>
      <div className="cf-container cf-search-wrap"><form className="cf-search-panel" onSubmit={handleSearch} aria-label="Search example properties">
        <label className="cf-search-field"><MapPin size={21} /><span><span className="cf-field-title">Location</span><input name="location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Where would you like to live?" /></span></label>
        <label className="cf-search-field"><House size={21} /><span><span className="cf-field-title">Property type</span><span className="cf-select-wrap"><select name="propertyType" value={propertyType} onChange={event => setPropertyType(event.target.value)}><option value="">All property types</option><option>House</option><option>Condo</option><option>Townhouse</option></select><ChevronDown size={16} /></span></span></label>
        <button className="cf-button cf-button-primary" type="submit"><Search size={19} /> Find a property</button>
      </form><p className="cf-search-note">A little inspiration to get started. Search the example properties below.</p></div>
      <section className="cf-container cf-stats" aria-label="Illustrative company statistics"><div className="cf-stat-grid">{[[Building2, "500+", "Properties"], [UsersRound, "200+", "Happy clients"], [ShieldCheck, "50+", "Agents"], [Clock3, "15", "Years of experience"]].map(([Icon, number, label]) => <div className="cf-stat" key={label}><Icon size={23} strokeWidth={1.5} /><div><strong>{number}</strong><span>{label}</span></div></div>)}</div><p>Illustrative figures for this preview; not verified company statistics.</p></section>
      <section id="about" className="cf-section cf-container cf-about">
        <div className="cf-about-visual" data-cf-reveal><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80" alt="Bright living room with natural textures and comfortable seating" loading="lazy" width="1000" height="1120" /><div className="cf-image-note"><span className="cf-note-icon"><House size={26} strokeWidth={1.4} /></span><div>More than a property.<strong>A place to call home.</strong></div></div><span className="cf-image-label">THOUGHTFUL SPACES. NEW POSSIBILITIES.</span></div>
        <div className="cf-about-copy" data-cf-reveal><div className="cf-eyebrow">THE CITYFAVOR WAY</div><h2>Good places.<br />Even better beginnings.</h2><p>Finding the right property is about more than an address. It is about the life you want to build there.</p><p>CityFavor brings buyers, sellers, and investors closer to real estate opportunities across the Philippines, with a property discovery experience designed to make your next step feel simpler.</p><h3>Why choose CityFavor?</h3><ul className="cf-benefits"><li><Check size={16} /> Reliable service, with your needs at the centre</li><li><Check size={16} /> Guidance for a more informed decision</li><li><Check size={16} /> A simpler way to discover your next property</li></ul><a href="#services" className="cf-inline-link">Get to know our services <ArrowUpRight size={18} /></a></div>
      </section>
      <section id="services" className="cf-services cf-section"><div className="cf-container"><div className="cf-section-heading" data-cf-reveal><div><div className="cf-eyebrow">HERE FOR EVERY STEP</div><h2>Your property journey,<br />with a clearer direction.</h2></div><p>From that first look to your next big move,<br className="cf-desktop-break" /> discover how we can help.</p></div><div className="cf-services-grid">{services.map(({ icon: Icon, title, text }, index) => <article className="cf-service-card" key={title} data-cf-reveal><div className="cf-service-top"><span className="cf-service-icon"><Icon size={28} strokeWidth={1.4} /></span><span className="cf-service-number">0{index + 1}</span></div><h3>{title}</h3><p>{text}</p><a href={index === 0 ? "#properties" : "#contact"} className="cf-inline-link">{index === 0 ? "Explore properties" : "Let's talk"}<ArrowUpRight size={18} /><span className="cf-sr-only"> about {title.toLowerCase()}</span></a></article>)}</div></div></section>
      <section id="properties" className="cf-section cf-container"><div className="cf-section-heading" data-cf-reveal><div><div className="cf-eyebrow">FIND YOUR KIND OF HOME</div><h2>Places to picture<br />your future.</h2></div><div className="cf-heading-aside"><p>Different spaces. The same feeling of possibility.</p><Link to="/login" className="cf-inline-link">Explore with CityFavor <ArrowUpRight size={18} /></Link></div></div>
        <div className="cf-listing-toolbar"><span>Featured properties <span className="cf-sample-label">Example listings</span></span><span className="cf-results" role="status">{filters ? `${shownProperties.length} of ${properties.length} examples match your filters` : "A selection to inspire your search"}</span>{filters && <button type="button" className="cf-reset" onClick={resetFilters}>Clear filters <X size={14} /></button>}</div>
        <div className="cf-properties-grid">{shownProperties.map(property => <PropertyCard key={property.id} property={property} onDetails={() => setSelected(property)} />)}</div>
        {!shownProperties.length && <div className="cf-empty"><Search size={28} /><h3>No example properties match yet.</h3><p>Try Laguna, Makati, or Batangas, or clear your filters to see all three examples.</p><button type="button" className="cf-button cf-button-primary" onClick={resetFilters}>Show all examples <ArrowRight size={17} /></button></div>}
        <p className="cf-listing-note">These properties and prices are illustrative examples, not a live inventory. Sign in to explore the property portal.</p>
      </section>
      <section id="contact" className="cf-contact cf-section"><div className="cf-container cf-contact-grid"><div className="cf-contact-copy" data-cf-reveal><div className="cf-eyebrow cf-eyebrow-light">LET'S FIND YOUR NEXT CHAPTER</div><h2>A good conversation.<br />A great place to start.</h2><p>Looking for a home, exploring an investment, or simply working out what comes next? Tell us what you have in mind.</p><div className="cf-contact-detail"><MapPin size={21} /><div><strong>Made for your move in the Philippines</strong><span>Verified office and contact details will be published here when available.</span></div></div><div className="cf-contact-signin"><span>Already part of CityFavor?</span><Link to="/login">Sign in to your account <ArrowUpRight size={17} /></Link></div></div>
        <form className="cf-contact-form" onSubmit={handleContact} data-cf-reveal><h3>Let's talk about your plans.</h3><p>Leave a few details to prepare your enquiry.</p><label htmlFor="cf-name">Full name <span aria-hidden="true">*</span></label><input id="cf-name" name="name" autoComplete="name" placeholder="Your full name" maxLength={120} required /><label htmlFor="cf-email">Email address <span aria-hidden="true">*</span></label><input id="cf-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /><label htmlFor="cf-message">How can we help? <span aria-hidden="true">*</span></label><textarea id="cf-message" name="message" placeholder="Tell us about the property you're looking for…" rows={4} maxLength={5000} required aria-describedby="cf-contact-notice" /><p className="cf-form-notice" id="cf-contact-notice">Online enquiries are not connected yet. Your details will not be sent or saved.</p><button type="submit" className="cf-button cf-button-primary">Send Message <Send size={17} /></button><p className="cf-contact-status" role="status" aria-live="polite">{contactStatus}</p>{contactStatus && <Link to="/login" className="cf-inline-link">Continue to sign in <ArrowRight size={16} /></Link>}</form>
      </div></section>
    </main>
    <footer className="cf-footer"><div className="cf-container"><div className="cf-footer-grid"><div className="cf-footer-brand"><Brand /><p>Good places. New beginnings.<br />Your next chapter starts with CityFavor.</p><span className="cf-footer-location"><MapPin size={14} /> Philippines</span></div><div><h3>Explore</h3><a href="#home">Home</a><a href="#about">About CityFavor</a><a href="#properties">Properties</a><a href="#contact">Get in touch</a></div><div><h3>Our services</h3>{services.map(service => <a key={service.title} href="#services">{service.title}</a>)}</div><div className="cf-footer-next"><h3>Make your next move.</h3><p>A new place. A fresh perspective.<br />Start your journey with us.</p><Link to="/login" className="cf-footer-cta">Get Started <ArrowUpRight size={18} /></Link></div></div><div className="cf-footer-bottom"><span>© {new Date().getFullYear()} CityFavor. All rights reserved.</span><span>Find a place. Feel at home.</span><a href="#home">Back to top <ArrowUpRight size={14} /></a></div></div></footer>
    <dialog className="cf-property-dialog" ref={dialog} aria-labelledby="cf-detail-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) closeDetails(); }}>{selected && <div className="cf-dialog-content"><button type="button" className="cf-dialog-close" aria-label="Close property details" onClick={closeDetails}><X size={20} /></button><img src={`${selected.img}?auto=format&fit=crop&w=900&q=80`} alt={`${selected.name} example property`} width="900" height="600" /><div className="cf-dialog-copy"><span className="cf-sample-label">Example listing</span><h2 id="cf-detail-title">{selected.name}</h2><p><MapPin size={17} /> {selected.location}, Philippines · {selected.type}</p><strong className="cf-detail-price">{selected.price}</strong><p>This is an illustrative property and price, not a live listing. Sign in to browse the CityFavor property portal.</p><Link to="/login" className="cf-button cf-button-primary">Continue to CityFavor <ArrowRight size={17} /></Link></div></div>}</dialog>
  </div>;
}
function PropertyCard({ property, onDetails }) {
  return <article className="cf-property-card"><div className="cf-property-image"><img src={`${property.img}?auto=format&fit=crop&w=800&q=80`} alt={`${property.name} example in ${property.location}`} loading="lazy" decoding="async" width="800" height="600" /><span className="cf-property-type"><House size={13} />{property.type}</span></div><div className="cf-property-info"><p className="cf-property-location"><MapPin size={15} />{property.location}, Philippines</p><h3>{property.name}</h3><div className="cf-property-bottom"><div><span>Example price</span><strong>{property.price}</strong></div><button type="button" className="cf-details-button" onClick={onDetails}>View details <ArrowUpRight size={17} /><span className="cf-sr-only"> for {property.name}</span></button></div></div></article>;
}
