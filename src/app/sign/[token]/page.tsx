"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signatures/SignaturePad";

interface SignStatus {
  valid: boolean;
  expired: boolean;
  already_signed: boolean;
  signed_at: string | null;
  document_info: {
    type: string;
    label: string;
    session_title: string;
    start_date: string;
    end_date: string;
  } | null;
  signer_name: string | null;
  entity_name: string;
  entity_slug: string;
}

function formatDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function SignDocumentPage() {
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<SignStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`/api/documents/sign-status?token=${token}`);
        const data = await res.json();
        setStatus(data);
        if (data.already_signed) setSigned(true);
      } catch {
        setError("Impossible de vérifier le lien");
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, [token]);

  const handleSign = async () => {
    if (!signatureData || !accepted) return;
    setSigning(true);
    setError(null);

    try {
      const res = await fetch("/api/documents/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signature_data: signatureData,
          signer_name: status?.signer_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSigned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la signature");
    } finally {
      setSigning(false);
    }
  };

  const logoSrc = status?.entity_slug?.includes("c3v") ? "/logo-c3v-formation.png" : "/logo-mr-formation.png";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Already signed
  if (signed || status?.already_signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <img src={logoSrc} alt={status?.entity_name} className="h-12 mx-auto mb-4" />
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Document signé</h1>
          <p className="text-gray-600 mb-4">
            {status?.document_info?.label} pour la formation &quot;{status?.document_info?.session_title}&quot;
            a été signé avec succès.
          </p>
          {status?.signed_at && (
            <p className="text-sm text-gray-500">Signé le {formatDate(status.signed_at)}</p>
          )}
        </div>
      </div>
    );
  }

  // Expired or invalid
  if (!status?.valid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <img src={logoSrc} alt={status?.entity_name} className="h-12 mx-auto mb-4" />
          {status?.expired ? (
            <>
              <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Lien expiré</h1>
              <p className="text-gray-600">Ce lien de signature a expiré. Veuillez contacter l&apos;organisme de formation pour obtenir un nouveau lien.</p>
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Lien invalide</h1>
              <p className="text-gray-600">Ce lien de signature n&apos;est pas valide.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Valid — show document + signature pad
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logoSrc} alt={status.entity_name} className="h-8" />
          <span className="text-sm text-gray-500">{status.entity_name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Document info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Signature de document</h1>
          <p className="text-sm text-gray-500 mb-4">
            {status.signer_name && <span className="font-medium text-gray-700">{status.signer_name}</span>}
            {status.signer_name && " — "}
            {status.document_info?.label}
          </p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
            <p><span className="text-gray-500">Formation :</span> <strong>{status.document_info?.session_title}</strong></p>
            <p><span className="text-gray-500">Du</span> {formatDate(status.document_info?.start_date || "")} <span className="text-gray-500">au</span> {formatDate(status.document_info?.end_date || "")}</p>
            <p><span className="text-gray-500">Document :</span> {status.document_info?.label}</p>
          </div>
        </div>

        {/* Signature section */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Votre signature</h2>
          <p className="text-sm text-gray-500">Dessinez votre signature dans le cadre ci-dessous :</p>

          <SignaturePad
            label="Signature"
            isSigned={!!signatureData}
            onSign={(svg) => setSignatureData(svg)}
            onClear={() => setSignatureData(null)}
            disabled={signing}
          />

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Je certifie avoir lu et approuvé ce document. Je reconnais que cette signature électronique a la même valeur juridique qu&apos;une signature manuscrite.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleSign}
            disabled={!signatureData || !accepted || signing}
          >
            {signing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Signer le document
          </Button>

          <p className="text-xs text-gray-400 text-center">
            En signant, vous acceptez les conditions du document. Votre signature, adresse IP et horodatage seront enregistrés.
          </p>
        </div>
      </main>
    </div>
  );
}
