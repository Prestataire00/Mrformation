"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import { formatDate } from "@/lib/utils";
import {
  CalendarDays,
  MapPin,
  CheckCircle2,
  Loader2,
  PenLine,
  AlertCircle,
  User,
  FileSignature,
  Clock,
} from "lucide-react";

interface SessionInfo {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  training_title: string | null;
}

interface TimeSlotInfo {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
}

interface PersonInfo {
  id: string;
  first_name: string;
  last_name: string;
  already_signed: boolean;
}

interface TokenData {
  token_type: "session" | "individual";
  signer_type?: "learner" | "trainer";
  session: SessionInfo;
  time_slot?: TimeSlotInfo | null;
  learners?: PersonInfo[];
  learner?: PersonInfo | null;
  trainer?: PersonInfo | null;
}

function formatTimeFr(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

function formatSlotDateFr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

export default function EmargementPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TokenData | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signedName, setSignedName] = useState("");

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/emargement?token=${token}`);
        const result = await res.json();

        if (!res.ok) {
          setError(result.error || "Lien invalide");
          setLoading(false);
          return;
        }

        setData(result);

        // For individual learner tokens, auto-select
        if (result.token_type === "individual" && result.signer_type !== "trainer" && result.learner) {
          if (result.learner.already_signed) {
            setSignedName(`${result.learner.first_name} ${result.learner.last_name}`);
            setSigned(true);
          } else {
            setSelectedPersonId(result.learner.id);
          }
        }

        // For individual trainer tokens, auto-select
        if (result.token_type === "individual" && result.signer_type === "trainer" && result.trainer) {
          if (result.trainer.already_signed) {
            setSignedName(`${result.trainer.first_name} ${result.trainer.last_name}`);
            setSigned(true);
          } else {
            setSelectedPersonId(result.trainer.id);
          }
        }
      } catch {
        setError("Impossible de valider le lien");
      }
      setLoading(false);
    }
    validate();
  }, [token]);

  async function handleSign(svgData: string) {
    if (!selectedPersonId) return;
    setSigning(true);
    setError(null);

    try {
      const res = await fetch("/api/emargement/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signature_data: svgData,
          learner_id: data?.token_type === "session" ? selectedPersonId : undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Erreur lors de la signature");
        setSigning(false);
        return;
      }

      // Find the signer name
      let name = "";
      if (data?.signer_type === "trainer" && data.trainer) {
        name = `${data.trainer.first_name} ${data.trainer.last_name}`;
      } else if (data?.token_type === "individual" && data.learner) {
        name = `${data.learner.first_name} ${data.learner.last_name}`;
      } else if (data?.learners) {
        const l = data.learners.find((l) => l.id === selectedPersonId);
        if (l) name = `${l.first_name} ${l.last_name}`;
      }

      setSignedName(name);
      setSigned(true);
    } catch {
      setError("Une erreur est survenue");
    }
    setSigning(false);
  }

  // Time slot display helper
  const slotLabel = data?.time_slot
    ? `${formatTimeFr(data.time_slot.start_time)} → ${formatTimeFr(data.time_slot.end_time)}, ${formatSlotDateFr(data.time_slot.start_time)}`
    : null;

  // Loading
  if (loading) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </CardContent>
      </Card>
    );
  }

  // Error (no data)
  if (error && !data) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="py-16 flex flex-col items-center gap-3">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="font-semibold text-gray-800 text-lg">Lien invalide</p>
          <p className="text-sm text-gray-500 text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Signed confirmation
  if (signed) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="py-16 flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-900 text-xl">Signature enregistrée</p>
            {signedName && (
              <p className="text-sm text-gray-600 mt-1">Merci {signedName}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {slotLabel ? (
                <>
                  Votre présence au créneau <span className="font-medium">{slotLabel}</span> a été validée.
                </>
              ) : (
                <>
                  Votre présence à la session{" "}
                  <span className="font-medium">{data?.session.title}</span>{" "}
                  a été validée.
                </>
              )}
            </p>
          </div>
          {data?.session && (
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(data.session.start_date)}
              {data.session.location && (
                <>
                  <span className="mx-1">&bull;</span>
                  <MapPin className="h-3.5 w-3.5" />
                  {data.session.location}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isTrainerToken = data.signer_type === "trainer";
  const selectedPerson = isTrainerToken
    ? data.trainer
    : data.token_type === "individual"
    ? data.learner
    : data.learners?.find((l) => l.id === selectedPersonId);

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
          <FileSignature className="h-6 w-6 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Émargement</h1>
        <p className="text-sm text-gray-500">Signez pour valider votre présence</p>
      </div>

      {/* Session info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{data.session.title}</CardTitle>
          {data.session.training_title && (
            <CardDescription>{data.session.training_title}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {formatDate(data.session.start_date)}
              {data.session.end_date &&
                ` \u2192 ${formatDate(data.session.end_date)}`}
            </div>
            {data.session.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {data.session.location}
              </div>
            )}
            <Badge variant="outline" className="text-xs">
              {data.session.mode === "presentiel"
                ? "Présentiel"
                : data.session.mode === "distanciel"
                ? "Distanciel"
                : "Hybride"}
            </Badge>
          </div>

          {/* Time slot info */}
          {data.time_slot && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                Créneau : {formatTimeFr(data.time_slot.start_time)} → {formatTimeFr(data.time_slot.end_time)}
              </span>
              <span className="text-xs text-blue-600">
                ({formatSlotDateFr(data.time_slot.start_time)})
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Learner selection (session token) */}
      {data.token_type === "session" && data.learners && !selectedPersonId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Sélectionnez votre nom
            </CardTitle>
            <CardDescription>
              Choisissez votre nom dans la liste pour signer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.learners.map((learner) => (
              <button
                key={learner.id}
                disabled={learner.already_signed}
                onClick={() => {
                  setError(null);
                  setSelectedPersonId(learner.id);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                  learner.already_signed
                    ? "bg-green-50 border-green-200 cursor-not-allowed opacity-60"
                    : "hover:bg-blue-50 hover:border-blue-300 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">
                    {learner.first_name.charAt(0)}
                    {learner.last_name.charAt(0)}
                  </div>
                  <span className="font-medium text-gray-900">
                    {learner.first_name} {learner.last_name}
                  </span>
                </div>
                {learner.already_signed && (
                  <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Déjà signé
                  </Badge>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Signature pad */}
      {selectedPersonId &&
        selectedPerson &&
        !selectedPerson.already_signed && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" />
                Signature de {selectedPerson.first_name}{" "}
                {selectedPerson.last_name}
              </CardTitle>
              <CardDescription>
                Dessinez votre signature pour valider votre présence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.token_type === "session" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500"
                  onClick={() => {
                    setSelectedPersonId(null);
                    setError(null);
                  }}
                >
                  &larr; Changer de nom
                </Button>
              )}

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
                  Enregistrement...
                </div>
              )}

              <p className="text-xs text-gray-400 italic">
                En signant, vous confirmez votre présence et validez les heures
                de formation conformément au planning de cette session.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
