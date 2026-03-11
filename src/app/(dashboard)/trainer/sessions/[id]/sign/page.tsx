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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

interface LearnerSignatureStatus {
  learner_id: string;
  first_name: string;
  last_name: string;
  signed: boolean;
  signed_at: string | null;
}

interface ExistingSignature {
  id: string;
  signature_data: string;
  signed_at: string;
}

export default function TrainerSignPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [trainerSignature, setTrainerSignature] = useState<ExistingSignature | null>(null);
  const [learnerStatuses, setLearnerStatuses] = useState<LearnerSignatureStatus[]>([]);
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
        "id, title, start_date, end_date, location, mode, status, duration_hours, training:trainings(title)"
      )
      .eq("id", sessionId)
      .single();

    if (sessionData) {
      setSession({
        ...sessionData,
        training: Array.isArray(sessionData.training)
          ? sessionData.training[0] || null
          : sessionData.training,
      } as SessionInfo);
    }

    // Check trainer's own signature
    const { data: sigData } = await supabase
      .from("signatures")
      .select("id, signature_data, signed_at")
      .eq("session_id", sessionId)
      .eq("signer_id", user.id)
      .eq("signer_type", "trainer")
      .single();

    if (sigData) {
      setTrainerSignature(sigData);
      setIsSigned(true);
    }

    // Load learner enrollment + signature status
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("learner_id, learner:learners(first_name, last_name, profile_id)")
      .eq("session_id", sessionId)
      .eq("status", "active");

    const { data: allSigs } = await supabase
      .from("signatures")
      .select("signer_id, signed_at")
      .eq("session_id", sessionId)
      .eq("signer_type", "learner");

    if (enrollments) {
      const statuses: LearnerSignatureStatus[] = enrollments.map((e: any) => {
        const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
        const profileId = learner?.profile_id;
        const sig = allSigs?.find((s: any) => s.signer_id === profileId);
        return {
          learner_id: e.learner_id,
          first_name: learner?.first_name || "",
          last_name: learner?.last_name || "",
          signed: !!sig,
          signed_at: sig?.signed_at || null,
        };
      });
      setLearnerStatuses(statuses);
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
      setTrainerSignature(result.signature);
      toast({
        title: "Signature enregistrée",
        description: "Votre signature vaut validation des heures de formation dispensées.",
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

  const signedCount = learnerStatuses.filter((l) => l.signed).length;
  const totalLearners = learnerStatuses.length;

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
            {session.duration_hours && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{session.duration_hours}h de formation</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="h-4 w-4" />
              <span>{totalLearners} apprenant(s)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Learner signatures overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Signatures des apprenants ({signedCount}/{totalLearners})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalLearners === 0 ? (
            <p className="text-sm text-gray-400">Aucun apprenant inscrit.</p>
          ) : (
            <div className="space-y-2">
              {learnerStatuses.map((l) => (
                <div
                  key={l.learner_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(`${l.first_name} ${l.last_name}`)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {l.first_name} {l.last_name}
                    </span>
                  </div>
                  {l.signed ? (
                    <Badge className="bg-green-100 text-green-700 border-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Signé
                      {l.signed_at && ` le ${formatDate(l.signed_at)}`}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      Non signé
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trainer signature section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            {isSigned ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <PenLine className="h-5 w-5 text-blue-600" />
            )}
            {isSigned ? "Heures validées" : "Apposer votre signature"}
          </CardTitle>
          <CardDescription>
            {isSigned
              ? "Votre signature a été enregistrée et vaut validation des heures de formation dispensées."
              : "Votre signature vaudra validation des heures de formation dispensées, en conformité avec le planning de la session."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSigned && trainerSignature ? (
            <div className="space-y-4">
              <div className="border-2 border-green-400 rounded-lg bg-green-50 p-4">
                <div
                  className="w-full h-32 flex items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: trainerSignature.signature_data,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileCheck className="h-4 w-4 text-green-600" />
                <span>
                  Signé le {formatDate(trainerSignature.signed_at)}
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
                En signant, vous confirmez avoir dispensé les heures de
                formation conformément au planning de cette session.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
