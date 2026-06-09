import * as XLSX from "xlsx";

function toSheet(rows: Array<Record<string, unknown>>, headers?: string[]) {
  if (rows.length === 0) return XLSX.utils.aoa_to_sheet([["Sin datos"]]);
  const cols = headers ?? Object.keys(rows[0]);
  const aoa: unknown[][] = [cols];
  for (const r of rows) aoa.push(cols.map((c) => r[c] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  return ws;
}

export function downloadWorkbook(sheets: Record<string, Array<Record<string, unknown>>>, fileName: string) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, toSheet(rows), name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}