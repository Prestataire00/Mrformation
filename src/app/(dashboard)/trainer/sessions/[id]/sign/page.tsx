"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, getInitials } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  Loader2,
  PenLine,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SessionInfo {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  duration_hours: number | null;
  training: { title: string } | null;
}

interface TimeSlot {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  slot_order: number;
}

interface SlotSignatureState {
  slotId: string;
  trainerSigned: boolean;
  trainerSignature: { id: string; signature_data: string; signed_at: string } | null;
  learnerStatuses: {
    learner_id: string;
    first_name: string;
    last_name: string;
    signed: boolean;
  }[];
}

export default function TrainerSignPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotStates, setSlotStates] = useState<Map<string, SlotSignatureState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [signingSlot, setSigningSlot] = useState<string | null>(null);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [trainerId, setTrainerId] = useState<string | null>(null);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get trainer ID from profile
    const { data: trainerData } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    const tId = trainerData?.id || user.id;
    setTrainerId(tId);

    // Load session
    const { data: sessionData } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, location, mode, status, duration_hours, training:trainings(title)")
      .eq("id", sessionId)
      .single();

    if (sessionData) {
      setSession({
        ...sessionData,
        training: Array.isArray(sessionData.training) ? sessionData.training[0] || null : sessionData.training,
      } as SessionInfo);
    }

    // Load time slots
    const { data: slots } = await supabase
      .from("formation_time_slots")
      .select("id, title, start_time, end_time, slot_order")
      .eq("session_id", sessionId)
      .order("slot_order", { ascending: true });

    const slotList = slots || [];
    setTimeSlots(slotList);

    // Load all signatures for this session
    const { data: allSigs } = await supabase
      .from("signatures")
      .select("id, signer_id, signer_type, signature_data, signed_at, time_slot_id")
      .eq("session_id", sessionId);

    // Load enrollments
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("learner_id, learner:learners(id, first_name, last_name)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed"]);

    // Build state per slot
    const stateMap = new Map<string, SlotSignatureState>();

    if (slotList.length > 0) {
      for (const slot of slotList) {
        const slotSigs = (allSigs || []).filter(s => s.time_slot_id === slot.id);
        const trainerSig = slotSigs.find(s => s.signer_id === tId && s.signer_type === "trainer");

        const learnerStatuses = (enrollments || []).map((e: any) => {
          const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
          const sig = slotSigs.find(s => s.signer_id === learner?.id && s.signer_type === "learner");
          return {
            learner_id: e.learner_id,
            first_name: learner?.first_name || "",
            last_name: learner?.last_name || "",
            signed: !!sig,
          };
        });

        stateMap.set(slot.id, {
          slotId: slot.id,
          trainerSigned: !!trainerSig,
          trainerSignature: trainerSig || null,
          learnerStatuses,
        });
      }
      // Auto-expand first unsigned slot
      const firstUnsigned = slotList.find(s => !stateMap.get(s.id)?.trainerSigned);
      if (firstUnsigned) {
        setExpandedSlots(new Set([firstUnsigned.id]));
      }
    } else {
      // No slots — legacy mode: single session signature
      const trainerSig = (allSigs || []).find(s => s.signer_id === tId && s.signer_type === "trainer" && !s.time_slot_id);
      const learnerStatuses = (enrollments || []).map((e: any) => {
        const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
        const sig = (allSigs || []).find(s => s.signer_id === learner?.id && s.signer_type === "learner" && !s.time_slot_id);
        return {
          learner_id: e.learner_id,
          first_name: learner?.first_name || "",
          last_name: learner?.last_name || "",
          signed: !!sig,
        };
      });
      stateMap.set("session", {
        slotId: "session",
        trainerSigned: !!trainerSig,
        trainerSignature: trainerSig || null,
        learnerStatuses,
      });
    }

    setSlotStates(stateMap);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSign(svgData: string, slotId: string) {
    setSigningSlot(slotId);
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          signature_data: svgData,
          time_slot_id: slotId === "session" ? undefined : slotId,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({ title: "Erreur", description: result.error || "Impossible de sauvegarder.", variant: "destructive" });
        setSigningSlot(null);
        return;
      }

      toast({ title: "Signature enregistrée", description: "Votre présence a été validée." });
      await loadData();
    } catch {
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    }
    setSigningSlot(null);
  }

  const toggleSlot = (slotId: string) => {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Session introuvable.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>
      </div>
    );
  }

  // Render a single slot's signature section
  const renderSlotSection = (slotId: string, label: string, sublabel: string | null) => {
    const state = slotStates.get(slotId);
    if (!state) return null;

    const isExpanded = expandedSlots.has(slotId);
    const signedCount = state.learnerStatuses.filter(l => l.signed).length;
    const totalLearners = state.learnerStatuses.length;
    const pct = totalLearners > 0 ? Math.round((signedCount / totalLearners) * 100) : 0;

    return (
      <Card key={slotId}>
        <CardHeader
          className="pb-3 cursor-pointer"
          onClick={() => toggleSlot(slotId)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {state.trainerSigned ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <PenLine className="h-4 w-4 text-blue-600" />
                )}
                {label}
              </CardTitle>
              {sublabel && <p className="text-sm text-muted-foreground mt-1">{sublabel}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <Badge
                  className={state.trainerSigned
                    ? "bg-green-100 text-green-700 hover:bg-green-100"
                    : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                  }
                >
                  {state.trainerSigned ? "Signé" : "À signer"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Apprenants: {signedCount}/{totalLearners}
                </p>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
          <Progress value={pct} className="h-1.5 mt-2" />
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-4">
            {/* Trainer signature */}
            {state.trainerSigned && state.trainerSignature ? (
              <div className="space-y-2">
                <div className="border-2 border-green-400 rounded-lg bg-green-50 p-3">
                  <div
                    className="w-full h-24 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: state.trainerSignature.signature_data }}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileCheck className="h-4 w-4 text-green-600" />
                  <span>Signé le {formatDate(state.trainerSignature.signed_at)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Dessinez votre signature pour valider ce créneau
                </p>
                <SignaturePad
                  label="Signature formateur"
                  isSigned={false}
                  onSign={(svg) => handleSign(svg, slotId)}
                  onClear={() => {}}
                  disabled={signingSlot === slotId}
                />
                {signingSlot === slotId && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
                  </div>
                )}
              </div>
            )}

            {/* Learner statuses */}
            {totalLearners > 0 && (
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Apprenants ({signedCount}/{totalLearners})
                </h4>
                <div className="space-y-1.5">
                  {state.learnerStatuses.map(l => (
                    <div
                      key={l.learner_id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {getInitials(`${l.first_name} ${l.last_name}`)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{l.first_name} {l.last_name}</span>
                      </div>
                      {l.signed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-300" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Signature formateur</h1>
          <p className="text-sm text-gray-500">
            Validez les heures de formation dispensées
          </p>
        </div>
      </div>

      {/* Session info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{session.title}</CardTitle>
          {session.training && (
            <CardDescription>{session.training.title}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <CalendarDays className="h-4 w-4" />
              <span>
                {formatDate(session.start_date)}
                {session.end_date && ` → ${formatDate(session.end_date)}`}
              </span>
            </div>
            {session.location && (
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="h-4 w-4" />
                <span>{session.location}</span>
              </div>
            )}
            {session.duration_hours && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{session.duration_hours}h de formation</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="h-4 w-4" />
              <span>{timeSlots.length} créneau(x)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slots or session-level signature */}
      {timeSlots.length > 0 ? (
        timeSlots.map((slot, index) =>
          renderSlotSection(
            slot.id,
            `Créneau ${index + 1}${slot.title ? ` : ${slot.title}` : ""}`,
            `${new Date(slot.start_time).toLocaleDateString("fr-FR")} ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`
          )
        )
      ) : (
        renderSlotSection("session", "Signature de la session", null)
      )}
    </div>
  );
}
