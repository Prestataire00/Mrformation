"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  entityType: "session" | "client" | "learner" | "trainer";
  entityId: string;
}

export function FavoriteStar({ entityType, entityId }: Props) {
  const supabase = createClient();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("user_favorites")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle()
      .then(({ data }) => {
        setIsFavorite(!!data);
        setLoading(false);
      });
  }, [entityType, entityId, supabase]);

  const toggle = async () => {
    if (isFavorite) {
      await supabase.from("user_favorites").delete().eq("entity_type", entityType).eq("entity_id", entityId);
      setIsFavorite(false);
    } else {
      await supabase.from("user_favorites").insert({ entity_type: entityType, entity_id: entityId });
      setIsFavorite(true);
    }
  };

  if (loading) return null;

  return (
    <Button variant="ghost" size="sm" onClick={toggle} className="h-8 w-8 p-0" aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
      <Star className={cn("h-4 w-4 transition-colors", isFavorite ? "fill-amber-400 text-amber-500" : "text-gray-300 hover:text-amber-400")} />
    </Button>
  );
}
