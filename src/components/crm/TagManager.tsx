"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Plus, X, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CrmTag } from "@/lib/types";

const TAG_COLORS = [
  "#DC2626", "#2563EB", "#7C3AED", "#22c55e", "#f97316",
  "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16",
];

interface TagManagerProps {
  /** Type of entity: "prospect" or "client" */
  entityType: "prospect" | "client";
  /** ID of the prospect or client */
  entityRecordId: string;
  /** Currently assigned tag IDs */
  selectedTagIds: string[];
  /** Callback when tags change */
  onTagsChange: (tagIds: string[]) => void;
  /** Whether to show inline (compact) or full mode */
  compact?: boolean;
}

export function TagManager({
  entityType,
  entityRecordId,
  selectedTagIds,
  onTagsChange,
  compact = false,
}: TagManagerProps) {
  const supabase = createClient();
  const { entityId } = useEntity();
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [creating, setCreating] = useState(false);

  const junctionTable = entityType === "prospect" ? "crm_prospect_tags" : "crm_client_tags";
  const fkColumn = entityType === "prospect" ? "prospect_id" : "client_id";

  const fetchTags = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("crm_tags")
      .select("*")
      .eq("entity_id", entityId)
      .order("name");
    setAllTags((data as CrmTag[]) ?? []);
  }, [entityId, supabase]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  async function handleCreateTag() {
    if (!newTagName.trim() || !entityId) return;
    setCreating(true);
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    const { data, error } = await supabase
      .from("crm_tags")
      .insert({ entity_id: entityId, name: newTagName.trim(), color })
      .select()
      .single();

    if (!error && data) {
      setAllTags((prev) => [...prev, data as CrmTag]);
      // Auto-select the new tag
      await toggleTag((data as CrmTag).id, true);
      setNewTagName("");
      setShowInput(false);
    }
    setCreating(false);
  }

  async function toggleTag(tagId: string, forceAdd?: boolean) {
    const isSelected = selectedTagIds.includes(tagId);
    const shouldAdd = forceAdd !== undefined ? forceAdd : !isSelected;

    if (shouldAdd && !isSelected) {
      // Add junction
      await supabase.from(junctionTable).insert({ [fkColumn]: entityRecordId, tag_id: tagId });
      onTagsChange([...selectedTagIds, tagId]);
    } else if (!shouldAdd && isSelected) {
      // Remove junction
      await supabase.from(junctionTable).delete().eq(fkColumn, entityRecordId).eq("tag_id", tagId);
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    }
  }

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));
  const availableTags = allTags.filter((t) => !selectedTagIds.includes(t.id));

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            className="text-[10px] px-1.5 py-0 border-0 text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">
        <Tag className="inline h-3 w-3 mr-1" />
        Tags / Catégories
      </label>

      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5">
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            className="text-xs gap-1 pr-1 border-0 text-white cursor-pointer hover:opacity-80"
            style={{ backgroundColor: tag.color }}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
            <X className="h-3 w-3" />
          </Badge>
        ))}
      </div>

      {/* Available tags to add */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="text-xs cursor-pointer hover:bg-gray-100 gap-1"
              onClick={() => toggleTag(tag.id)}
            >
              <Plus className="h-3 w-3" />
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Create new tag */}
      {showInput ? (
        <div className="flex items-center gap-2">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nom du tag…"
            className="h-7 text-xs flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleCreateTag}
            disabled={creating || !newTagName.trim()}
            className="h-7 text-xs px-2"
          >
            {creating ? "…" : "Créer"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setShowInput(false); setNewTagName(""); }}
            className="h-7 text-xs px-2"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
        >
          <Plus className="h-3 w-3" />
          Nouveau tag
        </button>
      )}
    </div>
  );
}

/** Standalone read-only tag display */
export function TagBadges({ tags }: { tags: CrmTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          className="text-[10px] px-1.5 py-0 border-0 text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
