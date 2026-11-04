/* eslint testing-library/no-unnecessary-act: "off", testing-library/no-render-in-setup: "off" -- These tests use React DOM directly, which requires act. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthContext } from "../context/AuthContext";
import api from "../api";
import Login from "./Login";
import Register from "./Register";

const mockNavigate = jest.fn();
const mockLogin = jest.fn();
jest.mock("../api", () => ({ post: jest.fn() }));
// CRA's older Jest resolver cannot resolve Router 7's export map. Only the
// navigation boundary is mocked; the real dashboard route helper is used.
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

let host;
let root;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(Page) {
  await act(async () => root.render(<AuthContext.Provider value={{ login: mockLogin }}><Page /></AuthContext.Provider>));
}
async function change(name, value) {
  const input = host.querySelector(`input[name="${name}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}
async function submit() {
  await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function click(selector) { await act(async () => host.querySelector(selector).click()); }
async function fillRegistration() {
  for (const [name, value] of Object.entries({ first_name: "Maria", last_name: "Santos", email: "maria@example.com", phone_number: "09171234567", address_line1: "12 Example Street", preferred_property: "Laguna", password: "HomeJourney!92", confirm_password: "HomeJourney!92" })) {
    await change(name, value);
  }
}

test.each(["admin", "client", "manager", "broker", "agent"])("login preserves API data and redirects the %s role", async role => {
  const data = { user: { id: 1, role }, access: "sample-access", refresh: "sample-refresh" };
  api.post.mockResolvedValueOnce({ data });
  await mount(Login);
  await change("username", "maria@example.com");
  await change("password", "OriginalPassword!9");
  await submit();
  expect(api.post).toHaveBeenCalledWith("login/", { username: "maria@example.com", password: "OriginalPassword!9" });
  expect(mockLogin).toHaveBeenCalledWith(data);
  expect(mockNavigate).toHaveBeenCalledWith(`/${role}/dashboard`, { replace: true });
});

test("login accepts the existing flat user response", async () => {
  const data = { id: 2, role: "broker" };
  api.post.mockResolvedValueOnce({ data });
  await mount(Login);
  await submit();
  expect(mockLogin).toHaveBeenCalledWith(data);
  expect(mockNavigate).toHaveBeenCalledWith("/broker/dashboard", { replace: true });
});

test("login shows errors, prevents duplicate requests, and restores the form", async () => {
  let rejectRequest;
  api.post.mockReturnValueOnce(new Promise((resolve, reject) => { rejectRequest = reject; }));
  await mount(Login);
  await change("username", "maria");
  await change("password", "OriginalPassword!9");
  await submit();
  await submit();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(host.querySelector("button[type=submit]").disabled).toBe(true);
  expect(host.querySelector("input").matches(":disabled")).toBe(true);
  expect(host.querySelector("form").getAttribute("aria-busy")).toBe("true");
  await act(async () => rejectRequest(new Error("Login failed")));
  expect(host.querySelector("[role=alert]").textContent).toContain("Check your email/username and password");
  expect(host.querySelector("button[type=submit]").disabled).toBe(false);
  expect(mockLogin).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("login password visibility changes without changing the entered password", async () => {
  await mount(Login);
  await change("password", "KeepThisValue!8");
  await click('[aria-label="Show password"]');
  expect(host.querySelector('[name="password"]').type).toBe("text");
  expect(host.querySelector('[name="password"]').value).toBe("KeepThisValue!8");
  await click('[aria-label="Hide password"]');
  expect(host.querySelector('[name="password"]').type).toBe("password");
});

test("registration sends the unchanged buyer payload and redirects to login", async () => {
  api.post.mockResolvedValueOnce({ data: {} });
  await mount(Register);
  await fillRegistration();
  expect(host.querySelector("form").checkValidity()).toBe(true);
  await submit();
  expect(api.post).toHaveBeenCalledWith("register/", {
    first_name: "Maria", last_name: "Santos", email: "maria@example.com",
    password: "HomeJourney!92", role: "client", phone_number: "09171234567",
    address_line1: "12 Example Street", city: "Laguna", buyer_type: "individual",
    preferred_contact_method: "email",
  });
  expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  expect(mockLogin).not.toHaveBeenCalled();
});

test("mismatched passwords are announced and never submitted", async () => {
  await mount(Register);
  await fillRegistration();
  await change("confirm_password", "DifferentPassword!9");
  expect(host.querySelector('[name="confirm_password"]').getAttribute("aria-invalid")).toBe("true");
  expect(host.querySelector("#cf-password-match").textContent).toContain("do not match");
  await submit();
  expect(api.post).not.toHaveBeenCalled();
  expect(host.querySelector("[role=alert]").textContent).toContain("do not match");
  await change("confirm_password", "HomeJourney!92");
  expect(host.querySelector("#cf-password-match").textContent).toContain("Passwords match");
});

test("registration prevents duplicate submissions and preserves backend error details", async () => {
  let rejectRequest;
  api.post.mockReturnValueOnce(new Promise((resolve, reject) => { rejectRequest = reject; }));
  await mount(Register);
  await fillRegistration();
  await submit();
  await submit();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(host.querySelector("button[type=submit]").disabled).toBe(true);
  await act(async () => rejectRequest({ response: { data: { email: ["A user with this email already exists."] } } }));
  expect(host.querySelector("[role=alert]").textContent).toContain("email: A user with this email already exists.");
  expect(host.querySelector("button[type=submit]").disabled).toBe(false);
  expect(host.querySelector('[name="first_name"]').value).toBe("Maria");
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("registration keeps optional fields optional, validates email, and toggles each password independently", async () => {
  await mount(Register);
  await fillRegistration();
  for (const name of ["phone_number", "address_line1", "preferred_property"]) {
    await change(name, "");
    expect(host.querySelector(`[name="${name}"]`).required).toBe(false);
  }
  expect(host.querySelector("form").checkValidity()).toBe(true);
  await change("email", "not-an-email");
  expect(host.querySelector("form").checkValidity()).toBe(false);
  await click('[aria-label="Show password"]');
  expect(host.querySelector('[name="password"]').type).toBe("text");
  expect(host.querySelector('[name="confirm_password"]').type).toBe("password");
  await click('[aria-label="Show confirm password"]');
  expect(host.querySelector('[name="confirm_password"]').type).toBe("text");
  expect(host.querySelector('[name="confirm_password"]').value).toBe("HomeJourney!92");
});
