"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, FileText, Loader2, X } from "lucide-react";
import type { UploadedFile } from "./types";

const TYPE_COLORS: Record<string, string> = {
  pdf: "text-red-600",
  pptx: "text-orange-600",
  ppt: "text-orange-600",
  docx: "text-blue-600",
  doc: "text-blue-600",
  mp4: "text-purple-600",
  mp3: "text-green-600",
  zip: "text-gray-600",
  jpg: "text-pink-600",
  jpeg: "text-pink-600",
  png: "text-teal-600",
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface FileItemProps {
  file: UploadedFile;
  onDownload?: () => Promise<void>;
  onRemove?: () => void;
}

export function FileItem({ file, onDownload, onRemove }: FileItemProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!onDownload) return;
    setLoading(true);
    try {
      await onDownload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
      <FileText className={cn("h-4 w-4 shrink-0", TYPE_COLORS[file.type] ?? "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground">{formatSize(file.size)} · {file.type.toUpperCase()}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onDownload && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
