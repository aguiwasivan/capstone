import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./PropertyListings.css";

const storageKey = "primePropertyListings";
const listingTypes = ["sale", "rent"];

const emptyForm = {
  title: "",
  listingType: "sale",
  price: "",
  address: "",
  bedrooms: "",
  bathrooms: "",
  area: "",
  description: "",
  imageData: "",
};

function loadListings() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function typeLabel(type) {
  return type === "rent" ? "For Rent" : "For Sale";
}

function getListingStatus(listing) {
  if (listing.reservationStatus) return listing.reservationStatus;
  return listing.reserved ? "reserved" : "available";
}

function getUserName(user) {
  return (
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    user?.email ||
    "Client"
  );
}

export default function PropertyListings({ basePath = "/client/property-listings" }) {
  const { listingType = "sale" } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === "admin";
  const userRole = String(user?.role || "").toLowerCase();
  const canReviewReservations = ["manager", "broker"].includes(userRole);
  const activeType = listingTypes.includes(listingType) ? listingType : "sale";
  const [listings, setListings] = useState(loadListings);
  const [form, setForm] = useState({ ...emptyForm, listingType: activeType });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!listingTypes.includes(listingType)) {
      navigate(`${basePath}/sale`, { replace: true });
    }
  }, [basePath, listingType, navigate]);

  useEffect(() => {
    setForm((current) => ({ ...current, listingType: activeType }));
  }, [activeType]);

  const visibleListings = useMemo(
    () => listings.filter((listing) => listing.listingType === activeType),
    [activeType, listings]
  );

  const saveListings = (nextListings) => {
    localStorage.setItem(storageKey, JSON.stringify(nextListings));
    setListings(nextListings);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, imageData: reader.result }));
      setMessage("");
    };
    reader.onerror = () => setMessage("Unable to read this image.");
    reader.readAsDataURL(file);
  };

  const submit = (event) => {
    event.preventDefault();

    const nextListing = {
      ...form,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      listingType: activeType,
      reserved: false,
      reservedBy: "",
      reservationStatus: "available",
      requestedBy: "",
      reviewedBy: "",
    };

    saveListings([nextListing, ...listings]);
    setForm({ ...emptyForm, listingType: activeType });
    setMessage(`${typeLabel(activeType)} property added.`);
  };

  const removeListing = (listingId) => {
    saveListings(listings.filter((listing) => listing.id !== listingId));
  };

  const reserveListing = (listingId) => {
    saveListings(
      listings.map((listing) =>
        listing.id === listingId
          ? {
              ...listing,
              reserved: false,
              reservedBy: "",
              reservationStatus: "pending",
              requestedBy: getUserName(user),
              reviewedBy: "",
            }
          : listing
      )
    );
    setMessage("Property reservation request submitted for approval.");
  };

  const reviewListing = (listingId, approved) => {
    saveListings(
      listings.map((listing) =>
        listing.id === listingId
          ? {
              ...listing,
              reserved: approved,
              reservedBy: approved ? listing.requestedBy : "",
              reservationStatus: approved ? "reserved" : "available",
              requestedBy: approved ? listing.requestedBy : "",
              reviewedBy: getUserName(user),
            }
          : listing
      )
    );
    setMessage(`Property reservation ${approved ? "approved" : "declined"}.`);
  };

  return (
    <div className="property-listings-page">
      <div className="property-listings-header">
        <div>
          <h1>Properties</h1>
          <p>Browse property listings by availability type.</p>
        </div>
        <label className="property-type-select">
          <span>Show</span>
          <select
            value={activeType}
            onChange={(event) => navigate(`${basePath}/${event.target.value}`)}
          >
            <option value="sale">For Sale</option>
            <option value="rent">For Rent</option>
          </select>
        </label>
      </div>

      {isAdmin && (
        <section className="property-listing-form-panel">
          <div>
            <h2>Add {typeLabel(activeType)} Property</h2>
            <p>Add a photo, price, address, and property details.</p>
          </div>

          {message && <p className="property-listing-message">{message}</p>}

          <form className="property-listing-form" onSubmit={submit}>
            <label>
              Property Name
              <input name="title" value={form.title} onChange={handleChange} required />
            </label>
            <label>
              Price
              <input name="price" value={form.price} onChange={handleChange} placeholder="PHP 3,500,000" required />
            </label>
            <label className="property-form-wide">
              Address
              <input name="address" value={form.address} onChange={handleChange} required />
            </label>
            <label>
              Bedrooms
              <input name="bedrooms" type="number" min="0" value={form.bedrooms} onChange={handleChange} />
            </label>
            <label>
              Bathrooms
              <input name="bathrooms" type="number" min="0" value={form.bathrooms} onChange={handleChange} />
            </label>
            <label>
              Floor Area
              <input name="area" value={form.area} onChange={handleChange} placeholder="120 sqm" />
            </label>
            <label>
              Picture
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </label>
            <label className="property-form-wide">
              Description
              <textarea name="description" value={form.description} onChange={handleChange} rows="3" />
            </label>
            <button type="submit">Add Property</button>
          </form>
        </section>
      )}

      <section className="property-listing-grid" aria-label={`${typeLabel(activeType)} properties`}>
        {visibleListings.map((listing) => (
          <article className="property-listing-card" key={listing.id}>
            {listing.imageData ? (
              <img src={listing.imageData} alt={listing.title} />
            ) : (
              <div className="property-listing-placeholder">No Image</div>
            )}
            <div className="property-listing-card-body">
              <span>{typeLabel(listing.listingType)}</span>
              <h2>{listing.title}</h2>
              <strong>{listing.price}</strong>
              <p>{listing.address}</p>
              {getListingStatus(listing) !== "available" && (
                <p className={`property-reserved-status ${getListingStatus(listing)}`}>
                  {getListingStatus(listing) === "pending"
                    ? `Pending approval${listing.requestedBy ? ` for ${listing.requestedBy}` : ""}`
                    : `Reserved${listing.reservedBy ? ` by ${listing.reservedBy}` : ""}`}
                </p>
              )}
              <div className="property-listing-meta">
                <b>{listing.bedrooms || 0} Bed</b>
                <b>{listing.bathrooms || 0} Bath</b>
                <b>{listing.area || "Area TBA"}</b>
              </div>
              {listing.description && <p>{listing.description}</p>}
              {!isAdmin && !canReviewReservations && (
                <button
                  type="button"
                  onClick={() => reserveListing(listing.id)}
                  disabled={getListingStatus(listing) !== "available" || canReviewReservations}
                >
                  {getListingStatus(listing) === "pending"
                    ? "Pending Approval"
                    : getListingStatus(listing) === "reserved"
                      ? "Reserved"
                      : "Reserve"}
                </button>
              )}
              {canReviewReservations && getListingStatus(listing) === "pending" && (
                <div className="property-review-actions">
                  <button type="button" onClick={() => reviewListing(listing.id, true)}>
                    Approve
                  </button>
                  <button type="button" onClick={() => reviewListing(listing.id, false)}>
                    Decline
                  </button>
                </div>
              )}
              {isAdmin && (
                <button type="button" onClick={() => removeListing(listing.id)}>
                  Remove
                </button>
              )}
            </div>
          </article>
        ))}

        {!visibleListings.length && (
          <p className="property-listing-empty">
            No {typeLabel(activeType).toLowerCase()} properties yet.
          </p>
        )}
      </section>
    </div>
  );
}
