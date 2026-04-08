"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onUploadComplete: (file: { name: string; url: string; type: string; size: number }) => void;
  accept?: string;
  maxSizeMB?: number;
}

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};

export default function FileUploadZone({
  onUploadComplete,
  maxSizeMB = 20,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExts = ["pdf", "docx", "pptx", "txt", "doc", "ppt"];
    if (!validExts.includes(ext || "")) {
      return "Format non supporté. Formats acceptés : PDF, DOCX, PPTX, TXT";
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `Fichier trop volumineux (max ${maxSizeMB} Mo)`;
    }
    return null;
  };

  const getFileType = (file: File): string => {
    if (ACCEPTED_TYPES[file.type]) return ACCEPTED_TYPES[file.type];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "doc") return "docx";
    if (ext === "ppt") return "pptx";
    return ext || "pdf";
  };

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setSelectedFile(file);
      setUploading(true);
      setUploadProgress(10);

      try {
        const supabase = createClient();
        const fileType = getFileType(file);
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `elearning/${timestamp}_${safeName}`;

        setUploadProgress(30);

        const { data, error: uploadError } = await supabase.storage
          .from("elearning-documents")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        setUploadProgress(80);

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("elearning-documents").getPublicUrl(data.path);

        setUploadProgress(100);
        setUploading(false);

        onUploadComplete({
          name: file.name,
          url: publicUrl,
          type: fileType,
          size: file.size,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [onUploadComplete, maxSizeMB]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const reset = () => {
    setSelectedFile(null);
    setUploading(false);
    setUploadProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
          isDragging
            ? "border-[#374151] bg-[#374151]/5"
            : "border-gray-300 hover:border-[#374151] hover:bg-gray-50",
          uploading && "pointer-events-none opacity-70"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.doc,.ppt"
          onChange={onFileChange}
          className="hidden"
        />

        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="h-10 w-10 text-[#374151] animate-spin mx-auto" />
            <p className="text-sm font-medium text-gray-700">
              Upload en cours... {uploadProgress}%
            </p>
            <div className="h-2 bg-gray-200 rounded-full max-w-xs mx-auto overflow-hidden">
              <div
                className="h-full bg-[#374151] rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-[#374151]" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} Mo
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="p-1 rounded-full hover:bg-gray-200"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 text-gray-400 mx-auto" />
            <p className="text-sm font-medium text-gray-700">
              Glissez un fichier ici ou cliquez pour sélectionner
            </p>
            <p className="text-xs text-gray-400">
              PDF, DOCX, PPTX ou TXT — {maxSizeMB} Mo max
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
