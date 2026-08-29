import * as XLSX from "xlsx";

export interface XlsxColumn {
  header: string;
  width: number;
}

export function downloadXlsx(opts: {
  filename: string;
  sheetName?: string;
  title: string;
  subtitle?: string;
  columns: XlsxColumn[];
  rows: (string | number | null | undefined)[][];
  summaryRows?: (string | number | null | undefined)[][];
}) {
  const {
    filename,
    sheetName = "Báo cáo",
    title,
    subtitle,
    columns,
    rows,
    summaryRows = [],
  } = opts;

  const aoa: any[][] = [];

  aoa.push([title]);
  if (subtitle) aoa.push([subtitle]);
  aoa.push([]);

  aoa.push(columns.map((c) => c.header));

  for (const r of rows) aoa.push(r.map((v) => (v === null || v === undefined ? "" : v)));
  for (const r of summaryRows) aoa.push(r.map((v) => (v === null || v === undefined ? "" : v)));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = columns.map((c) => ({ wch: c.width }));

  const lastCol = columns.length - 1;
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  if (subtitle) merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  ws["!merges"] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
