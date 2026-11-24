import { act } from "react";
import { createRoot } from "react-dom/client";
import LotDetailsPanel from "./LotDetailsPanel";

test("compact lot details preserve actions and hide removed fields", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const edit = jest.fn();
  const request = jest.fn();
  try {
    await act(async () => root.render(<LotDetailsPanel role="client" lot={{ subdivision: "Cotta", block_number: "3", lot_number: "15", status: "available", area_sqm: 90, price: 0, location_zone: "unassigned", category: "Stored category", description: "Stored description", phase: "Stored phase" }} onEditDetails={edit} onRequestReservation={request} />));
    expect(host.querySelector('.lot-details-subdivision').textContent).toBe('Cotta');
    expect(host.querySelector('.lot-details-title-row').textContent).toContain('Block 3, Lot 15');
    expect(host.querySelector('.lot-detail-zone').textContent).toContain('Not set');
    expect(host.textContent).not.toContain('Stored category');
    expect(host.textContent).not.toContain('Stored description');
    expect(host.textContent).not.toContain('Stored phase');
    await act(async () => host.querySelector('.lot-details-edit-button').click());
    expect(edit).toHaveBeenCalledTimes(1);
    await act(async () => host.querySelector('.lot-reservation-actions button').click());
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
