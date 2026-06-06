import { Download, FileText, Loader2 } from "lucide-react";

interface BPFHeaderProps {
  title: string;
  onExportExcel: () => void;
  onExportPDF: () => void;
  exportingExcel?: boolean;
  exportingPDF?: boolean;
}

export function BPFHeader({ title, onExportExcel, onExportPDF, exportingExcel, exportingPDF }: BPFHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={onExportExcel}
          disabled={exportingExcel}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#374151" }}
        >
          {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exportingExcel ? "Génération..." : "Excel"}
        </button>
        <button
          onClick={onExportPDF}
          disabled={exportingPDF}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#374151" }}
        >
          {exportingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {exportingPDF ? "Génération..." : "PDF"}
        </button>
      </div>
    </div>
  );
}
