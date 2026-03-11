"use client";

import { useEffect, useState } from "react";
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

interface ExistingSignature {
  id: string;
  signature_data: string;
  signed_at: string;
}

export default function LearnerSignPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [existingSignature, setExistingSignature] = useState<ExistingSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function loadData() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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

    // Check existing signature
    const { data: sigData } = await supabase
      .from("signatures")
      .select("id, signature_data, signed_at")
      .eq("session_id", sessionId)
      .eq("signer_id", user.id)
      .eq("signer_type", "learner")
      .single();

    if (sigData) {
      setExistingSignature(sigData);
      setIsSigned(true);
    }

    setLoading(false);
  }

  async function handleSign(svgData: string) {
    setSigning(true);
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          signature_data: svgData,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: result.error || "Impossible de sauvegarder la signature.",
          variant: "destructive",
        });
        setSigning(false);
        return;
      }

      setIsSigned(true);
      setExistingSignature(result.signature);
      toast({
        title: "Signature enregistrée",
        description: "Votre signature vaut validation des heures de formation réalisées.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue.",
        variant: "destructive",
      });
    }
    setSigning(false);
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
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    );
  }

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
                <span>
                  {session.trainer.first_name} {session.trainer.last_name}
                </span>
              </div>
            )}
            {session.duration_hours && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{session.duration_hours}h de formation</span>
              </div>
            )}
          </div>

          <Badge
            variant="outline"
            className={
              session.status === "in_progress"
                ? "border-green-300 text-green-700 bg-green-50"
                : session.status === "completed"
                ? "border-blue-300 text-blue-700 bg-blue-50"
                : "border-yellow-300 text-yellow-700 bg-yellow-50"
            }
          >
            {session.status === "in_progress"
              ? "En cours"
              : session.status === "completed"
              ? "Terminée"
              : "À venir"}
          </Badge>
        </CardContent>
      </Card>

      {/* Signature section */}
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
              ? "Votre signature a été enregistrée et vaut validation des heures de formation réalisées."
              : "Votre signature vaudra validation des heures de formation réalisées, en conformité avec le planning de la session."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSigned && existingSignature ? (
            <div className="space-y-4">
              <div className="border-2 border-green-400 rounded-lg bg-green-50 p-4">
                <div
                  className="w-full h-32 flex items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: existingSignature.signature_data,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileCheck className="h-4 w-4 text-green-600" />
                <span>
                  Signé le {formatDate(existingSignature.signed_at)}
                  {session.duration_hours &&
                    ` — ${session.duration_hours}h validées`}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <SignaturePad
                label="Dessinez votre signature ci-dessous"
                isSigned={false}
                onSign={handleSign}
                onClear={() => {}}
                disabled={signing}
              />
              {signing && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement de votre signature...
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
    </div>
  );
}
