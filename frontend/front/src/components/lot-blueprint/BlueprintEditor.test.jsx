import { act } from "react";
import { createRoot } from "react-dom/client";
import BlueprintEditor, { getSvgPoint } from "./BlueprintEditor";

jest.mock("./BlueprintViewer", () => ({ children, panMode }) => <div data-pan={String(panMode)}>{children}</div>);

test("pointer coordinates retain image alignment under zoom and pan", () => {
  const event = { clientX: 350, clientY: 220, currentTarget: { getBoundingClientRect: () => ({ left: -150, top: -80, width: 2000, height: 1300 }) } };
  expect(getSvgPoint(event, 1000, 650)).toEqual([250, 150]);
  expect(getSvgPoint({ ...event, clientX: -200, clientY: 2000 }, 1000, 650)).toEqual([0, 650]);
});

test("selecting a polygon never saves or moves it and pan mode cannot draw", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const lot = { id: 1, lot_number: 1, coordinates: [[10, 10], [100, 10], [100, 100]], status: "available" };
  const select = jest.fn();
  const update = jest.fn();
  const save = jest.fn();
  try {
    await act(async () => root.render(<BlueprintEditor blueprint={{ id: 1 }} lots={[lot]} onSelectLot={select} onUpdateLot={update} onSaveLot={save} />));
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Select / Edit").click());
    await act(async () => host.querySelector("polygon").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(select).toHaveBeenCalledWith(lot);
    expect(host.querySelector(".draft-polygon").getAttribute("points")).toBe("10,10 100,10 100,100");
    expect(update).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelectorAll("input[required]")).toHaveLength(0);
    const status = host.querySelector(".editor-form select");
    await act(async () => {
      status.value = "reserved";
      status.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(update).toHaveBeenCalledWith(1, { status: "reserved" });
    await act(async () => host.querySelector("polygon").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Pan Map").click());
    expect(host.querySelector("[data-pan]").dataset.pan).toBe("true");
    await act(async () => host.querySelector("svg").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelectorAll("circle")).toHaveLength(3);
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});

test("draw and save a polygon with no details", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const save = jest.fn();
  try {
    await act(async () => root.render(<BlueprintEditor blueprint={{ id: 1, width: 1000, height: 650 }} lots={[]} onSaveLot={save} />));
    const svg = host.querySelector("svg");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 650 });
    for (const [clientX, clientY] of [[10, 10], [100, 10], [100, 100]]) {
      await act(async () => svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY })));
    }
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ lot_number: "", category: "", area_sqm: null, price: null, coordinates: [[10, 10], [100, 10], [100, 100]] }));
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
