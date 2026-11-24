import { act } from "react";
import { createRoot } from "react-dom/client";
import InteractiveBlueprint from "./InteractiveBlueprint";
import { AuthContext } from "../../context/AuthContext";
import * as api from "../../services/blueprintApi";

jest.mock("../../services/blueprintApi");
jest.mock("../../hooks/useAnalyticsRefresh", () => () => 0);
jest.mock("./BlueprintViewer", () => ({ children }) => <div>{children}</div>);

let host, root;
const points = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]];
const records = [1, 2].map((id) => ({ id: String(id), lot_number: String(id), block_number: "A", status: "available", coordinates: points, description: "", category: "Inner" }));
const click = async (text) => act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === text).click());
const status = async (value) => act(async () => {
  const select = host.querySelector(".editor-form select");
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  sessionStorage.clear();
  api.listBlueprints.mockResolvedValue({ data: [{ id: "map", title: "Map", lots: records }] });
  api.listBlueprintPolygons.mockResolvedValue({ data: records });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AuthContext.Provider value={{ user: { role: "admin" } }}><InteractiveBlueprint /></AuthContext.Provider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete global.IS_REACT_ACT_ENVIRONMENT; });

test("successful blueprint and polygon requests finish loading", () => {
  expect(api.listBlueprints).toHaveBeenCalled();
  expect(api.listBlueprintPolygons).toHaveBeenCalledWith("map");
  expect(host.textContent).not.toContain("Loading blueprints...");
  expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Correction Mode").disabled).toBe(false);
});

test("stages multiple lots and saves current form in one request, then refreshes details", async () => {
  await click("Correction Mode");
  await click("BA L1");
  await status("reserved");
  await click("BA L2");
  await status("pending");
  expect(api.saveBlueprintCorrections).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Unsaved Changes");
  api.saveBlueprintCorrections.mockResolvedValue({ data: records.map((lot, index) => ({ ...lot, status: index ? "pending" : "reserved" })) });
  await click("Save Corrections");
  expect(api.saveBlueprintCorrections).toHaveBeenCalledWith("map", { updates: [{ id: "1", status: "reserved" }, { id: "2", status: "pending" }], creates: [], deletes: [] });
  expect(host.textContent).toContain("Corrections saved successfully.");
  expect(host.textContent).not.toContain("Unsaved Changes");
  expect(host.querySelector(".lot-details-panel").textContent).toContain("pending");
});

test("failed batch retains edits and warns before discarding", async () => {
  await click("Correction Mode");
  await click("BA L1");
  await status("sold");
  api.saveBlueprintCorrections.mockRejectedValue(new Error("offline"));
  await click("Save Corrections");
  expect(host.textContent).toContain("Your edits are preserved");
  expect(host.textContent).toContain("Unsaved Changes");
  expect(host.textContent).not.toContain("Corrections saved successfully");
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  await click("Preview");
  expect(confirm).toHaveBeenCalled();
  expect(host.querySelector(".blueprint-editor")).not.toBeNull();
  api.saveBlueprintCorrections.mockResolvedValue({ data: [{ ...records[0], status: "sold" }, records[1]] });
  await click("Save Corrections");
  expect(api.saveBlueprintCorrections).toHaveBeenLastCalledWith("map", { updates: [{ id: "1", status: "sold" }], creates: [], deletes: [] });
  confirm.mockRestore();
});

test('upload overlay shows real progress until the server completes', async () => {
  let resolveUpload;
  api.uploadBlueprint.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
  const input = host.querySelector('.blueprint-header-actions input[type="file"]');
  const file = new File(['blueprint'], 'cotta.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(host.textContent).toContain('Uploading subdivision blueprint...');
  expect(input.disabled).toBe(true);
  const progress = api.uploadBlueprint.mock.calls[0][1];
  await act(async () => progress({ loaded: 50, total: 100 }));
  expect(host.querySelector('progress').value).toBe(50);
  await act(async () => progress({ loaded: 100, total: 100 }));
  expect(host.textContent).toContain('Processing blueprint...');
  expect(host.querySelector('.blueprint-upload-overlay')).not.toBeNull();
  await act(async () => resolveUpload({ data: { id: 'new-map', title: 'Cotta', lots: [] } }));
  expect(host.querySelector('.blueprint-upload-overlay')).toBeNull();
  expect(input.disabled).toBe(false);
});

test('failed upload removes overlay, shows error, and permits retry', async () => {
  api.uploadBlueprint.mockRejectedValue({ response: { data: { detail: 'Upload failed. Please retry.' } } });
  const input = host.querySelector('.blueprint-header-actions input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'map.png', { type: 'image/png' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(host.querySelector('.blueprint-upload-overlay')).toBeNull();
  expect(host.querySelector('[role="alert"]').textContent).toContain('Upload failed. Please retry.');
  expect(input.disabled).toBe(false);
});

test('header separates blueprint selection from action controls', () => {
  const header = host.querySelector('.blueprint-page-header');
  expect(header.querySelector('h1').textContent).toBe('Interactive Blueprint');
  expect(header.textContent).not.toContain('Interactive Lot Visualization');
  expect(header.querySelector('.blueprint-title-row .blueprint-status-pill')).not.toBeNull();
  expect(header.querySelector('.blueprint-selection-row select')).not.toBeNull();
  expect(header.querySelector('.blueprint-selection-row input[type="file"]')).not.toBeNull();
  expect(header.querySelector('.blueprint-action-toolbar .edit-mode-button')).not.toBeNull();
  expect(header.querySelector('.blueprint-action-toolbar .blueprint-publish-button')).not.toBeNull();
  expect(header.querySelector('.blueprint-action-toolbar .remove-blueprint-button')).not.toBeNull();
});

test('lot filters provide block, lot and status with reset', async () => {
  const filters = host.querySelector('.lot-filter-bar');
  expect([...filters.querySelectorAll('label span')].map((label) => label.textContent)).toEqual(['Block', 'Lot', 'Status']);
  expect(filters.querySelector('input[placeholder="Search phase"]')).toBeNull();
  expect(filters.querySelector('button').textContent.trim()).toBe('Reset');
  const status = filters.querySelector('select');
  await act(async () => { status.value = 'sold'; status.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(status.value).toBe('sold');
  await act(async () => filters.querySelector('button').click());
  expect(status.value).toBe('all');
});
