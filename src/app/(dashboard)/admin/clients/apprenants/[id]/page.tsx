"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import LearnerHeader from "./_components/LearnerHeader";
import TabOverview from "./_components/TabOverview";
import TabIdentite from "./_components/TabIdentite";
import TabParcours from "./_components/TabParcours";
import TabDocuments from "./_components/TabDocuments";
import TabAcces from "./_components/TabAcces";

// ─── Types ──────────────────────────────────────────────────────────

export interface LearnerFull {
  id: string;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_id: string | null;
  profile_id: string | null;
  job_title: string | null;
  birth_date: string | null;
  birth_city: string | null;
  gender: "M" | "F" | "autre" | null;
  nationality: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  social_security_number: string | null;
  education_level: string | null;
  learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null;
  created_at: string;
  avatar_url: string | null;
  clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

export interface SessionEnrollment {
  id: string;
  status: string;
  completion_rate: number;
  session: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    training: { title: string } | null;
  } | null;
}

export interface ElearningEnrollment {
  id: string;
  status: string;
  completion_rate: number;
  elearning_courses: {
    id: string;
    title: string;
    estimated_duration_minutes: number;
  } | null;
}

interface ClientOption {
  id: string;
  company_name: string;
}

// ─── Page Orchestrator ──────────────────────────────────────────────

export default function LearnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const learnerId = params.id as string;

  const [learner, setLearner] = useState<LearnerFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionEnrollment[]>([]);
  const [elearning, setElearning] = useState<ElearningEnrollment[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  // URL-synced tab
  const tab = searchParams.get("tab") ?? "overview";
  const setTab = (t: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (t === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", t);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "", { scroll: false });
  };

  // ─── Fetch ──────────────────────────────────────────────────────

  const fetchLearner = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("learners")
        .select(
          "id, entity_id, first_name, last_name, email, phone, client_id, profile_id, " +
          "job_title, birth_date, birth_city, gender, nationality, address, city, postal_code, " +
          "social_security_number, education_level, learner_type, loris_metadata, loris_external_id, " +
          "created_at, welcome_email_sent_at, " +
          "clients(company_name)"
        )
        .eq("id", learnerId)
        .eq("entity_id", entityId)
        .single();

      if (error || !data) {
        toast({ title: "Erreur", description: "Apprenant introuvable.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const l = data as unknown as LearnerFull;

      // Fetch avatar from profiles
      if (l.email) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("email", l.email)
          .maybeSingle();
        if (profileData?.avatar_url) l.avatar_url = profileData.avatar_url;
      }

      setLearner(l);

      // Client options for edit form
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, company_name")
        .eq("entity_id", entityId)
        .order("company_name");
      setClientOptions((clientsData as ClientOption[]) ?? []);

      // E-learning enrollments
      const { data: enrollData } = await supabase
        .from("elearning_enrollments")
        .select("id, status, completion_rate, elearning_courses(id, title, estimated_duration_minutes)")
        .eq("learner_id", learnerId);
      setElearning((enrollData as unknown as ElearningEnrollment[]) ?? []);

      // Session enrollments
      const { data: sessData } = await supabase
        .from("enrollments")
        .select("id, status, completion_rate, session:sessions!inner(id, title, start_date, end_date, training:trainings(title))")
        .eq("learner_id", learnerId)
        .neq("status", "cancelled");
      setSessions((sessData as unknown as SessionEnrollment[]) ?? []);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Chargement échoué",
        variant: "destructive",
      });
    }

    setLoading(false);
  }, [learnerId, entityId]);

  useEffect(() => {
    fetchLearner();
  }, [fetchLearner]);

  // ─── Save handler (passed to TabIdentite) ──────────────────────

  const handleSave = async (form: Record<string, string>) => {
    if (!learner || !entityId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("learners")
        .update({
          first_name: form.first_name?.trim() || learner.first_name,
          last_name: form.last_name?.trim() || learner.last_name,
          email: form.email?.trim() || learner.email,
          phone: form.phone?.trim() || null,
          client_id: form.client_id || null,
          job_title: form.job_title?.trim() || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          nationality: form.nationality?.trim() || null,
          address: form.address?.trim() || null,
          city: form.city?.trim() || null,
          postal_code: form.postal_code?.trim() || null,
          social_security_number: form.social_security_number?.trim() || null,
          education_level: form.education_level || null,
        })
        .eq("id", learner.id)
        .eq("entity_id", entityId);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Enregistré" });
        setEditing(false);
        await fetchLearner();
      }
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Sauvegarde échouée",
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  // ─── Loading / Not found ───────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[#374151] animate-spin" />
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Apprenant introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/clients/apprenants")}>
          Retour
        </Button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <LearnerHeader
        learner={learner}
        onRefresh={fetchLearner}
        onEditToggle={() => setEditing(!editing)}
        editing={editing}
      />

      <div className="px-6 py-6 max-w-7xl mx-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
            <TabsTrigger value="identite">Identit&eacute;</TabsTrigger>
            <TabsTrigger value="parcours">Parcours</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="acces">Acc&egrave;s</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <TabOverview learner={learner} sessions={sessions} elearning={elearning} />
          </TabsContent>

          <TabsContent value="identite">
            <TabIdentite
              learner={learner}
              editing={editing}
              onSave={handleSave}
              saving={saving}
              clientOptions={clientOptions}
            />
          </TabsContent>

          <TabsContent value="parcours">
            <TabParcours sessions={sessions} elearning={elearning} />
          </TabsContent>

          <TabsContent value="documents">
            <TabDocuments learner={learner} />
          </TabsContent>

          <TabsContent value="acces">
            <TabAcces learner={learner} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
