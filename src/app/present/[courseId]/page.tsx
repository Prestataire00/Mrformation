"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Monitor,
  Play,
  Square,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Slide, SlideElement, SlideSpec } from "@/lib/types/elearning";

type Role = "presenter" | "audience";

const COLORS: Record<string, string> = {
  title: "from-blue-600 to-blue-700",
  content: "from-white to-gray-50",
  two_columns: "from-white to-gray-50",
  quiz_question: "from-purple-600 to-purple-700",
  quiz_answer: "from-green-600 to-green-700",
  flashcard: "from-gray-50 to-gray-100",
  recap: "from-gray-800 to-gray-900",
  image: "from-white to-gray-50",
};

function SlideRenderer({ slide }: { slide: Slide }) {
  const isDark = ["title", "recap", "quiz_question", "quiz_answer"].includes(slide.type);

  return (
    <div className={cn("w-full h-full rounded-2xl bg-gradient-to-br p-8 flex flex-col relative overflow-hidden", COLORS[slide.type] || COLORS.content)}>
      {/* Title */}
      {slide.title && (
        <div className={cn(slide.type === "title" ? "flex-1 flex items-center justify-center" : "mb-4")}>
          <h2 className={cn(
            "font-bold leading-tight",
            slide.type === "title" ? "text-4xl text-center" : "text-2xl",
            isDark ? "text-white" : "text-gray-900"
          )}>
            {slide.title}
          </h2>
        </div>
      )}

      {/* Subtitle */}
      {slide.subtitle && (
        <p className={cn(
          slide.type === "title" ? "text-center text-lg -mt-8" : "text-base mb-4",
          isDark ? "text-white/70" : "text-gray-500"
        )}>
          {slide.subtitle}
        </p>
      )}

      {/* Elements */}
      {slide.type !== "title" && (
        <div className="flex-1 flex flex-col justify-start gap-3 overflow-auto">
          {slide.elements.map((el, idx) => (
            <ElementRenderer key={idx} element={el} isDark={isDark} />
          ))}
        </div>
      )}

      {/* Citations footer */}
      {slide.citations && slide.citations.length > 0 && (
        <p className={cn("text-xs mt-auto pt-2 italic", isDark ? "text-white/40" : "text-gray-400")}>
          Réf: {slide.citations.map((c) => c.text).join(" | ")}
        </p>
      )}
    </div>
  );
}

function ElementRenderer({ element, isDark }: { element: SlideElement; isDark: boolean }) {
  if (element.kind === "text" && element.text) {
    return <p className={cn("text-base leading-relaxed", isDark ? "text-white/90" : "text-gray-700")}>{element.text}</p>;
  }
  if (element.kind === "bullets" && element.bullets) {
    return (
      <ul className="space-y-2">
        {element.bullets.map((b, i) => (
          <li key={i} className={cn("flex items-start gap-2 text-base", isDark ? "text-white/90" : "text-gray-700")}>
            <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", isDark ? "bg-white/50" : "bg-blue-400")} />
            {b}
          </li>
        ))}
      </ul>
    );
  }
  if (element.kind === "table" && element.bullets) {
    return (
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {element.bullets.map((row, i) => (
              <tr key={i} className={cn("border-b", isDark ? "border-white/10" : "border-gray-200")}>
                <td className={cn("py-2 px-3", isDark ? "text-white/90" : "text-gray-700")}>{row}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function PresentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { toast } = useToast();
  const courseId = params.courseId as string;
  const role: Role = (searchParams.get("role") as Role) || "audience";

  const [loading, setLoading] = useState(true);
  const [slideSpec, setSlideSpec] = useState<SlideSpec | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const [audienceCount, setAudienceCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch slide spec
  useEffect(() => {
    const fetchSlides = async () => {
      const res = await fetch(`/api/elearning/${courseId}/slides`);
      const { data } = await res.json();
      if (data?.slide_spec) {
        setSlideSpec(data.slide_spec);
      }
      setLoading(false);
    };
    fetchSlides();
  }, [courseId]);

  // Supabase Realtime
  useEffect(() => {
    const channel = supabase.channel(`live-${courseId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "slide_change" }, ({ payload }) => {
      if (role === "audience") {
        setCurrentSlideIndex(payload.index);
      }
    });

    channel.on("broadcast", { event: "session_end" }, () => {
      setSessionEnded(true);
    });

    channel.on("broadcast", { event: "audience_ping" }, () => {
      if (role === "presenter") {
        setAudienceCount((c) => c + 1);
        // Reset after 10s
        setTimeout(() => setAudienceCount((c) => Math.max(0, c - 1)), 10000);
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        // Audience: ping presenter
        if (role === "audience") {
          channel.send({ type: "broadcast", event: "audience_ping", payload: {} });
        }
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId, role]);

  // Keyboard navigation (presenter only)
  useEffect(() => {
    if (role !== "presenter" || !slideSpec) return;

    const handleKey = (e: KeyboardEvent) => {
      const slides = slideSpec.deck.slides;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentSlideIndex((prev) => {
          const next = Math.min(prev + 1, slides.length - 1);
          channelRef.current?.send({ type: "broadcast", event: "slide_change", payload: { index: next } });
          // Also update DB
          fetch(`/api/elearning/${courseId}/live-session`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_slide_index: next }),
          });
          return next;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentSlideIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          channelRef.current?.send({ type: "broadcast", event: "slide_change", payload: { index: next } });
          fetch(`/api/elearning/${courseId}/live-session`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_slide_index: next }),
          });
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [role, slideSpec, courseId]);

  const goToSlide = (index: number) => {
    setCurrentSlideIndex(index);
    if (role === "presenter") {
      channelRef.current?.send({ type: "broadcast", event: "slide_change", payload: { index } });
      fetch(`/api/elearning/${courseId}/live-session`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_slide_index: index }),
      });
    }
  };

  const endSession = async () => {
    channelRef.current?.send({ type: "broadcast", event: "session_end", payload: {} });
    await fetch(`/api/elearning/${courseId}/live-session`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    setSessionEnded(true);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  if (!slideSpec || !slideSpec.deck.slides.length) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <Monitor className="h-12 w-12 mx-auto mb-4 text-gray-500" />
          <p className="text-lg">Aucune slide disponible</p>
          <a href={`/admin/elearning/courses/${courseId}`} className="text-blue-400 text-sm mt-2 block hover:underline">
            Retour au cours
          </a>
        </div>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
          <p className="text-xl font-semibold">Présentation terminée</p>
          <p className="text-gray-400 mt-2">Merci pour votre participation !</p>
          <a href={`/admin/elearning/courses/${courseId}`} className="text-blue-400 text-sm mt-4 block hover:underline">
            Retour au cours
          </a>
        </div>
      </div>
    );
  }

  const slides = slideSpec.deck.slides;
  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Presenter: slide list sidebar */}
      {role === "presenter" && (
        <div className="w-56 bg-gray-800 border-r border-gray-700 overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Slides</p>
          </div>
          <div className="p-2 space-y-1">
            {slides.map((s, idx) => (
              <button
                key={s.slide_id || idx}
                onClick={() => goToSlide(idx)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all",
                  idx === currentSlideIndex
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                )}
              >
                <span className="font-bold mr-1.5">{idx + 1}.</span>
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main slide area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <a href={`/admin/elearning/courses/${courseId}`} className="text-gray-400 hover:text-white transition">
              <ArrowLeft className="h-4 w-4" />
            </a>
            <span className="text-sm text-gray-300 font-medium">
              {role === "presenter" ? "Mode Présentateur" : "Mode Audience"}
            </span>
            <span className={cn("flex items-center gap-1 text-xs", connected ? "text-green-400" : "text-red-400")}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connected ? "Connecté" : "Déconnecté"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {role === "presenter" && (
              <>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="h-3 w-3" /> ~{audienceCount} spectateur{audienceCount > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-gray-500">
                  {currentSlideIndex + 1} / {slides.length}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={endSession}
                  className="gap-1 text-red-400 border-red-800 hover:bg-red-900/50 h-7 text-xs"
                >
                  <Square className="h-3 w-3" /> Terminer
                </Button>
              </>
            )}
            {role === "audience" && (
              <span className="text-xs text-gray-500">
                Slide {currentSlideIndex + 1} / {slides.length}
              </span>
            )}
          </div>
        </div>

        {/* Slide */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-5xl aspect-video">
            <SlideRenderer slide={currentSlide} />
          </div>
        </div>

        {/* Bottom controls (presenter) */}
        {role === "presenter" && (
          <div className="flex items-center justify-between px-6 py-3 bg-gray-800 border-t border-gray-700">
            <Button
              size="sm"
              variant="outline"
              disabled={currentSlideIndex === 0}
              onClick={() => goToSlide(currentSlideIndex - 1)}
              className="gap-1 text-gray-300 border-gray-600 hover:bg-gray-700 h-8"
            >
              <ChevronLeft className="h-4 w-4" /> Précédent
            </Button>

            {/* Speaker notes */}
            <div className="flex-1 mx-6 max-h-16 overflow-y-auto">
              {currentSlide.speaker_notes && (
                <p className="text-xs text-gray-400 italic">{currentSlide.speaker_notes}</p>
              )}
            </div>

            <Button
              size="sm"
              disabled={currentSlideIndex >= slides.length - 1}
              onClick={() => goToSlide(currentSlideIndex + 1)}
              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white h-8"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
