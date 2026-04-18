interface CSVColumn<T> {
  key: keyof T;
  label: string;
  format?: (value: unknown) => string;
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: CSVColumn<T>[]
): void {
  if (data.length === 0) return;

  const cols: CSVColumn<T>[] = columns || (Object.keys(data[0]) as (keyof T)[]).map(k => ({
    key: k,
    label: String(k),
  }));

  const headers = cols.map(c => c.label).join(";");
  const rows = data.map(row =>
    cols.map(c => {
      const val = row[c.key];
      const formatted = c.format ? c.format(val) : String(val ?? "");
      return `"${formatted.replace(/"/g, '""')}"`;
    }).join(";")
  );

  const csv = [headers, ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
