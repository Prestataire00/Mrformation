import { Download, FileText } from "lucide-react";

interface BPFHeaderProps {
  title: string;
  onExportExcel: () => void;
  onExportPDF: () => void;
}

export function BPFHeader({ title, onExportExcel, onExportPDF }: BPFHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={onExportExcel}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#DC2626" }}
        >
          <Download className="h-4 w-4" />
          Excel
        </button>
        <button
          onClick={onExportPDF}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#DC2626" }}
        >
          <FileText className="h-4 w-4" />
          PDF
        </button>
      </div>
    </div>
  );
}
