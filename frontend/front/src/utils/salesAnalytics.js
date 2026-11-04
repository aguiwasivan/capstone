export function summarizeSales(sales) {
  const fields = ["total_contract_price", "agent_commission", "manager_commission", "broker_commission"];
  const summary = { total_sales: sales.length };
  fields.forEach((field) => {
    summary[field] = sales.reduce((total, sale) => total + Math.round(Number(sale[field] || 0) * 100), 0) / 100;
  });
  return summary;
}

export function monthlySalesTotals(sales) {
  const totals = {};
  sales.forEach((sale) => {
    const period = String(sale.sale_date).slice(0, 7);
    totals[period] = (totals[period] || 0) + Math.round(Number(sale.total_contract_price) * 100);
  });
  const periods = Object.keys(totals).sort();
  if (!periods.length) return [];
  const rows = [];
  let period = periods[0];
  while (period <= periods[periods.length - 1]) {
    rows.push({ period, total_contract_price: (totals[period] || 0) / 100 });
    const [year, month] = period.split("-").map(Number);
    period = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;
  }
  return rows;
}
