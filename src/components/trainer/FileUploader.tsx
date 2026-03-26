"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { FilePlus, Loader2 } from "lucide-react";
import type { UploadedFile } from "./types";

interface FileUploaderProps {
  trainerId: string;
  storagePrefix?: string;
  onFileAdded: (file: UploadedFile) => void;
  acceptExts?: string[];
  maxSizeMb?: number;
}

const DEFAULT_EXTS = ["pdf", "pptx", "ppt", "docx", "doc", "mp4", "mp3", "zip"];

export function FileUploader({
  trainerId,
  storagePrefix = "trainer-courses",
  onFileAdded,
  acceptExts = DEFAULT_EXTS,
  maxSizeMb = 100,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const acceptAttr = acceptExts.map((e) => `.${e}`).join(",");

  const handleUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!acceptExts.includes(ext)) {
        setError(`Format non supporté. Acceptés : ${acceptExts.map((e) => e.toUpperCase()).join(", ")}`);
        return;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`Fichier trop volumineux (max ${maxSizeMb} Mo)`);
        return;
      }

      setError(null);
      setUploading(true);
      setProgress(20);

      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${storagePrefix}/${trainerId}/${Date.now()}_${safeName}`;

        setProgress(40);

        const { data, error: uploadError } = await supabase.storage
          .from("elearning-documents")
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        setProgress(100);
        setUploading(false);

        onFileAdded({
          name: file.name,
          type: ext,
          size: file.size,
          path: data.path,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
        setUploading(false);
        setProgress(0);
      }
    },
    [trainerId, storagePrefix, supabase, onFileAdded, acceptExts, maxSizeMb]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-muted/30",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          onChange={onFileChange}
          className="hidden"
        />
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="h-7 w-7 text-primary animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Upload en cours... {progress}%</p>
            <div className="h-1.5 bg-muted rounded-full max-w-[160px] mx-auto overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <FilePlus className="h-7 w-7 text-muted-foreground mx-auto" />
            <p className="text-xs font-medium">Glissez un fichier ou cliquez</p>
            <p className="text-[11px] text-muted-foreground">
              {acceptExts.map((e) => e.toUpperCase()).join(", ")} — {maxSizeMb} Mo max
            </p>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
