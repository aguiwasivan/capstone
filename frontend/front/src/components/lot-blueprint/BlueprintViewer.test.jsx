import { act } from "react";
import { createRoot } from "react-dom/client";
import BlueprintViewer from "./BlueprintViewer";

test("actual zoom library supports repeated button zoom and reset", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const originalObserver = global.ResizeObserver;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const viewportChanged = jest.fn();
  const click = async (text) => {
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent.includes(text)).click());
  };
  try {
    const lot = { id: 1, block_number: "A", lot_number: "1", status: "available", coordinates: [[100, 100], [200, 100], [200, 200]] };
    const selectLot = jest.fn();
    await act(async () => root.render(<BlueprintViewer blueprint={{ id: 1, name: "COTTA", image_url: "https://example.com/blueprint.png", width: 1200, height: 800 }} lots={[lot]} onSelectLot={selectLot} onViewportChange={viewportChanged} />));
    // The real library injects fit-content CSS at runtime. An inline percentage
    // keeps the content tied to the viewport in development and production.
    const content = host.querySelector(".blueprint-transform-content");
    expect(content.style.width).toBe("100%");
    expect(getComputedStyle(content).width).toBe("100%");
    expect(host.querySelector(".blueprint-canvas").style.aspectRatio).toBe("1200 / 800");
    expect(host.querySelector("svg").getAttribute("viewBox")).toBe("0 0 1200 800");
    expect(host.querySelector("polygon").getAttribute("points")).toBe("100,100 200,100 200,200");
    await act(async () => host.querySelector("img").dispatchEvent(new Event("load")));
    await act(async () => host.querySelector("polygon").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(selectLot).toHaveBeenCalledWith(lot);
    expect(host.querySelector("output").textContent).toBe("100%");
    await click("Zoom In");
    expect(host.querySelector("output").textContent).toBe("125%");
    await click("Zoom In");
    expect(host.querySelector("output").textContent).toBe("150%");
    await click("Zoom Out");
    expect(host.querySelector("output").textContent).toBe("125%");
    await click("Reset");
    expect(host.querySelector("output").textContent).toBe("100%");
    expect(viewportChanged).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 1, positionX: 0, positionY: 0 }));
    expect(content.style.width).toBe("100%");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    global.ResizeObserver = originalObserver;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
