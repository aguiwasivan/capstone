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
    await act(async () => root.render(<BlueprintViewer blueprint={{ id: 1 }} lots={[]} onViewportChange={viewportChanged} />));
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
  } finally {
    await act(async () => root.unmount());
    host.remove();
    global.ResizeObserver = originalObserver;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
