"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PenLine, CheckCircle2, XCircle, Trash2 } from "lucide-react";

export interface SignaturePadProps {
  label: string;
  isSigned: boolean;
  onSign: (svgData: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Stroke color, defaults to #1d4ed8 */
  strokeColor?: string;
}

export function SignaturePad({
  label,
  isSigned,
  onSign,
  onClear,
  disabled,
  strokeColor = "#1d4ed8",
}: SignaturePadProps) {
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isSigned || disabled) return;
    e.preventDefault();
    setDrawing(true);
    setCurrentStroke([getPoint(e)]);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || isSigned || disabled) return;
    e.preventDefault();
    setCurrentStroke((prev) => [...prev, getPoint(e)]);
  };

  const handleEnd = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 2) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    onClear();
  };

  const hasDrawing = strokes.length > 0 && strokes.some((s) => s.length > 2);
  const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;

  const strokeToPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  };

  const handleValidate = () => {
    const paths = strokes
      .map((pts) => strokeToPath(pts))
      .filter(Boolean)
      .map((d) => `<path d="${d}" stroke="${strokeColor}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 128">${paths}</svg>`;
    onSign(svgData);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <div
        ref={canvasRef}
        className={cn(
          "relative w-full h-32 border-2 rounded-lg select-none overflow-hidden touch-none",
          isSigned
            ? "border-green-400 bg-green-50"
            : "border-dashed border-gray-300 bg-gray-50 cursor-crosshair",
          disabled && !isSigned && "opacity-50 cursor-not-allowed"
        )}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        {isSigned ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-xs font-semibold text-green-700">Signature validee</p>
          </div>
        ) : (
          <>
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {allStrokes.map((stroke, i) => (
                <path
                  key={i}
                  d={strokeToPath(stroke)}
                  stroke={strokeColor}
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
            {!hasDrawing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <PenLine className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Signer ici</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        {!isSigned && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={disabled || !hasDrawing}
              className="flex-1 text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Effacer
            </Button>
            <Button
              size="sm"
              onClick={handleValidate}
              disabled={disabled || !hasDrawing}
              className="flex-1 text-xs gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valider
            </Button>
          </>
        )}
        {isSigned && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="flex-1 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reinitialiser
          </Button>
        )}
      </div>
    </div>
  );
}
