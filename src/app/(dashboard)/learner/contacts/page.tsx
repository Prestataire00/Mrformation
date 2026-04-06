"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Mail,
  Phone,
  User,
  Loader2,
  Building2,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface TrainerContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  session_titles: string[];
}

interface EntityContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

function getInitials(first: string, last: string): string {
  return `${(first || "")[0] || ""}${(last || "")[0] || ""}`.toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */
export default function LearnerContactsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainerContact[]>([]);
  const [entity, setEntity] = useState<EntityContact | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: learner } = await supabase
      .from("learners")
      .select("id, entity_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!learner) { setLoading(false); return; }

    // Fetch enrollments with session & trainer info
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(`
        sessions(
          title,
          trainers(id, first_name, last_name, email, phone, bio)
        )
      `)
      .eq("learner_id", learner.id)
      .neq("status", "cancelled");

    // Deduplicate trainers and collect associated sessions
    const trainerMap = new Map<string, TrainerContact>();
    if (enrollments) {
      for (const e of enrollments as any[]) {
        const s = e.sessions;
        if (!s?.trainers) continue;
        const t = s.trainers;
        const existing = trainerMap.get(t.id);
        if (existing) {
          if (s.title && !existing.session_titles.includes(s.title)) {
            existing.session_titles.push(s.title);
          }
        } else {
          trainerMap.set(t.id, {
            id: t.id,
            first_name: t.first_name,
            last_name: t.last_name,
            email: t.email,
            phone: t.phone,
            bio: t.bio,
            session_titles: s.title ? [s.title] : [],
          });
        }
      }
    }
    setTrainers(Array.from(trainerMap.values()));

    // Fetch entity info
    if (learner.entity_id) {
      const { data: entityData } = await supabase
        .from("entities")
        .select("id, name, email, phone, address")
        .eq("id", learner.entity_id)
        .single();

      if (entityData) {
        setEntity(entityData as EntityContact);
      }
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#DC2626] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/learner" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Contacts</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <p className="text-sm text-gray-500 mt-1">Retrouvez les coordonnées de vos formateurs et de votre organisme de formation.</p>
      </div>

      {/* Entity / Organization */}
      {entity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#DC2626]" />
              Organisme de formation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#DC2626]/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-[#DC2626]" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-gray-900">{entity.name}</p>
                {entity.email && (
                  <a href={`mailto:${entity.email}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#DC2626] transition-colors">
                    <Mail className="h-3.5 w-3.5" />{entity.email}
                  </a>
                )}
                {entity.phone && (
                  <a href={`tel:${entity.phone}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#DC2626] transition-colors">
                    <Phone className="h-3.5 w-3.5" />{entity.phone}
                  </a>
                )}
                {entity.address && (
                  <p className="flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />{entity.address}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trainers */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-[#DC2626]" />
          Mes formateurs
        </h2>

        {trainers.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucun formateur</p>
                <p className="text-sm text-gray-400 mt-1">Vous n&apos;avez pas encore de formateur assigné.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {trainers.map((trainer) => (
              <Card key={trainer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="bg-[#DC2626]/10 text-[#DC2626] font-bold text-lg">
                        {getInitials(trainer.first_name, trainer.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {trainer.first_name} {trainer.last_name}
                        </p>
                        <p className="text-xs text-gray-400">Formateur</p>
                      </div>

                      {trainer.bio && (
                        <p className="text-xs text-gray-500 line-clamp-2">{trainer.bio}</p>
                      )}

                      <div className="space-y-1">
                        <a
                          href={`mailto:${trainer.email}`}
                          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#DC2626] transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{trainer.email}</span>
                        </a>
                        {trainer.phone && (
                          <a
                            href={`tel:${trainer.phone}`}
                            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#DC2626] transition-colors"
                          >
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {trainer.phone}
                          </a>
                        )}
                      </div>

                      {trainer.session_titles.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Sessions</p>
                          <div className="flex flex-wrap gap-1">
                            {trainer.session_titles.map((title, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                              >
                                {title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
