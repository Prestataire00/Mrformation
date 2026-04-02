"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, Profile } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeManager({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [selectedManager, setSelectedManager] = useState(formation.manager_id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAdmins = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("entity_id", formation.entity_id)
        .eq("role", "admin")
        .eq("is_active", true);
      if (data) setAdmins(data as Profile[]);
    };
    fetchAdmins();
  }, [formation.entity_id, supabase]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ manager_id: selectedManager || null })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Manager mis à jour" });
      onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Manager</h3>
      <div className="flex items-center gap-3">
        <Select value={selectedManager} onValueChange={setSelectedManager}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Attribuer un Manager" />
          </SelectTrigger>
          <SelectContent>
            {admins.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.first_name} {a.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          Attribuer
        </Button>
      </div>
    </div>
  );
}
