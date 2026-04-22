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
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Clock,
  User,
  CheckCircle2,
  Loader2,
  PenLine,
  FileCheck,
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
  trainer: { first_name: string; last_name: string } | null;
}

interface TimeSlot {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  slot_order: number;
}

interface SlotSignState {
  signed: boolean;
  signature: { id: string; signature_data: string; signed_at: string } | null;
}

export default function LearnerSignPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotStates, setSlotStates] = useState<Map<string, SlotSignState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [signingSlot, setSigningSlot] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get learner ID from profile
    const { data: learnerData } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    const lId = learnerData?.id || user.id;
    setLearnerId(lId);

    // Load session info
    const { data: sessionData } = await supabase
      .from("sessions")
      .select(
        "id, title, start_date, end_date, location, mode, status, duration_hours, training:trainings(title), trainer:trainers(first_name, last_name)"
      )
      .eq("id", sessionId)
      .single();

    if (sessionData) {
      setSession({
        ...sessionData,
        training: Array.isArray(sessionData.training)
          ? sessionData.training[0] || null
          : sessionData.training,
        trainer: Array.isArray(sessionData.trainer)
          ? sessionData.trainer[0] || null
          : sessionData.trainer,
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

    // Load all learner signatures for this session
    const { data: allSigs } = await supabase
      .from("signatures")
      .select("id, signature_data, signed_at, time_slot_id")
      .eq("session_id", sessionId)
      .eq("signer_id", lId)
      .eq("signer_type", "learner");

    // Build state
    const stateMap = new Map<string, SlotSignState>();

    if (slotList.length > 0) {
      for (const slot of slotList) {
        const sig = (allSigs || []).find(s => s.time_slot_id === slot.id);
        stateMap.set(slot.id, {
          signed: !!sig,
          signature: sig || null,
        });
      }
    } else {
      // Legacy: session-level
      const sig = (allSigs || []).find(s => !s.time_slot_id);
      stateMap.set("session", {
        signed: !!sig,
        signature: sig || null,
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

  const allSlotIds = timeSlots.length > 0 ? timeSlots.map(s => s.id) : ["session"];
  const signedCount = allSlotIds.filter(id => slotStates.get(id)?.signed).length;
  const totalSlots = allSlotIds.length;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Signature de présence</h1>
          <p className="text-sm text-gray-500">
            Validez votre présence et vos heures de formation
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
        <CardContent className="space-y-3">
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
            {session.trainer && (
              <div className="flex items-center gap-2 text-gray-600">
                <User className="h-4 w-4" />
                <span>{session.trainer.first_name} {session.trainer.last_name}</span>
              </div>
            )}
            {session.duration_hours && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{session.duration_hours}h de formation</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {signedCount}/{totalSlots} créneau(x) signé(s)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Signature per slot */}
      {timeSlots.length > 0 ? (
        timeSlots.map((slot, index) => {
          const state = slotStates.get(slot.id);
          const isSigned = state?.signed || false;
          const sig = state?.signature;

          return (
            <Card key={slot.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {isSigned ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <PenLine className="h-4 w-4 text-blue-600" />
                    )}
                    Créneau {index + 1}{slot.title ? ` : ${slot.title}` : ""}
                  </CardTitle>
                  {isSigned && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Signé</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(slot.start_time).toLocaleDateString("fr-FR")}{" "}
                  {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                </p>
              </CardHeader>
              <CardContent>
                {isSigned && sig ? (
                  <div className="space-y-2">
                    <div className="border-2 border-green-400 rounded-lg bg-green-50 p-3">
                      <div
                        className="w-full h-20 flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: sig.signature_data }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileCheck className="h-4 w-4 text-green-600" />
                      <span>Signé le {formatDate(sig.signed_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <SignaturePad
                      label="Dessinez votre signature"
                      isSigned={false}
                      onSign={(svg) => handleSign(svg, slot.id)}
                      onClear={() => {}}
                      disabled={signingSlot === slot.id}
                    />
                    {signingSlot === slot.id && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      ) : (
        // Legacy: single session signature
        (() => {
          const state = slotStates.get("session");
          const isSigned = state?.signed || false;
          const sig = state?.signature;

          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isSigned ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <PenLine className="h-5 w-5 text-blue-600" />
                  )}
                  {isSigned ? "Présence validée" : "Apposer votre signature"}
                </CardTitle>
                <CardDescription>
                  {isSigned
                    ? "Votre signature a été enregistrée."
                    : "Dessinez votre signature pour valider votre présence."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isSigned && sig ? (
                  <div className="space-y-4">
                    <div className="border-2 border-green-400 rounded-lg bg-green-50 p-4">
                      <div
                        className="w-full h-32 flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: sig.signature_data }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileCheck className="h-4 w-4 text-green-600" />
                      <span>Signé le {formatDate(sig.signed_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <SignaturePad
                      label="Dessinez votre signature ci-dessous"
                      isSigned={false}
                      onSign={(svg) => handleSign(svg, "session")}
                      onClear={() => {}}
                      disabled={signingSlot === "session"}
                    />
                    {signingSlot === "session" && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
                      </div>
                    )}
                    <p className="text-xs text-gray-400 italic">
                      En signant, vous confirmez votre présence et validez les heures
                      de formation conformément au planning de cette session.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
}
