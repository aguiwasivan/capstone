/* eslint testing-library/no-unnecessary-act: "off", testing-library/no-render-in-setup: "off" -- React DOM client tests require act; this file does not use Testing Library. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Landing from "./Landing";

// CRA's Jest resolver predates React Router 7's export map. Keep these focused
// on page interactions and link destinations without changing the app router.
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

let host;
let root;
let scroll;
let originalMatchMedia;
let originalScroll;
let originalShowModal;
let originalClose;

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  originalScroll = Element.prototype.scrollIntoView;
  originalShowModal = HTMLDialogElement.prototype.showModal;
  originalClose = HTMLDialogElement.prototype.close;
  window.matchMedia = jest.fn(() => ({ matches: false }));
  scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Landing />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.matchMedia = originalMatchMedia;
  Element.prototype.scrollIntoView = originalScroll;
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

async function click(element) { await act(async () => element.click()); }
async function change(element, value) {
  const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  await act(async () => element.dispatchEvent(new Event("change", { bubbles: true })));
}
async function submit(form) {
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

test("search filters the examples, handles no matches, and resets without a backend request", async () => {
  expect(host.querySelectorAll(".cf-property-card")).toHaveLength(3);
  const form = host.querySelector(".cf-search-panel");
  await change(form.elements.location, "  Makati  ");
  await submit(form);
  expect(host.querySelectorAll(".cf-property-card")).toHaveLength(1);
  expect(host.querySelector(".cf-property-card h3").textContent).toBe("Luxury Condo");
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  await change(form.elements.propertyType, "House");
  await submit(form);
  expect(host.querySelectorAll(".cf-property-card")).toHaveLength(0);
  expect(host.querySelector(".cf-empty")).not.toBeNull();
  await click(host.querySelector(".cf-reset"));
  expect(host.querySelectorAll(".cf-property-card")).toHaveLength(3);
});

test("mobile menu supports Escape and restores focus; Get Started links keep the login route", async () => {
  const button = host.querySelector(".cf-menu-toggle");
  await click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button);
  const links = [...host.querySelectorAll("a")].filter(link => link.textContent.includes("Get Started"));
  expect(links).toHaveLength(3);
  links.forEach(link => expect(link.getAttribute("href")).toBe("/login"));
});

test("details open the selected example with its preserved price and close cleanly", async () => {
  await click(host.querySelectorAll(".cf-details-button")[1]);
  const modal = host.querySelector("dialog");
  expect(modal.open).toBe(true);
  expect(modal.querySelector("h2").textContent).toBe("Luxury Condo");
  expect(modal.textContent).toContain("₱5,200,000");
  expect(modal.textContent).toContain("not a live listing");
  await click(host.querySelector(".cf-dialog-close"));
  expect(modal.open).toBe(false);
});

test("contact requires valid input and does not claim an unconnected enquiry was sent", async () => {
  const form = host.querySelector(".cf-contact-form");
  expect(form.checkValidity()).toBe(false);
  form.elements.name.value = "Sample Client";
  form.elements.email.value = "invalid-email";
  form.elements.message.value = "I would like to learn about properties.";
  expect(form.checkValidity()).toBe(false);
  form.elements.email.value = "client@example.com";
  expect(form.checkValidity()).toBe(true);
  await submit(form);
  expect(host.querySelector(".cf-contact-status").textContent).toContain("has not been sent");
  expect(form.elements.message.value).toContain("learn about properties");
});

test("search respects reduced motion", async () => {
  window.matchMedia.mockReturnValue({ matches: true });
  await submit(host.querySelector(".cf-search-panel"));
  expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
});
