"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileText, Sparkles, FlaskConical, Package, AlertCircle, ClipboardList, ScrollText, Shield, Gavel, BookOpen, UserCog, MailOpen, Award, BadgeCheck, UserCheck, Trophy, BarChart3, GraduationCap, Camera, LogOut, TrendingUp, BookMarked, HardHat, Zap } from "lucide-react";

/**
 * Page de test temporaire — Story B-Convention.
 *
 * Permet de tester la génération de convention via la NOUVELLE infra
 * (Puppeteer + cache + template `[%xxx%]`) sans toucher l'ancien flow
 * TabConventionDocs. Une fois la story validée, cette page peut être
 * supprimée (en Lot E) car le bouton sera intégré dans TabConventionDocs.
 */

interface SessionRow {
  id: string;
  title: string;
  start_date: string;
}

interface CompanyRow {
  client_id: string;
  client: { id: string; company_name: string } | null;
}

interface TrainerRow {
  trainer_id: string;
  trainer: { id: string; first_name: string; last_name: string } | null;
}

interface LearnerRow {
  learner_id: string;
  learner: { id: string; first_name: string; last_name: string } | null;
}

export default function TestConventionPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedBatchSessionId, setSelectedBatchSessionId] = useState<string>("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [lastResult, setLastResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<{
    totalCompanies: number;
    successCount: number;
    failureCount: number;
    errors: { clientId: string; companyName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Émargement collectif (état séparé) ────────────────────────────────
  const [emargementSessionId, setEmargementSessionId] = useState<string>("");
  const [emargementClientId, setEmargementClientId] = useState<string>("");
  const [emargementCompanies, setEmargementCompanies] = useState<CompanyRow[]>([]);
  const [loadingEmargementCompanies, setLoadingEmargementCompanies] = useState(false);
  const [emargementBatchSessionId, setEmargementBatchSessionId] = useState<string>("");
  const [generatingEmargement, setGeneratingEmargement] = useState(false);
  const [generatingEmargementBatch, setGeneratingEmargementBatch] = useState(false);
  const [lastEmargementResult, setLastEmargementResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    signedCount?: number;
  } | null>(null);
  const [lastEmargementBatchResult, setLastEmargementBatchResult] = useState<{
    totalCompanies: number;
    successCount: number;
    failureCount: number;
    errors: { clientId: string; companyName: string; error: string }[];
    totalLatencyMs: number;
    signedCount?: number;
  } | null>(null);

  // ── CGV (entity-only, pas de session/client) ─────────────────────────
  const [generatingCgv, setGeneratingCgv] = useState(false);
  const [lastCgvResult, setLastCgvResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── RGPD (entity-only, pas de session/client) ────────────────────────
  const [generatingRgpd, setGeneratingRgpd] = useState(false);
  const [lastRgpdResult, setLastRgpdResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── Règlement Intérieur (entity-only) ────────────────────────────────
  const [generatingRi, setGeneratingRi] = useState(false);
  const [lastRiResult, setLastRiResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── Programme de formation (session-level) ───────────────────────────
  const [programmeSessionId, setProgrammeSessionId] = useState<string>("");
  const [generatingProgramme, setGeneratingProgramme] = useState(false);
  const [lastProgrammeResult, setLastProgrammeResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── Avis Habilitation Électrique (per session+learner, OPTIONNEL) ───
  const [habilSessionId, setHabilSessionId] = useState<string>("");
  const [habilLearnerId, setHabilLearnerId] = useState<string>("");
  const [habilLearners, setHabilLearners] = useState<LearnerRow[]>([]);
  const [loadingHabilLearners, setLoadingHabilLearners] = useState(false);
  const [habilBatchSessionId, setHabilBatchSessionId] = useState<string>("");
  const [generatingHabil, setGeneratingHabil] = useState(false);
  const [generatingHabilBatch, setGeneratingHabilBatch] = useState(false);
  const [lastHabilResult, setLastHabilResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastHabilBatchResult, setLastHabilBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Attestation d'abandon de formation (per session+learner, OPTIONNEL) ─
  const [abandonSessionId, setAbandonSessionId] = useState<string>("");
  const [abandonLearnerId, setAbandonLearnerId] = useState<string>("");
  const [abandonLearners, setAbandonLearners] = useState<LearnerRow[]>([]);
  const [loadingAbandonLearners, setLoadingAbandonLearners] = useState(false);
  const [abandonBatchSessionId, setAbandonBatchSessionId] = useState<string>("");
  const [generatingAbandon, setGeneratingAbandon] = useState(false);
  const [generatingAbandonBatch, setGeneratingAbandonBatch] = useState(false);
  const [lastAbandonResult, setLastAbandonResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastAbandonBatchResult, setLastAbandonBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Avis Habilitation Électrique BF-HF (Non électrique, OPTIONNEL) ──
  const [habilBfHfSessionId, setHabilBfHfSessionId] = useState<string>("");
  const [habilBfHfLearnerId, setHabilBfHfLearnerId] = useState<string>("");
  const [habilBfHfLearners, setHabilBfHfLearners] = useState<LearnerRow[]>([]);
  const [loadingHabilBfHfLearners, setLoadingHabilBfHfLearners] = useState(false);
  const [habilBfHfBatchSessionId, setHabilBfHfBatchSessionId] = useState<string>("");
  const [generatingHabilBfHf, setGeneratingHabilBfHf] = useState(false);
  const [generatingHabilBfHfBatch, setGeneratingHabilBfHfBatch] = useState(false);
  const [lastHabilBfHfResult, setLastHabilBfHfResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastHabilBfHfBatchResult, setLastHabilBfHfBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Certificat Travail en Hauteur (per session+learner, OPTIONNEL) ───
  const [hauteurSessionId, setHauteurSessionId] = useState<string>("");
  const [hauteurLearnerId, setHauteurLearnerId] = useState<string>("");
  const [hauteurLearners, setHauteurLearners] = useState<LearnerRow[]>([]);
  const [loadingHauteurLearners, setLoadingHauteurLearners] = useState(false);
  const [hauteurBatchSessionId, setHauteurBatchSessionId] = useState<string>("");
  const [generatingHauteur, setGeneratingHauteur] = useState(false);
  const [generatingHauteurBatch, setGeneratingHauteurBatch] = useState(false);
  const [lastHauteurResult, setLastHauteurResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastHauteurBatchResult, setLastHauteurBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Avis Habilitation Électrique BT (variante INITIAL BT, OPTIONNEL) ─
  const [habilBtSessionId, setHabilBtSessionId] = useState<string>("");
  const [habilBtLearnerId, setHabilBtLearnerId] = useState<string>("");
  const [habilBtLearners, setHabilBtLearners] = useState<LearnerRow[]>([]);
  const [loadingHabilBtLearners, setLoadingHabilBtLearners] = useState(false);
  const [habilBtBatchSessionId, setHabilBtBatchSessionId] = useState<string>("");
  const [generatingHabilBt, setGeneratingHabilBt] = useState(false);
  const [generatingHabilBtBatch, setGeneratingHabilBtBatch] = useState(false);
  const [lastHabilBtResult, setLastHabilBtResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastHabilBtBatchResult, setLastHabilBtBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Bilan de fin de POE (per session+learner, OPTIONNEL) ────────────
  const [bilanPoeSessionId, setBilanPoeSessionId] = useState<string>("");
  const [bilanPoeLearnerId, setBilanPoeLearnerId] = useState<string>("");
  const [bilanPoeLearners, setBilanPoeLearners] = useState<LearnerRow[]>([]);
  const [loadingBilanPoeLearners, setLoadingBilanPoeLearners] = useState(false);
  const [bilanPoeBatchSessionId, setBilanPoeBatchSessionId] = useState<string>("");
  const [generatingBilanPoe, setGeneratingBilanPoe] = useState(false);
  const [generatingBilanPoeBatch, setGeneratingBilanPoeBatch] = useState(false);
  const [lastBilanPoeResult, setLastBilanPoeResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastBilanPoeBatchResult, setLastBilanPoeBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
    signedCount?: number;
  } | null>(null);

  // ── Attestation AIPR (per session+learner, OPTIONNEL) ───────────────
  const [aiprSessionId, setAiprSessionId] = useState<string>("");
  const [aiprLearnerId, setAiprLearnerId] = useState<string>("");
  const [aiprLearners, setAiprLearners] = useState<LearnerRow[]>([]);
  const [loadingAiprLearners, setLoadingAiprLearners] = useState(false);
  const [aiprBatchSessionId, setAiprBatchSessionId] = useState<string>("");
  const [generatingAipr, setGeneratingAipr] = useState(false);
  const [generatingAiprBatch, setGeneratingAiprBatch] = useState(false);
  const [lastAiprResult, setLastAiprResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastAiprBatchResult, setLastAiprBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Charte formateur (per TRAINER, pas session, OPTIONNEL) ──────────
  const [charteTrainerId, setCharteTrainerId] = useState<string>("");
  const [allTrainers, setAllTrainers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [loadingAllTrainers, setLoadingAllTrainers] = useState(false);
  const [generatingCharte, setGeneratingCharte] = useState(false);
  const [generatingCharteBatch, setGeneratingCharteBatch] = useState(false);
  const [lastCharteResult, setLastCharteResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastCharteBatchResult, setLastCharteBatchResult] = useState<{
    totalTrainers: number;
    successCount: number;
    failureCount: number;
    errors: { trainerId: string; trainerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Réponses satisfaction (per SESSION, OPTIONNEL — pas de batch) ────
  const [satRepSessionId, setSatRepSessionId] = useState<string>("");
  const [generatingSatRep, setGeneratingSatRep] = useState(false);
  const [lastSatRepResult, setLastSatRepResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    qualiopi?: {
      totalLearners: number;
      completionRate: number;
      satisfactionRate: number | null;
      acquisitionRate: number | null;
    };
  } | null>(null);

  // ── Décharge responsabilité (per session+learner, OPTIONNEL) ─────────
  const [dechSessionId, setDechSessionId] = useState<string>("");
  const [dechLearnerId, setDechLearnerId] = useState<string>("");
  const [dechLearners, setDechLearners] = useState<LearnerRow[]>([]);
  const [loadingDechLearners, setLoadingDechLearners] = useState(false);
  const [dechBatchSessionId, setDechBatchSessionId] = useState<string>("");
  const [generatingDech, setGeneratingDech] = useState(false);
  const [generatingDechBatch, setGeneratingDechBatch] = useState(false);
  const [lastDechResult, setLastDechResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastDechBatchResult, setLastDechBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Autorisation image (per session+learner, OPTIONNEL) ─────────────
  const [autoImgSessionId, setAutoImgSessionId] = useState<string>("");
  const [autoImgLearnerId, setAutoImgLearnerId] = useState<string>("");
  const [autoImgLearners, setAutoImgLearners] = useState<LearnerRow[]>([]);
  const [loadingAutoImgLearners, setLoadingAutoImgLearners] = useState(false);
  const [autoImgBatchSessionId, setAutoImgBatchSessionId] = useState<string>("");
  const [generatingAutoImg, setGeneratingAutoImg] = useState(false);
  const [generatingAutoImgBatch, setGeneratingAutoImgBatch] = useState(false);
  const [lastAutoImgResult, setLastAutoImgResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastAutoImgBatchResult, setLastAutoImgBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Attestation compétences (per session+learner, OPTIONNEL) ─────────
  const [attCompSessionId, setAttCompSessionId] = useState<string>("");
  const [attCompLearnerId, setAttCompLearnerId] = useState<string>("");
  const [attCompLearners, setAttCompLearners] = useState<LearnerRow[]>([]);
  const [loadingAttCompLearners, setLoadingAttCompLearners] = useState(false);
  const [attCompBatchSessionId, setAttCompBatchSessionId] = useState<string>("");
  const [generatingAttComp, setGeneratingAttComp] = useState(false);
  const [generatingAttCompBatch, setGeneratingAttCompBatch] = useState(false);
  const [lastAttCompResult, setLastAttCompResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastAttCompBatchResult, setLastAttCompBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Résultats évaluations (per session+learner, OPTIONNEL) ───────────
  const [evalResSessionId, setEvalResSessionId] = useState<string>("");
  const [evalResLearnerId, setEvalResLearnerId] = useState<string>("");
  const [evalResLearners, setEvalResLearners] = useState<LearnerRow[]>([]);
  const [loadingEvalResLearners, setLoadingEvalResLearners] = useState(false);
  const [evalResBatchSessionId, setEvalResBatchSessionId] = useState<string>("");
  const [generatingEvalRes, setGeneratingEvalRes] = useState(false);
  const [generatingEvalResBatch, setGeneratingEvalResBatch] = useState(false);
  const [lastEvalResResult, setLastEvalResResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    evaluationsCount?: number;
  } | null>(null);
  const [lastEvalResBatchResult, setLastEvalResBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Certificat diplôme (per session+learner) ─────────────────────────
  const [diplomeSessionId, setDiplomeSessionId] = useState<string>("");
  const [diplomeLearnerId, setDiplomeLearnerId] = useState<string>("");
  const [diplomeLearners, setDiplomeLearners] = useState<LearnerRow[]>([]);
  const [loadingDiplomeLearners, setLoadingDiplomeLearners] = useState(false);
  const [diplomeBatchSessionId, setDiplomeBatchSessionId] = useState<string>("");
  const [generatingDiplome, setGeneratingDiplome] = useState(false);
  const [generatingDiplomeBatch, setGeneratingDiplomeBatch] = useState(false);
  const [lastDiplomeResult, setLastDiplomeResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    certificateCode?: string;
  } | null>(null);
  const [lastDiplomeBatchResult, setLastDiplomeBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Émargement individuel (per session+learner) ──────────────────────
  const [emargIndivSessionId, setEmargIndivSessionId] = useState<string>("");
  const [emargIndivLearnerId, setEmargIndivLearnerId] = useState<string>("");
  const [emargIndivLearners, setEmargIndivLearners] = useState<LearnerRow[]>([]);
  const [loadingEmargIndivLearners, setLoadingEmargIndivLearners] = useState(false);
  const [emargIndivBatchSessionId, setEmargIndivBatchSessionId] = useState<string>("");
  const [generatingEmargIndiv, setGeneratingEmargIndiv] = useState(false);
  const [generatingEmargIndivBatch, setGeneratingEmargIndivBatch] = useState(false);
  const [lastEmargIndivResult, setLastEmargIndivResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    present?: boolean;
  } | null>(null);
  const [lastEmargIndivBatchResult, setLastEmargIndivBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
    signedCount?: number;
  } | null>(null);

  // ── Attestation assiduité (per session+learner) ──────────────────────
  const [attestSessionId, setAttestSessionId] = useState<string>("");
  const [attestLearnerId, setAttestLearnerId] = useState<string>("");
  const [attestLearners, setAttestLearners] = useState<LearnerRow[]>([]);
  const [loadingAttestLearners, setLoadingAttestLearners] = useState(false);
  const [attestBatchSessionId, setAttestBatchSessionId] = useState<string>("");
  const [generatingAttest, setGeneratingAttest] = useState(false);
  const [generatingAttestBatch, setGeneratingAttestBatch] = useState(false);
  const [lastAttestResult, setLastAttestResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    present?: boolean;
  } | null>(null);
  const [lastAttestBatchResult, setLastAttestBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
    signedCount?: number;
  } | null>(null);

  // ── Certificat réalisation (per session+learner) ─────────────────────
  const [certifSessionId, setCertifSessionId] = useState<string>("");
  const [certifLearnerId, setCertifLearnerId] = useState<string>("");
  const [certifLearners, setCertifLearners] = useState<LearnerRow[]>([]);
  const [loadingCertifLearners, setLoadingCertifLearners] = useState(false);
  const [certifBatchSessionId, setCertifBatchSessionId] = useState<string>("");
  const [generatingCertif, setGeneratingCertif] = useState(false);
  const [generatingCertifBatch, setGeneratingCertifBatch] = useState(false);
  const [lastCertifResult, setLastCertifResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastCertifBatchResult, setLastCertifBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Convocation apprenant (per session+learner) ──────────────────────
  const [convocSessionId, setConvocSessionId] = useState<string>("");
  const [convocLearnerId, setConvocLearnerId] = useState<string>("");
  const [convocLearners, setConvocLearners] = useState<LearnerRow[]>([]);
  const [loadingConvocLearners, setLoadingConvocLearners] = useState(false);
  const [convocBatchSessionId, setConvocBatchSessionId] = useState<string>("");
  const [generatingConvoc, setGeneratingConvoc] = useState(false);
  const [generatingConvocBatch, setGeneratingConvocBatch] = useState(false);
  const [lastConvocResult, setLastConvocResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastConvocBatchResult, setLastConvocBatchResult] = useState<{
    totalLearners: number;
    successCount: number;
    failureCount: number;
    errors: { learnerId: string; learnerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Convention intervention (per session+trainer) ────────────────────
  const [interventionSessionId, setInterventionSessionId] = useState<string>("");
  const [interventionTrainerId, setInterventionTrainerId] = useState<string>("");
  const [interventionTrainers, setInterventionTrainers] = useState<TrainerRow[]>([]);
  const [loadingInterventionTrainers, setLoadingInterventionTrainers] = useState(false);
  const [interventionBatchSessionId, setInterventionBatchSessionId] = useState<string>("");
  const [generatingIntervention, setGeneratingIntervention] = useState(false);
  const [generatingInterventionBatch, setGeneratingInterventionBatch] = useState(false);
  const [lastInterventionResult, setLastInterventionResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    costHt?: number | null;
  } | null>(null);
  const [lastInterventionBatchResult, setLastInterventionBatchResult] = useState<{
    totalTrainers: number;
    successCount: number;
    failureCount: number;
    errors: { trainerId: string; trainerName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // Charge la liste des sessions de l'entité
  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, title, start_date")
        .eq("entity_id", entityId)
        .order("start_date", { ascending: false })
        .limit(50);
      setSessions((data as SessionRow[]) || []);
      setLoadingSessions(false);
    })();
  }, [supabase, entityId]);

  // Charge les entreprises de la session sélectionnée
  useEffect(() => {
    if (!selectedSessionId) {
      setCompanies([]);
      setSelectedClientId("");
      return;
    }
    setLoadingCompanies(true);
    (async () => {
      const { data } = await supabase
        .from("formation_companies")
        .select("client_id, client:clients(id, company_name)")
        .eq("session_id", selectedSessionId);
      setCompanies((data as unknown as CompanyRow[]) || []);
      setLoadingCompanies(false);
    })();
  }, [supabase, selectedSessionId]);

  // Charge les entreprises de la session émargement single
  useEffect(() => {
    if (!emargementSessionId) {
      setEmargementCompanies([]);
      setEmargementClientId("");
      return;
    }
    setLoadingEmargementCompanies(true);
    (async () => {
      const { data } = await supabase
        .from("formation_companies")
        .select("client_id, client:clients(id, company_name)")
        .eq("session_id", emargementSessionId);
      setEmargementCompanies((data as unknown as CompanyRow[]) || []);
      setLoadingEmargementCompanies(false);
    })();
  }, [supabase, emargementSessionId]);

  // Charge les formateurs de la session pour convention intervention single
  useEffect(() => {
    if (!interventionSessionId) {
      setInterventionTrainers([]);
      setInterventionTrainerId("");
      return;
    }
    setLoadingInterventionTrainers(true);
    (async () => {
      const { data } = await supabase
        .from("formation_trainers")
        .select("trainer_id, trainer:trainers(id, first_name, last_name)")
        .eq("session_id", interventionSessionId);
      setInterventionTrainers((data as unknown as TrainerRow[]) || []);
      setLoadingInterventionTrainers(false);
    })();
  }, [supabase, interventionSessionId]);

  // Charge les apprenants de la session pour convocation single
  useEffect(() => {
    if (!convocSessionId) {
      setConvocLearners([]);
      setConvocLearnerId("");
      return;
    }
    setLoadingConvocLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", convocSessionId);
      setConvocLearners((data as unknown as LearnerRow[]) || []);
      setLoadingConvocLearners(false);
    })();
  }, [supabase, convocSessionId]);

  // Charge les apprenants de la session pour certificat single
  useEffect(() => {
    if (!certifSessionId) {
      setCertifLearners([]);
      setCertifLearnerId("");
      return;
    }
    setLoadingCertifLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", certifSessionId);
      setCertifLearners((data as unknown as LearnerRow[]) || []);
      setLoadingCertifLearners(false);
    })();
  }, [supabase, certifSessionId]);

  // Charge les apprenants pour attestation single
  useEffect(() => {
    if (!attestSessionId) {
      setAttestLearners([]);
      setAttestLearnerId("");
      return;
    }
    setLoadingAttestLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", attestSessionId);
      setAttestLearners((data as unknown as LearnerRow[]) || []);
      setLoadingAttestLearners(false);
    })();
  }, [supabase, attestSessionId]);

  // Charge les apprenants pour émargement individuel single
  useEffect(() => {
    if (!emargIndivSessionId) {
      setEmargIndivLearners([]);
      setEmargIndivLearnerId("");
      return;
    }
    setLoadingEmargIndivLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", emargIndivSessionId);
      setEmargIndivLearners((data as unknown as LearnerRow[]) || []);
      setLoadingEmargIndivLearners(false);
    })();
  }, [supabase, emargIndivSessionId]);

  // Charge les apprenants pour certificat diplôme single
  useEffect(() => {
    if (!diplomeSessionId) {
      setDiplomeLearners([]);
      setDiplomeLearnerId("");
      return;
    }
    setLoadingDiplomeLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", diplomeSessionId);
      setDiplomeLearners((data as unknown as LearnerRow[]) || []);
      setLoadingDiplomeLearners(false);
    })();
  }, [supabase, diplomeSessionId]);

  // Charge les apprenants pour résultats évaluations single
  useEffect(() => {
    if (!evalResSessionId) {
      setEvalResLearners([]);
      setEvalResLearnerId("");
      return;
    }
    setLoadingEvalResLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", evalResSessionId);
      setEvalResLearners((data as unknown as LearnerRow[]) || []);
      setLoadingEvalResLearners(false);
    })();
  }, [supabase, evalResSessionId]);

  // Charge les apprenants pour attestation compétences single
  useEffect(() => {
    if (!attCompSessionId) {
      setAttCompLearners([]);
      setAttCompLearnerId("");
      return;
    }
    setLoadingAttCompLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", attCompSessionId);
      setAttCompLearners((data as unknown as LearnerRow[]) || []);
      setLoadingAttCompLearners(false);
    })();
  }, [supabase, attCompSessionId]);

  // Charge les apprenants pour autorisation image single
  useEffect(() => {
    if (!autoImgSessionId) {
      setAutoImgLearners([]);
      setAutoImgLearnerId("");
      return;
    }
    setLoadingAutoImgLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", autoImgSessionId);
      setAutoImgLearners((data as unknown as LearnerRow[]) || []);
      setLoadingAutoImgLearners(false);
    })();
  }, [supabase, autoImgSessionId]);

  // Charge les apprenants pour décharge responsabilité single
  useEffect(() => {
    if (!dechSessionId) {
      setDechLearners([]);
      setDechLearnerId("");
      return;
    }
    setLoadingDechLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", dechSessionId);
      setDechLearners((data as unknown as LearnerRow[]) || []);
      setLoadingDechLearners(false);
    })();
  }, [supabase, dechSessionId]);

  // Charge les apprenants pour attestation AIPR single
  useEffect(() => {
    if (!aiprSessionId) {
      setAiprLearners([]);
      setAiprLearnerId("");
      return;
    }
    setLoadingAiprLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", aiprSessionId);
      setAiprLearners((data as unknown as LearnerRow[]) || []);
      setLoadingAiprLearners(false);
    })();
  }, [supabase, aiprSessionId]);

  // Charge les apprenants pour avis habilitation électrique single
  useEffect(() => {
    if (!habilSessionId) {
      setHabilLearners([]);
      setHabilLearnerId("");
      return;
    }
    setLoadingHabilLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", habilSessionId);
      setHabilLearners((data as unknown as LearnerRow[]) || []);
      setLoadingHabilLearners(false);
    })();
  }, [supabase, habilSessionId]);

  // Charge les apprenants pour attestation abandon single
  useEffect(() => {
    if (!abandonSessionId) {
      setAbandonLearners([]);
      setAbandonLearnerId("");
      return;
    }
    setLoadingAbandonLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", abandonSessionId);
      setAbandonLearners((data as unknown as LearnerRow[]) || []);
      setLoadingAbandonLearners(false);
    })();
  }, [supabase, abandonSessionId]);

  // Charge les apprenants pour avis habilitation BF-HF single
  useEffect(() => {
    if (!habilBfHfSessionId) {
      setHabilBfHfLearners([]);
      setHabilBfHfLearnerId("");
      return;
    }
    setLoadingHabilBfHfLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", habilBfHfSessionId);
      setHabilBfHfLearners((data as unknown as LearnerRow[]) || []);
      setLoadingHabilBfHfLearners(false);
    })();
  }, [supabase, habilBfHfSessionId]);

  // Charge les apprenants pour certificat travail en hauteur single
  useEffect(() => {
    if (!hauteurSessionId) {
      setHauteurLearners([]);
      setHauteurLearnerId("");
      return;
    }
    setLoadingHauteurLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", hauteurSessionId);
      setHauteurLearners((data as unknown as LearnerRow[]) || []);
      setLoadingHauteurLearners(false);
    })();
  }, [supabase, hauteurSessionId]);

  // Charge les apprenants pour avis habilitation électrique BT single
  useEffect(() => {
    if (!habilBtSessionId) {
      setHabilBtLearners([]);
      setHabilBtLearnerId("");
      return;
    }
    setLoadingHabilBtLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", habilBtSessionId);
      setHabilBtLearners((data as unknown as LearnerRow[]) || []);
      setLoadingHabilBtLearners(false);
    })();
  }, [supabase, habilBtSessionId]);

  // Charge les apprenants pour bilan POE single
  useEffect(() => {
    if (!bilanPoeSessionId) {
      setBilanPoeLearners([]);
      setBilanPoeLearnerId("");
      return;
    }
    setLoadingBilanPoeLearners(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners(id, first_name, last_name)")
        .eq("session_id", bilanPoeSessionId);
      setBilanPoeLearners((data as unknown as LearnerRow[]) || []);
      setLoadingBilanPoeLearners(false);
    })();
  }, [supabase, bilanPoeSessionId]);

  // Charge tous les formateurs de l'entité courante (pour charte formateur)
  useEffect(() => {
    if (!entityId) return;
    setLoadingAllTrainers(true);
    (async () => {
      const { data } = await supabase
        .from("trainers")
        .select("id, first_name, last_name")
        .eq("entity_id", entityId)
        .order("last_name", { ascending: true });
      setAllTrainers((data as { id: string; first_name: string; last_name: string }[]) || []);
      setLoadingAllTrainers(false);
    })();
  }, [supabase, entityId]);

  // ── CGV handler (entity-only, pas de params) ──────────────────────────
  async function handleGenerateCgv() {
    setGeneratingCgv(true);
    setLastCgvResult(null);
    try {
      const res = await fetch("/api/documents/generate-cgv", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCgvResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "CGV générées", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération CGV",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingCgv(false);
    }
  }

  // ── Avis Habilitation Électrique handlers (OPTIONNEL) ────────────────
  async function handleGenerateHabilMock() {
    setGeneratingHabil(true);
    setLastHabilResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock avis habilitation", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabil(false);
    }
  }

  async function handleGenerateHabil() {
    if (!habilSessionId || !habilLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingHabil(true);
    setLastHabilResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilSessionId, learnerId: habilLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec avis habilitation", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabil(false);
    }
  }

  async function handleGenerateHabilBatch() {
    if (!habilBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingHabilBatch(true);
    setLastHabilBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === habilBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `avis-habilitation-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP avis habilitation généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch avis habilitation", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBatch(false);
    }
  }

  // ── Attestation d'abandon handlers (OPTIONNEL) ──────────────────────
  async function handleGenerateAbandonMock() {
    setGeneratingAbandon(true);
    setLastAbandonResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-abandon-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAbandonResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Attestation abandon mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock attestation abandon", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAbandon(false);
    }
  }

  async function handleGenerateAbandon() {
    if (!abandonSessionId || !abandonLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingAbandon(true);
    setLastAbandonResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: abandonSessionId, learnerId: abandonLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAbandonResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Attestation abandon générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec attestation abandon", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAbandon(false);
    }
  }

  async function handleGenerateAbandonBatch() {
    if (!abandonBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingAbandonBatch(true);
    setLastAbandonBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestations-abandon-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: abandonBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAbandonBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === abandonBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `attestations-abandon-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP attestations abandon généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch attestations abandon", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAbandonBatch(false);
    }
  }

  // ── Avis Habilitation Électrique BF-HF handlers (OPTIONNEL) ─────────
  async function handleGenerateHabilBfHfMock() {
    setGeneratingHabilBfHf(true);
    setLastHabilBfHfResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bf-hf-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBfHfResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation BF-HF mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock avis habilitation BF-HF", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBfHf(false);
    }
  }

  async function handleGenerateHabilBfHf() {
    if (!habilBfHfSessionId || !habilBfHfLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingHabilBfHf(true);
    setLastHabilBfHfResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bf-hf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilBfHfSessionId, learnerId: habilBfHfLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBfHfResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation BF-HF généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec avis habilitation BF-HF", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBfHf(false);
    }
  }

  async function handleGenerateHabilBfHfBatch() {
    if (!habilBfHfBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingHabilBfHfBatch(true);
    setLastHabilBfHfBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bf-hf-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilBfHfBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBfHfBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === habilBfHfBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `avis-habilitation-bf-hf-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP avis habilitation BF-HF généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch avis habilitation BF-HF", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBfHfBatch(false);
    }
  }

  // ── Certificat Travail en Hauteur handlers (OPTIONNEL) ──────────────
  async function handleGenerateHauteurMock() {
    setGeneratingHauteur(true);
    setLastHauteurResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-travail-hauteur-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHauteurResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Certificat travail hauteur mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock certificat hauteur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHauteur(false);
    }
  }

  async function handleGenerateHauteur() {
    if (!hauteurSessionId || !hauteurLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingHauteur(true);
    setLastHauteurResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-travail-hauteur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: hauteurSessionId, learnerId: hauteurLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHauteurResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Certificat travail hauteur généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec certificat hauteur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHauteur(false);
    }
  }

  async function handleGenerateHauteurBatch() {
    if (!hauteurBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingHauteurBatch(true);
    setLastHauteurBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificats-travail-hauteur-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: hauteurBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHauteurBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === hauteurBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `certificats-travail-hauteur-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP certificats travail hauteur généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch certificats hauteur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHauteurBatch(false);
    }
  }

  // ── Avis Habilitation Électrique BT handlers (OPTIONNEL) ─────────────
  async function handleGenerateHabilBtMock() {
    setGeneratingHabilBt(true);
    setLastHabilBtResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bt-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBtResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation BT mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock avis habilitation BT", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBt(false);
    }
  }

  async function handleGenerateHabilBt() {
    if (!habilBtSessionId || !habilBtLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingHabilBt(true);
    setLastHabilBtResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilBtSessionId, learnerId: habilBtLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBtResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Avis habilitation BT généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec avis habilitation BT", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBt(false);
    }
  }

  async function handleGenerateHabilBtBatch() {
    if (!habilBtBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingHabilBtBatch(true);
    setLastHabilBtBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-avis-habilitation-electrique-bt-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: habilBtBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastHabilBtBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === habilBtBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `avis-habilitation-bt-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP avis habilitation BT généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch avis habilitation BT", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingHabilBtBatch(false);
    }
  }

  // ── Bilan POE handlers (per session+learner, OPTIONNEL) ─────────────
  async function handleGenerateBilanPoeMock() {
    setGeneratingBilanPoe(true);
    setLastBilanPoeResult(null);
    try {
      const res = await fetch("/api/documents/generate-bilan-poe-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastBilanPoeResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Bilan POE mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock bilan POE", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingBilanPoe(false);
    }
  }

  async function handleGenerateBilanPoe() {
    if (!bilanPoeSessionId || !bilanPoeLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingBilanPoe(true);
    setLastBilanPoeResult(null);
    try {
      const res = await fetch("/api/documents/generate-bilan-poe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: bilanPoeSessionId, learnerId: bilanPoeLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastBilanPoeResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Bilan POE généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec bilan POE", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingBilanPoe(false);
    }
  }

  async function handleGenerateBilanPoeBatch() {
    if (!bilanPoeBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingBilanPoeBatch(true);
    setLastBilanPoeBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-bilans-poe-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: bilanPoeBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastBilanPoeBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs, signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === bilanPoeBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `bilans-poe-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP bilans POE généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch bilans POE", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingBilanPoeBatch(false);
    }
  }

  // ── Attestation AIPR handlers (per session+learner, OPTIONNEL) ──────
  async function handleGenerateAiprMock() {
    setGeneratingAipr(true);
    setLastAiprResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-aipr-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAiprResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "AIPR mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock AIPR", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAipr(false);
    }
  }

  async function handleGenerateAipr() {
    if (!aiprSessionId || !aiprLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingAipr(true);
    setLastAiprResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-aipr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: aiprSessionId, learnerId: aiprLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAiprResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "AIPR générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec AIPR", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAipr(false);
    }
  }

  async function handleGenerateAiprBatch() {
    if (!aiprBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingAiprBatch(true);
    setLastAiprBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestations-aipr-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: aiprBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAiprBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === aiprBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `attestations-aipr-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP AIPR généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch AIPR", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAiprBatch(false);
    }
  }

  // ── Charte formateur handlers (per TRAINER, OPTIONNEL) ──────────────
  async function handleGenerateCharteMock() {
    setGeneratingCharte(true);
    setLastCharteResult(null);
    try {
      const res = await fetch("/api/documents/generate-charte-formateur-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCharteResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Charte mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock charte", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingCharte(false);
    }
  }

  async function handleGenerateCharte() {
    if (!charteTrainerId) {
      toast({ title: "Aucun formateur", description: "Sélectionne d'abord un formateur.", variant: "destructive" });
      return;
    }
    setGeneratingCharte(true);
    setLastCharteResult(null);
    try {
      const res = await fetch("/api/documents/generate-charte-formateur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId: charteTrainerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCharteResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Charte générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec charte", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingCharte(false);
    }
  }

  async function handleGenerateCharteBatch() {
    setGeneratingCharteBatch(true);
    setLastCharteBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-chartes-formateur-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCharteBatchResult({
        totalTrainers: json.totalTrainers, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chartes-formateurs.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP chartes généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalTrainers} formateurs · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch chartes", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingCharteBatch(false);
    }
  }

  // ── Réponses satisfaction handlers (per SESSION, OPTIONNEL) ──────────
  async function handleGenerateSatRepMock() {
    setGeneratingSatRep(true);
    setLastSatRepResult(null);
    try {
      const res = await fetch("/api/documents/generate-reponses-satisfaction-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastSatRepResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Réponses satisfaction mock générées", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock réponses satisfaction", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingSatRep(false);
    }
  }

  async function handleGenerateSatRep() {
    if (!satRepSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingSatRep(true);
    setLastSatRepResult(null);
    try {
      const res = await fetch("/api/documents/generate-reponses-satisfaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: satRepSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastSatRepResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
        qualiopi: json.qualiopi,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Réponses satisfaction générées",
        description: `${json.qualiopi?.totalLearners ?? "?"} apprenants · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({ title: "Échec réponses satisfaction", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingSatRep(false);
    }
  }

  // ── Décharge responsabilité handlers (OPTIONNEL) ─────────────────────
  async function handleGenerateDechMock() {
    setGeneratingDech(true);
    setLastDechResult(null);
    try {
      const res = await fetch("/api/documents/generate-decharge-responsabilite-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDechResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Décharge mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock décharge", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingDech(false);
    }
  }

  async function handleGenerateDech() {
    if (!dechSessionId || !dechLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingDech(true);
    setLastDechResult(null);
    try {
      const res = await fetch("/api/documents/generate-decharge-responsabilite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: dechSessionId, learnerId: dechLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDechResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Décharge générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec décharge", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingDech(false);
    }
  }

  async function handleGenerateDechBatch() {
    if (!dechBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingDechBatch(true);
    setLastDechBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-decharges-responsabilite-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: dechBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDechBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === dechBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `decharges-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP décharges généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch décharges", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingDechBatch(false);
    }
  }

  // ── Autorisation image handlers (OPTIONNEL) ──────────────────────────
  async function handleGenerateAutoImgMock() {
    setGeneratingAutoImg(true);
    setLastAutoImgResult(null);
    try {
      const res = await fetch("/api/documents/generate-autorisation-image-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAutoImgResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Autorisation image mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock autorisation image", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAutoImg(false);
    }
  }

  async function handleGenerateAutoImg() {
    if (!autoImgSessionId || !autoImgLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingAutoImg(true);
    setLastAutoImgResult(null);
    try {
      const res = await fetch("/api/documents/generate-autorisation-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: autoImgSessionId, learnerId: autoImgLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAutoImgResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Autorisation image générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec autorisation image", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAutoImg(false);
    }
  }

  async function handleGenerateAutoImgBatch() {
    if (!autoImgBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingAutoImgBatch(true);
    setLastAutoImgBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-autorisations-image-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: autoImgBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAutoImgBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === autoImgBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `autorisations-image-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP autorisations image généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch autorisations image", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAutoImgBatch(false);
    }
  }

  // ── Attestation compétences handlers (OPTIONNEL) ──────────────────────
  async function handleGenerateAttCompMock() {
    setGeneratingAttComp(true);
    setLastAttCompResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-competences-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttCompResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Attestation compétences mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock attestation compétences", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAttComp(false);
    }
  }

  async function handleGenerateAttComp() {
    if (!attCompSessionId || !attCompLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingAttComp(true);
    setLastAttCompResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-competences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: attCompSessionId, learnerId: attCompLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttCompResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Attestation compétences générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec attestation compétences", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAttComp(false);
    }
  }

  async function handleGenerateAttCompBatch() {
    if (!attCompBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingAttCompBatch(true);
    setLastAttCompBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestations-competences-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: attCompBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttCompBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === attCompBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `attestations-competences-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP attestations compétences généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch attestations compétences", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingAttCompBatch(false);
    }
  }

  // ── Résultats évaluations handlers (OPTIONNEL) ────────────────────────
  async function handleGenerateEvalResMock() {
    setGeneratingEvalRes(true);
    setLastEvalResResult(null);
    try {
      const res = await fetch("/api/documents/generate-resultats-evaluations-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEvalResResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Résultats mock générés", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({ title: "Échec mock résultats", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingEvalRes(false);
    }
  }

  async function handleGenerateEvalRes() {
    if (!evalResSessionId || !evalResLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingEvalRes(true);
    setLastEvalResResult(null);
    try {
      const res = await fetch("/api/documents/generate-resultats-evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: evalResSessionId, learnerId: evalResLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEvalResResult({
        engineUsed: json.engineUsed, cacheHit: json.cacheHit,
        latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
        evaluationsCount: json.evaluationsCount,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Résultats générés",
        description: `${json.evaluationsCount ?? 0} éval(s) · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({ title: "Échec résultats", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingEvalRes(false);
    }
  }

  async function handleGenerateEvalResBatch() {
    if (!evalResBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingEvalResBatch(true);
    setLastEvalResBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-resultats-evaluations-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: evalResBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEvalResBatchResult({
        totalLearners: json.totalLearners, successCount: json.successCount,
        failureCount: json.failureCount, errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === evalResBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `resultats-evaluations-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP résultats généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Échec batch résultats", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGeneratingEvalResBatch(false);
    }
  }

  // ── Certificat diplôme handlers ───────────────────────────────────────
  async function handleGenerateDiplomeMock() {
    setGeneratingDiplome(true);
    setLastDiplomeResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-diplome-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDiplomeResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Certificat diplôme mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec certificat diplôme mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingDiplome(false);
    }
  }

  async function handleGenerateDiplome() {
    if (!diplomeSessionId || !diplomeLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingDiplome(true);
    setLastDiplomeResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-diplome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: diplomeSessionId, learnerId: diplomeLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDiplomeResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        certificateCode: json.certificateCode,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Certificat diplôme généré",
        description: `CODE: ${json.certificateCode} · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec certificat diplôme",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingDiplome(false);
    }
  }

  async function handleGenerateDiplomeBatch() {
    if (!diplomeBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingDiplomeBatch(true);
    setLastDiplomeBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificats-diplome-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: diplomeBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastDiplomeBatchResult({
        totalLearners: json.totalLearners,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === diplomeBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `certificats-diplome-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP diplômes généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch diplômes",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingDiplomeBatch(false);
    }
  }

  // ── Émargement individuel handlers ────────────────────────────────────
  async function handleGenerateEmargIndivMock() {
    setGeneratingEmargIndiv(true);
    setLastEmargIndivResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement-individuel-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargIndivResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Émargement individuel mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec mock émargement individuel",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargIndiv(false);
    }
  }

  async function handleGenerateEmargIndiv() {
    if (!emargIndivSessionId || !emargIndivLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingEmargIndiv(true);
    setLastEmargIndivResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement-individuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargIndivSessionId, learnerId: emargIndivLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargIndivResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        present: json.present,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Émargement individuel généré",
        description: `${json.present ? "Présent" : "Absent"} · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec émargement individuel",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargIndiv(false);
    }
  }

  async function handleGenerateEmargIndivBatch() {
    if (!emargIndivBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingEmargIndivBatch(true);
    setLastEmargIndivBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargements-individuels-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargIndivBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargIndivBatchResult({
        totalLearners: json.totalLearners,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === emargIndivBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `emargements-indiv-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP émargements indiv générés" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.signedCount ?? 0} signature(s) · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch émargements indiv",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargIndivBatch(false);
    }
  }

  // ── Attestation assiduité handlers ────────────────────────────────────
  async function handleGenerateAttestMock() {
    setGeneratingAttest(true);
    setLastAttestResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-assiduite-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttestResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Attestation mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec attestation mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingAttest(false);
    }
  }

  async function handleGenerateAttest() {
    if (!attestSessionId || !attestLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingAttest(true);
    setLastAttestResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestation-assiduite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: attestSessionId, learnerId: attestLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttestResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        present: json.present,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Attestation générée",
        description: `${json.present ? "Présent" : "Absent"} · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec attestation",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingAttest(false);
    }
  }

  async function handleGenerateAttestBatch() {
    if (!attestBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingAttestBatch(true);
    setLastAttestBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-attestations-assiduite-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: attestBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastAttestBatchResult({
        totalLearners: json.totalLearners,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === attestBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `attestations-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP attestations généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.signedCount ?? 0} signature(s) · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch attestations",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingAttestBatch(false);
    }
  }

  // ── Certificat réalisation handlers ───────────────────────────────────
  async function handleGenerateCertifMock() {
    setGeneratingCertif(true);
    setLastCertifResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-realisation-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCertifResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Certificat mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec certificat mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingCertif(false);
    }
  }

  async function handleGenerateCertif() {
    if (!certifSessionId || !certifLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingCertif(true);
    setLastCertifResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificat-realisation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: certifSessionId, learnerId: certifLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCertifResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Certificat généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec certificat",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingCertif(false);
    }
  }

  async function handleGenerateCertifBatch() {
    if (!certifBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingCertifBatch(true);
    setLastCertifBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-certificats-realisation-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: certifBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCertifBatchResult({
        totalLearners: json.totalLearners,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === certifBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `certificats-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP certificats généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch certificats",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingCertifBatch(false);
    }
  }

  // ── Convocation handlers ──────────────────────────────────────────────
  async function handleGenerateConvocMock() {
    setGeneratingConvoc(true);
    setLastConvocResult(null);
    try {
      const res = await fetch("/api/documents/generate-convocation-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastConvocResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Convocation mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec convocation mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingConvoc(false);
    }
  }

  async function handleGenerateConvoc() {
    if (!convocSessionId || !convocLearnerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET apprenant.", variant: "destructive" });
      return;
    }
    setGeneratingConvoc(true);
    setLastConvocResult(null);
    try {
      const res = await fetch("/api/documents/generate-convocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: convocSessionId, learnerId: convocLearnerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastConvocResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Convocation générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec convocation",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingConvoc(false);
    }
  }

  async function handleGenerateConvocBatch() {
    if (!convocBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingConvocBatch(true);
    setLastConvocBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-convocations-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: convocBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastConvocBatchResult({
        totalLearners: json.totalLearners,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === convocBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `convocations-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP convocations généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalLearners} apprenants · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch convocations",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingConvocBatch(false);
    }
  }

  // ── Convention intervention handlers ──────────────────────────────────
  async function handleGenerateInterventionMock() {
    setGeneratingIntervention(true);
    setLastInterventionResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention-intervention-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastInterventionResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Contrat formateur mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec contrat mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingIntervention(false);
    }
  }

  async function handleGenerateIntervention() {
    if (!interventionSessionId || !interventionTrainerId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET formateur.", variant: "destructive" });
      return;
    }
    setGeneratingIntervention(true);
    setLastInterventionResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention-intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: interventionSessionId, trainerId: interventionTrainerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastInterventionResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        costHt: json.costHt,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Contrat formateur généré",
        description: `${json.costHt ?? "?"} € HT · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec contrat formateur",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingIntervention(false);
    }
  }

  async function handleGenerateInterventionBatch() {
    if (!interventionBatchSessionId) {
      toast({ title: "Aucune session", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingInterventionBatch(true);
    setLastInterventionBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-conventions-intervention-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: interventionBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastInterventionBatchResult({
        totalTrainers: json.totalTrainers,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === interventionBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `contrats-formateurs-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP contrats généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalTrainers} contrats · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch contrats",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingInterventionBatch(false);
    }
  }

  // ── Programme handlers ────────────────────────────────────────────────
  async function handleGenerateProgrammeMock() {
    setGeneratingProgramme(true);
    setLastProgrammeResult(null);
    try {
      const res = await fetch("/api/documents/generate-programme-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastProgrammeResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Programme mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec programme mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingProgramme(false);
    }
  }

  async function handleGenerateProgramme() {
    if (!programmeSessionId) {
      toast({ title: "Aucune session choisie", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingProgramme(true);
    setLastProgrammeResult(null);
    try {
      const res = await fetch("/api/documents/generate-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: programmeSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastProgrammeResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Programme généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération programme",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingProgramme(false);
    }
  }

  // ── Règlement Intérieur handler ───────────────────────────────────────
  async function handleGenerateRi() {
    setGeneratingRi(true);
    setLastRiResult(null);
    try {
      const res = await fetch("/api/documents/generate-reglement-interieur", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastRiResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Règlement Intérieur généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération Règlement Intérieur",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingRi(false);
    }
  }

  // ── RGPD handler (entity-only, pas de params) ─────────────────────────
  async function handleGenerateRgpd() {
    setGeneratingRgpd(true);
    setLastRgpdResult(null);
    try {
      const res = await fetch("/api/documents/generate-rgpd", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastRgpdResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Politique RGPD générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération RGPD",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingRgpd(false);
    }
  }

  // ── Émargement handlers ───────────────────────────────────────────────
  async function handleGenerateEmargementMock() {
    setGeneratingEmargement(true);
    setLastEmargementResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Émargement mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec émargement mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargement(false);
    }
  }

  async function handleGenerateEmargement() {
    if (!emargementSessionId || !emargementClientId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET entreprise.", variant: "destructive" });
      return;
    }
    setGeneratingEmargement(true);
    setLastEmargementResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargementSessionId, clientId: emargementClientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Émargement généré",
        description: `${json.signedCount ?? 0} signature(s) · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec émargement",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargement(false);
    }
  }

  async function handleGenerateEmargementBatch() {
    if (!emargementBatchSessionId) {
      toast({ title: "Aucune session choisie", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingEmargementBatch(true);
    setLastEmargementBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargements-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargementBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementBatchResult({
        totalCompanies: json.totalCompanies,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === emargementBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `emargements-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP émargements généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalCompanies} feuilles · ${json.signedCount ?? 0} signature(s) · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch émargements",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargementBatch(false);
    }
  }

  async function handleGenerateMock() {
    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention-mock", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });

      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      toast({
        title: "PDF mock généré",
        description: `${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération mock",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateBatch() {
    if (!selectedBatchSessionId) {
      toast({
        title: "Aucune session choisie",
        description: "Sélectionne d'abord une session.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBatch(true);
    setLastBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-conventions-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastBatchResult({
        totalCompanies: json.totalCompanies,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });

      // Téléchargement auto du ZIP
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === selectedBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `conventions-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: json.failureCount === 0 ? "ZIP généré" : "ZIP généré avec erreurs",
        description: `${json.successCount}/${json.totalCompanies} conventions · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération batch",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGeneratingBatch(false);
    }
  }

  async function handleGenerate() {
    if (!selectedSessionId || !selectedClientId) {
      toast({
        title: "Sélection incomplète",
        description: "Choisis une session ET une entreprise.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          clientId: selectedClientId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });

      // Ouvre le PDF dans un nouvel onglet
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      toast({
        title: "PDF généré",
        description: `${json.engineUsed} · ${json.latencyMs}ms · ${(json.fileSizeBytes / 1024).toFixed(1)} KB`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          Test nouvelle infra — Convention entreprise
        </h1>
        <p className="text-sm text-muted-foreground">
          Page temporaire (Story B-Convention) pour valider la génération PDF
          via la nouvelle infra Puppeteer + cache + template{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">[%xxx%]</code>.
          Sera intégrée dans <code className="text-xs bg-gray-100 px-1 rounded">TabConventionDocs</code> une fois validée.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère un PDF avec des données mockées (Acme Formation SAS, 3
            apprenants, formation Habilitation Électrique). Permet de valider
            le rendu visuel du template sans avoir besoin de vraie session
            en base. Le logo et la signature organisme viennent quand même
            de ton entité réelle.
          </p>
          <Button
            onClick={handleGenerateMock}
            disabled={generating}
            className="w-full gap-2"
            variant="default"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un PDF de test (données factices)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Données réelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="session-select" className="text-sm">
              Session (50 dernières)
            </Label>
            <Select
              value={selectedSessionId}
              onValueChange={setSelectedSessionId}
              disabled={loadingSessions || generating}
            >
              <SelectTrigger id="session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="company-select" className="text-sm">
              Entreprise rattachée à la session
            </Label>
            <Select
              value={selectedClientId}
              onValueChange={setSelectedClientId}
              disabled={!selectedSessionId || loadingCompanies || generating}
            >
              <SelectTrigger id="company-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !selectedSessionId
                      ? "Choisis d'abord une session"
                      : loadingCompanies
                        ? "Chargement…"
                        : companies.length === 0
                          ? "Aucune entreprise rattachée"
                          : "Choisir une entreprise…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) =>
                  c.client ? (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.client.company_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedSessionId || !selectedClientId || generating}
            className="w-full gap-2"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut prendre 5-10s si premier rendu)
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Générer la convention (nouvelle infra)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — toutes les entreprises de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>une convention par entreprise</strong> rattachée à la session via{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">formation_companies</code>,
            avec les bons apprenants et le bon montant pour chacune (cf PR #13
            multi-entreprises). Résultat : <strong>1 ZIP</strong> contenant tous les
            PDF. <strong>Fail-soft</strong> : si une entreprise échoue, le ZIP
            contient quand même les autres + un fichier{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">_erreurs.txt</code>.
          </p>

          <div>
            <Label htmlFor="batch-session-select" className="text-sm">
              Session
            </Label>
            <Select
              value={selectedBatchSessionId}
              onValueChange={setSelectedBatchSessionId}
              disabled={loadingSessions || generatingBatch}
            >
              <SelectTrigger id="batch-session-select" className="mt-1">
                <SelectValue
                  placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"}
                />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateBatch}
            disabled={!selectedBatchSessionId || generatingBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut durer 10-30s selon le nombre d&apos;entreprises)
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les conventions
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastBatchResult && (
        <Card
          className={
            lastBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastBatchResult.failureCount === 0
                  ? "text-green-900"
                  : "text-amber-900")
              }
            >
              {lastBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastBatchResult.successCount}</strong> /{" "}
              {lastBatchResult.totalCompanies} conventions générées
            </div>
            <div>
              <strong>Latence totale :</strong> {lastBatchResult.totalLatencyMs} ms
            </div>
            {lastBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs (
                  {lastBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastBatchResult.errors.map((e) => (
                    <li key={e.clientId}>
                      <strong>{e.companyName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Le ZIP téléchargé contient un fichier{" "}
                  <code className="text-xs bg-gray-100 px-1 rounded">_erreurs.txt</code>{" "}
                  avec le détail.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière génération</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastResult.engineUsed}
              {lastResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Le PDF s&apos;est ouvert dans un nouvel onglet. Compare visuellement avec ton{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">convention-entreprise-mrformation.pdf</code> de référence.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    ÉMARGEMENT COLLECTIF — 3 modes (mock / single / batch)        */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <ClipboardList className="h-5 w-5 text-orange-600" />
          Émargement collectif
        </h2>
        <p className="text-sm text-muted-foreground">
          Feuille d&apos;émargement par entreprise. Statut Présent/Absent calculé
          depuis la table <code className="text-xs bg-gray-100 px-1 rounded">signatures</code> en mode réel.
        </p>
      </div>

      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère un PDF avec session mockée (10/01/2025, 1 jour, 2 créneaux
            matin/aprem) + 3 apprenants tous Présent. Permet de valider le rendu
            visuel sans dépendre des signatures réelles.
          </p>
          <Button
            onClick={handleGenerateEmargementMock}
            disabled={generatingEmargement || generatingEmargementBatch}
            className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {generatingEmargement ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer une feuille d&apos;émargement de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Émargement — Données réelles (1 entreprise)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="emargement-session-select" className="text-sm">Session</Label>
            <Select
              value={emargementSessionId}
              onValueChange={setEmargementSessionId}
              disabled={loadingSessions || generatingEmargement}
            >
              <SelectTrigger id="emargement-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="emargement-company-select" className="text-sm">Entreprise rattachée</Label>
            <Select
              value={emargementClientId}
              onValueChange={setEmargementClientId}
              disabled={!emargementSessionId || loadingEmargementCompanies || generatingEmargement}
            >
              <SelectTrigger id="emargement-company-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !emargementSessionId
                      ? "Choisis d'abord une session"
                      : loadingEmargementCompanies
                        ? "Chargement…"
                        : emargementCompanies.length === 0
                          ? "Aucune entreprise rattachée"
                          : "Choisir une entreprise…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {emargementCompanies.map((c) =>
                  c.client ? (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.client.company_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateEmargement}
            disabled={!emargementSessionId || !emargementClientId || generatingEmargement}
            className="w-full gap-2"
            size="lg"
          >
            {generatingEmargement ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <ClipboardList className="h-4 w-4" />
                Générer la feuille d&apos;émargement
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch émargement — toutes les entreprises de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>une feuille d&apos;émargement par entreprise</strong> rattachée
            à la session. Statuts Présent/Absent calculés depuis la table{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">signatures</code>{" "}
            (partagée pour toutes les entreprises de la session). Sortie : 1 ZIP.
          </p>

          <div>
            <Label htmlFor="emargement-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={emargementBatchSessionId}
              onValueChange={setEmargementBatchSessionId}
              disabled={loadingSessions || generatingEmargementBatch}
            >
              <SelectTrigger id="emargement-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateEmargementBatch}
            disabled={!emargementBatchSessionId || generatingEmargementBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingEmargementBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut durer 10-30s)
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les feuilles d&apos;émargement
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastEmargementBatchResult && (
        <Card
          className={
            lastEmargementBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastEmargementBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastEmargementBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch émargement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastEmargementBatchResult.successCount}</strong> /{" "}
              {lastEmargementBatchResult.totalCompanies} feuilles générées
            </div>
            <div>
              <strong>Signatures réelles trouvées :</strong>{" "}
              {lastEmargementBatchResult.signedCount ?? 0}
            </div>
            <div>
              <strong>Latence totale :</strong> {lastEmargementBatchResult.totalLatencyMs} ms
            </div>
            {lastEmargementBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs (
                  {lastEmargementBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastEmargementBatchResult.errors.map((e) => (
                    <li key={e.clientId}>
                      <strong>{e.companyName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastEmargementResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier émargement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastEmargementResult.engineUsed}
              {lastEmargementResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastEmargementResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastEmargementResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
            {lastEmargementResult.signedCount !== undefined && (
              <div>
                <strong>Signatures réelles :</strong> {lastEmargementResult.signedCount}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    CGV — Conditions Générales de Vente (entity-only, statique)  */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <ScrollText className="h-5 w-5 text-emerald-600" />
          Conditions Générales de Vente
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (17 articles juridiques). Pas de session/client requis :
          seul l&apos;organisme (nom, SIRET, NDA, adresse, logo) varie selon l&apos;entité.
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-emerald-600" />
            Générer CGV pour cet organisme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF des CGV avec les infos de ton entité courante.
            Aussi disponible automatiquement dans l&apos;espace client + apprenant
            (après deploy) — ce bouton est juste pour valider le rendu.
          </p>
          <Button
            onClick={handleGenerateCgv}
            disabled={generatingCgv}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {generatingCgv ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScrollText className="h-4 w-4" />
            )}
            Générer les CGV
          </Button>
        </CardContent>
      </Card>

      {lastCgvResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernières CGV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastCgvResult.engineUsed}
              {lastCgvResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastCgvResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastCgvResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    RGPD — Politique de protection des données (entity-only)     */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-cyan-600" />
          Politique RGPD
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (6 sections + intro + contact DPO). Seul l&apos;organisme
          (nom, email, adresse) varie selon l&apos;entité.
        </p>
      </div>

      <Card className="border-cyan-200 bg-cyan-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-600" />
            Générer la Politique RGPD pour cet organisme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF de la Politique RGPD avec les infos de ton entité
            courante (DPO = email + adresse organisme). Aussi disponible dans
            l&apos;espace client + apprenant à côté des CGV.
          </p>
          <Button
            onClick={handleGenerateRgpd}
            disabled={generatingRgpd}
            className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700"
            size="lg"
          >
            {generatingRgpd ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            Générer la Politique RGPD
          </Button>
        </CardContent>
      </Card>

      {lastRgpdResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière Politique RGPD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastRgpdResult.engineUsed}
              {lastRgpdResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastRgpdResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastRgpdResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Programme de formation (session-level, dynamique)            */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          Programme de formation
        </h2>
        <p className="text-sm text-muted-foreground">
          Document dynamique au niveau session. Données issues de{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">program.content</code> (JSONB :
          modules par jour/créneau, moyens pédagogiques, dispositif d&apos;évaluation, etc.).
        </p>
      </div>

      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-indigo-600" />
            Mode rapide — Données factices (reproduction exacte du PDF Loris)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le programme de l&apos;exemple Loris (2 jours, 4 créneaux,
            6 modules avec contenu + animation, satisfaction 99.6%). Permet
            de valider le rendu du gros builder{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">{`{{contenu_pedagogique}}`}</code>{" "}
            qui groupe les modules par jour/slot.
          </p>
          <Button
            onClick={handleGenerateProgrammeMock}
            disabled={generatingProgramme}
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            {generatingProgramme ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un programme de test (données factices)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programme — Données réelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sélectionne une session. Si elle a un{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">program_id</code>,
            le programme est rendu depuis{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">program.content</code>.
            Sinon, fallback partiel sur{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">training.objectives/description</code>{" "}
            (PDF sera incomplet — il faut un programme).
          </p>
          <div>
            <Label htmlFor="programme-session-select" className="text-sm">Session</Label>
            <Select
              value={programmeSessionId}
              onValueChange={setProgrammeSessionId}
              disabled={loadingSessions || generatingProgramme}
            >
              <SelectTrigger id="programme-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateProgramme}
            disabled={!programmeSessionId || generatingProgramme}
            className="w-full gap-2"
            size="lg"
          >
            {generatingProgramme ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <BookOpen className="h-4 w-4" />
                Générer le programme
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastProgrammeResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier programme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastProgrammeResult.engineUsed}
              {lastProgrammeResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastProgrammeResult.latencyMs} ms</div>
            <div>
              <strong>Taille PDF :</strong> {(lastProgrammeResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Certificat diplôme (per session+learner) — fin formation     */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-teal-600" />
          Certificat (diplôme de fin de formation)
        </h2>
        <p className="text-sm text-muted-foreground">
          Diplôme stylé per (session, apprenant) à délivrer à la fin de la
          formation. Inclut un <strong>code d&apos;identification déterministe</strong>{" "}
          (SHA-256 13 chars) — même certificat → même code.
        </p>
      </div>

      <Card className="border-teal-200 bg-teal-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reproduit l&apos;exemple Loris : Patrick ATTLAN, formation Managers
            de Proximité, code 6a0859cd356c0.
          </p>
          <Button
            onClick={handleGenerateDiplomeMock}
            disabled={generatingDiplome || generatingDiplomeBatch}
            className="w-full gap-2 bg-teal-600 hover:bg-teal-700"
          >
            {generatingDiplome ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un certificat diplôme de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificat diplôme — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="diplome-session-select" className="text-sm">Session</Label>
            <Select
              value={diplomeSessionId}
              onValueChange={setDiplomeSessionId}
              disabled={loadingSessions || generatingDiplome}
            >
              <SelectTrigger id="diplome-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="diplome-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select
              value={diplomeLearnerId}
              onValueChange={setDiplomeLearnerId}
              disabled={!diplomeSessionId || loadingDiplomeLearners || generatingDiplome}
            >
              <SelectTrigger id="diplome-learner-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !diplomeSessionId
                      ? "Choisis d'abord une session"
                      : loadingDiplomeLearners
                        ? "Chargement…"
                        : diplomeLearners.length === 0
                          ? "Aucun apprenant inscrit"
                          : "Choisir un apprenant…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {diplomeLearners.map((l) =>
                  l.learner ? (
                    <SelectItem key={l.learner_id} value={l.learner_id}>
                      {l.learner.last_name} {l.learner.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateDiplome}
            disabled={!diplomeSessionId || !diplomeLearnerId || generatingDiplome}
            className="w-full gap-2"
            size="lg"
          >
            {generatingDiplome ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Trophy className="h-4 w-4" />
                Générer le certificat diplôme
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 certificat diplôme par apprenant</strong> avec un
            code d&apos;identification distinct par apprenant. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="diplome-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={diplomeBatchSessionId}
              onValueChange={setDiplomeBatchSessionId}
              disabled={loadingSessions || generatingDiplomeBatch}
            >
              <SelectTrigger id="diplome-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateDiplomeBatch}
            disabled={!diplomeBatchSessionId || generatingDiplomeBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingDiplomeBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — tous les certificats diplômes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastDiplomeBatchResult && (
        <Card
          className={
            lastDiplomeBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastDiplomeBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastDiplomeBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch diplômes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastDiplomeBatchResult.successCount}</strong> /{" "}
              {lastDiplomeBatchResult.totalLearners} diplômes générés
            </div>
            <div>
              <strong>Latence totale :</strong> {lastDiplomeBatchResult.totalLatencyMs} ms
            </div>
            {lastDiplomeBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastDiplomeBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastDiplomeBatchResult.errors.map((e) => (
                    <li key={e.learnerId}>
                      <strong>{e.learnerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastDiplomeResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier certificat diplôme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastDiplomeResult.engineUsed}
              {lastDiplomeResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastDiplomeResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastDiplomeResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastDiplomeResult.certificateCode && (
              <div><strong>Code :</strong> <code className="bg-gray-100 px-1 rounded">{lastDiplomeResult.certificateCode}</code></div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Émargement individuel (per session+learner)                   */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <UserCheck className="h-5 w-5 text-sky-600" />
          Émargement individuel (par apprenant)
        </h2>
        <p className="text-sm text-muted-foreground">
          Variante per (session, apprenant) — cards bleu pâle par créneau avec
          l&apos;apprenant en bold. Vs émargement collectif (tableau par
          entreprise).
        </p>
      </div>

      <Card className="border-sky-200 bg-sky-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-sky-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reproduit l&apos;exemple Loris : Patrick ATTLAN, 2 créneaux
            matin/aprem du 10/01/2025, formateur Brigitte MARTINEAU, tous présents.
          </p>
          <Button
            onClick={handleGenerateEmargIndivMock}
            disabled={generatingEmargIndiv || generatingEmargIndivBatch}
            className="w-full gap-2 bg-sky-600 hover:bg-sky-700"
          >
            {generatingEmargIndiv ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un émargement individuel de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Émargement individuel — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="emarg-indiv-session-select" className="text-sm">Session</Label>
            <Select
              value={emargIndivSessionId}
              onValueChange={setEmargIndivSessionId}
              disabled={loadingSessions || generatingEmargIndiv}
            >
              <SelectTrigger id="emarg-indiv-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="emarg-indiv-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select
              value={emargIndivLearnerId}
              onValueChange={setEmargIndivLearnerId}
              disabled={!emargIndivSessionId || loadingEmargIndivLearners || generatingEmargIndiv}
            >
              <SelectTrigger id="emarg-indiv-learner-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !emargIndivSessionId
                      ? "Choisis d'abord une session"
                      : loadingEmargIndivLearners
                        ? "Chargement…"
                        : emargIndivLearners.length === 0
                          ? "Aucun apprenant inscrit"
                          : "Choisir un apprenant…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {emargIndivLearners.map((l) =>
                  l.learner ? (
                    <SelectItem key={l.learner_id} value={l.learner_id}>
                      {l.learner.last_name} {l.learner.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateEmargIndiv}
            disabled={!emargIndivSessionId || !emargIndivLearnerId || generatingEmargIndiv}
            className="w-full gap-2"
            size="lg"
          >
            {generatingEmargIndiv ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4" />
                Générer l&apos;émargement individuel
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 émargement individuel par apprenant</strong>.
            Sortie : 1 ZIP fail-soft.
          </p>
          <div>
            <Label htmlFor="emarg-indiv-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={emargIndivBatchSessionId}
              onValueChange={setEmargIndivBatchSessionId}
              disabled={loadingSessions || generatingEmargIndivBatch}
            >
              <SelectTrigger id="emarg-indiv-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateEmargIndivBatch}
            disabled={!emargIndivBatchSessionId || generatingEmargIndivBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingEmargIndivBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — tous les émargements individuels
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastEmargIndivBatchResult && (
        <Card
          className={
            lastEmargIndivBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastEmargIndivBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastEmargIndivBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch émargements indiv
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastEmargIndivBatchResult.successCount}</strong> /{" "}
              {lastEmargIndivBatchResult.totalLearners} émargements générés
            </div>
            <div>
              <strong>Signatures trouvées :</strong> {lastEmargIndivBatchResult.signedCount ?? 0}
            </div>
            <div>
              <strong>Latence totale :</strong> {lastEmargIndivBatchResult.totalLatencyMs} ms
            </div>
            {lastEmargIndivBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastEmargIndivBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastEmargIndivBatchResult.errors.map((e) => (
                    <li key={e.learnerId}>
                      <strong>{e.learnerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastEmargIndivResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier émargement individuel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastEmargIndivResult.engineUsed}
              {lastEmargIndivResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastEmargIndivResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastEmargIndivResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastEmargIndivResult.present !== undefined && (
              <div><strong>Statut :</strong> {lastEmargIndivResult.present ? "Présent" : "Absent"}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Attestation d'assiduité (per session+learner)                 */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <BadgeCheck className="h-5 w-5 text-lime-600" />
          Attestation d&apos;assiduité
        </h2>
        <p className="text-sm text-muted-foreground">
          Attestation par (session, apprenant). Heures réalisées + taux calculés
          depuis <code className="text-xs bg-gray-100 px-1 rounded">signatures</code> (MVP :
          présent = 100% du planned_hours, absent = 0%).
        </p>
      </div>

      <Card className="border-lime-200 bg-lime-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-lime-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reproduit l&apos;exemple Loris : Patrick ATTLAN, formation Managers de
            Proximité, 14h réalisées sur 14h, taux 100%.
          </p>
          <Button
            onClick={handleGenerateAttestMock}
            disabled={generatingAttest || generatingAttestBatch}
            className="w-full gap-2 bg-lime-600 hover:bg-lime-700"
          >
            {generatingAttest ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer une attestation de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attestation — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="attest-session-select" className="text-sm">Session</Label>
            <Select
              value={attestSessionId}
              onValueChange={setAttestSessionId}
              disabled={loadingSessions || generatingAttest}
            >
              <SelectTrigger id="attest-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="attest-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select
              value={attestLearnerId}
              onValueChange={setAttestLearnerId}
              disabled={!attestSessionId || loadingAttestLearners || generatingAttest}
            >
              <SelectTrigger id="attest-learner-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !attestSessionId
                      ? "Choisis d'abord une session"
                      : loadingAttestLearners
                        ? "Chargement…"
                        : attestLearners.length === 0
                          ? "Aucun apprenant inscrit"
                          : "Choisir un apprenant…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {attestLearners.map((l) =>
                  l.learner ? (
                    <SelectItem key={l.learner_id} value={l.learner_id}>
                      {l.learner.last_name} {l.learner.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateAttest}
            disabled={!attestSessionId || !attestLearnerId || generatingAttest}
            className="w-full gap-2"
            size="lg"
          >
            {generatingAttest ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <BadgeCheck className="h-4 w-4" />
                Générer l&apos;attestation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 attestation par apprenant</strong> inscrit. Statut
            présent/absent calculé depuis signatures (partagées). Sortie : 1 ZIP
            fail-soft.
          </p>
          <div>
            <Label htmlFor="attest-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={attestBatchSessionId}
              onValueChange={setAttestBatchSessionId}
              disabled={loadingSessions || generatingAttestBatch}
            >
              <SelectTrigger id="attest-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateAttestBatch}
            disabled={!attestBatchSessionId || generatingAttestBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingAttestBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les attestations
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastAttestBatchResult && (
        <Card
          className={
            lastAttestBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastAttestBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastAttestBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch attestations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastAttestBatchResult.successCount}</strong> /{" "}
              {lastAttestBatchResult.totalLearners} attestations générées
            </div>
            <div>
              <strong>Signatures trouvées :</strong> {lastAttestBatchResult.signedCount ?? 0}
            </div>
            <div>
              <strong>Latence totale :</strong> {lastAttestBatchResult.totalLatencyMs} ms
            </div>
            {lastAttestBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastAttestBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastAttestBatchResult.errors.map((e) => (
                    <li key={e.learnerId}>
                      <strong>{e.learnerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastAttestResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière attestation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastAttestResult.engineUsed}
              {lastAttestResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastAttestResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastAttestResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastAttestResult.present !== undefined && (
              <div><strong>Statut :</strong> {lastAttestResult.present ? "Présent (100%)" : "Absent (0%)"}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Certificat de réalisation (per session+learner)              */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Award className="h-5 w-5 text-yellow-600" />
          Certificat de réalisation
        </h2>
        <p className="text-sm text-muted-foreground">
          Certificat par (session, apprenant). Inclut le logo Ministère du
          Travail (à uploader dans <code className="text-xs bg-gray-100 px-1 rounded">public/ministere-du-travail.png</code>{" "}
          si pas déjà fait).
        </p>
      </div>

      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reproduit l&apos;exemple Loris : Patrick ATTLAN, UNICIL - 13006,
            formation Managers de Proximité, 10/01/2025, ACQUIS.
          </p>
          <Button
            onClick={handleGenerateCertifMock}
            disabled={generatingCertif || generatingCertifBatch}
            className="w-full gap-2 bg-yellow-600 hover:bg-yellow-700"
          >
            {generatingCertif ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un certificat de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificat — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="certif-session-select" className="text-sm">Session</Label>
            <Select
              value={certifSessionId}
              onValueChange={setCertifSessionId}
              disabled={loadingSessions || generatingCertif}
            >
              <SelectTrigger id="certif-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="certif-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select
              value={certifLearnerId}
              onValueChange={setCertifLearnerId}
              disabled={!certifSessionId || loadingCertifLearners || generatingCertif}
            >
              <SelectTrigger id="certif-learner-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !certifSessionId
                      ? "Choisis d'abord une session"
                      : loadingCertifLearners
                        ? "Chargement…"
                        : certifLearners.length === 0
                          ? "Aucun apprenant inscrit"
                          : "Choisir un apprenant…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {certifLearners.map((l) =>
                  l.learner ? (
                    <SelectItem key={l.learner_id} value={l.learner_id}>
                      {l.learner.last_name} {l.learner.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateCertif}
            disabled={!certifSessionId || !certifLearnerId || generatingCertif}
            className="w-full gap-2"
            size="lg"
          >
            {generatingCertif ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Award className="h-4 w-4" />
                Générer le certificat
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 certificat par apprenant</strong> inscrit. Chaque
            certificat porte le nom de l&apos;entreprise présentatrice (via
            enrollment.client_id). Sortie : 1 ZIP fail-soft.
          </p>
          <div>
            <Label htmlFor="certif-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={certifBatchSessionId}
              onValueChange={setCertifBatchSessionId}
              disabled={loadingSessions || generatingCertifBatch}
            >
              <SelectTrigger id="certif-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateCertifBatch}
            disabled={!certifBatchSessionId || generatingCertifBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingCertifBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — tous les certificats
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastCertifBatchResult && (
        <Card
          className={
            lastCertifBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastCertifBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastCertifBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch certificats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastCertifBatchResult.successCount}</strong> /{" "}
              {lastCertifBatchResult.totalLearners} certificats générés
            </div>
            <div>
              <strong>Latence totale :</strong> {lastCertifBatchResult.totalLatencyMs} ms
            </div>
            {lastCertifBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastCertifBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastCertifBatchResult.errors.map((e) => (
                    <li key={e.learnerId}>
                      <strong>{e.learnerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastCertifResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier certificat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastCertifResult.engineUsed}
              {lastCertifResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastCertifResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastCertifResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Convocation apprenant (per session+learner)                   */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <MailOpen className="h-5 w-5 text-teal-600" />
          Convocation apprenant
        </h2>
        <p className="text-sm text-muted-foreground">
          Convocation par (session, apprenant). Inclut un <strong>QR code</strong>{" "}
          (lib <code className="text-xs bg-gray-100 px-1 rounded">qrcode</code>) pointant
          vers <code className="text-xs bg-gray-100 px-1 rounded">/learner/sessions/{`{sessionId}`}</code>.
          Le détail des créneaux vient de <code className="text-xs bg-gray-100 px-1 rounded">formation_time_slots</code>{" "}
          (fallback matin/aprem si vide).
        </p>
      </div>

      <Card className="border-teal-200 bg-teal-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reproduit l&apos;exemple Loris : Patrick ATTLAN, formation Managers de
            Proximité, 10/01/2025 avec 2 créneaux matin + aprem, QR code vers
            l&apos;extranet apprenant.
          </p>
          <Button
            onClick={handleGenerateConvocMock}
            disabled={generatingConvoc || generatingConvocBatch}
            className="w-full gap-2 bg-teal-600 hover:bg-teal-700"
          >
            {generatingConvoc ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer une convocation de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convocation — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="convoc-session-select" className="text-sm">Session</Label>
            <Select
              value={convocSessionId}
              onValueChange={setConvocSessionId}
              disabled={loadingSessions || generatingConvoc}
            >
              <SelectTrigger id="convoc-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="convoc-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select
              value={convocLearnerId}
              onValueChange={setConvocLearnerId}
              disabled={!convocSessionId || loadingConvocLearners || generatingConvoc}
            >
              <SelectTrigger id="convoc-learner-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !convocSessionId
                      ? "Choisis d'abord une session"
                      : loadingConvocLearners
                        ? "Chargement…"
                        : convocLearners.length === 0
                          ? "Aucun apprenant inscrit"
                          : "Choisir un apprenant…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {convocLearners.map((l) =>
                  l.learner ? (
                    <SelectItem key={l.learner_id} value={l.learner_id}>
                      {l.learner.last_name} {l.learner.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateConvoc}
            disabled={!convocSessionId || !convocLearnerId || generatingConvoc}
            className="w-full gap-2"
            size="lg"
          >
            {generatingConvoc ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <MailOpen className="h-4 w-4" />
                Générer la convocation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 convocation par apprenant</strong> inscrit. Sortie : 1 ZIP.
            Le QR code pointe vers la <strong>même URL</strong> pour tous (l&apos;extranet
            auth-protégé distingue par login).
          </p>
          <div>
            <Label htmlFor="convoc-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={convocBatchSessionId}
              onValueChange={setConvocBatchSessionId}
              disabled={loadingSessions || generatingConvocBatch}
            >
              <SelectTrigger id="convoc-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateConvocBatch}
            disabled={!convocBatchSessionId || generatingConvocBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingConvocBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les convocations
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastConvocBatchResult && (
        <Card
          className={
            lastConvocBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastConvocBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastConvocBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch convocations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastConvocBatchResult.successCount}</strong> /{" "}
              {lastConvocBatchResult.totalLearners} convocations générées
            </div>
            <div>
              <strong>Latence totale :</strong> {lastConvocBatchResult.totalLatencyMs} ms
            </div>
            {lastConvocBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastConvocBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastConvocBatchResult.errors.map((e) => (
                    <li key={e.learnerId}>
                      <strong>{e.learnerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastConvocResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière convocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastConvocResult.engineUsed}
              {lastConvocResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastConvocResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastConvocResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Convention d'intervention (contrat sous-traitance formateur) */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <UserCog className="h-5 w-5 text-rose-600" />
          Convention d&apos;intervention formateur
        </h2>
        <p className="text-sm text-muted-foreground">
          Contrat de sous-traitance par (session, formateur). Données issues de{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">trainers</code> +{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">formation_trainers.agreed_cost_ht</code>{" "}
          (nouveaux champs — migration SQL{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">add_trainer_subcontracting_fields.sql</code>{" "}
          à jouer en prod).
        </p>
      </div>

      <Card className="border-rose-200 bg-rose-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-rose-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère un contrat avec formateur fake (Brigitte MARTINEAU, SIRET +
            NDA + extranet link + coût 1200€ HT). Permet de valider le rendu
            visuel <strong>sans avoir besoin de jouer la migration SQL</strong>.
          </p>
          <Button
            onClick={handleGenerateInterventionMock}
            disabled={generatingIntervention || generatingInterventionBatch}
            className="w-full gap-2 bg-rose-600 hover:bg-rose-700"
          >
            {generatingIntervention ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un contrat formateur de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contrat formateur — Données réelles (1 formateur)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="intervention-session-select" className="text-sm">Session</Label>
            <Select
              value={interventionSessionId}
              onValueChange={setInterventionSessionId}
              disabled={loadingSessions || generatingIntervention}
            >
              <SelectTrigger id="intervention-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="intervention-trainer-select" className="text-sm">Formateur rattaché</Label>
            <Select
              value={interventionTrainerId}
              onValueChange={setInterventionTrainerId}
              disabled={!interventionSessionId || loadingInterventionTrainers || generatingIntervention}
            >
              <SelectTrigger id="intervention-trainer-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !interventionSessionId
                      ? "Choisis d'abord une session"
                      : loadingInterventionTrainers
                        ? "Chargement…"
                        : interventionTrainers.length === 0
                          ? "Aucun formateur rattaché"
                          : "Choisir un formateur…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {interventionTrainers.map((t) =>
                  t.trainer ? (
                    <SelectItem key={t.trainer_id} value={t.trainer_id}>
                      {t.trainer.last_name} {t.trainer.first_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateIntervention}
            disabled={!interventionSessionId || !interventionTrainerId || generatingIntervention}
            className="w-full gap-2"
            size="lg"
          >
            {generatingIntervention ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <UserCog className="h-4 w-4" />
                Générer le contrat formateur
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les formateurs de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 contrat par formateur</strong> rattaché à la session.
            Sortie : 1 ZIP. Fail-soft si données manquantes (le PDF est généré
            avec [Placeholder] visible pour les champs vides).
          </p>
          <div>
            <Label htmlFor="intervention-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={interventionBatchSessionId}
              onValueChange={setInterventionBatchSessionId}
              disabled={loadingSessions || generatingInterventionBatch}
            >
              <SelectTrigger id="intervention-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateInterventionBatch}
            disabled={!interventionBatchSessionId || generatingInterventionBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingInterventionBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — tous les contrats formateurs
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastInterventionBatchResult && (
        <Card
          className={
            lastInterventionBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastInterventionBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastInterventionBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch contrats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastInterventionBatchResult.successCount}</strong> /{" "}
              {lastInterventionBatchResult.totalTrainers} contrats générés
            </div>
            <div>
              <strong>Latence totale :</strong> {lastInterventionBatchResult.totalLatencyMs} ms
            </div>
            {lastInterventionBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastInterventionBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastInterventionBatchResult.errors.map((e) => (
                    <li key={e.trainerId}>
                      <strong>{e.trainerName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastInterventionResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier contrat formateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastInterventionResult.engineUsed}
              {lastInterventionResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastInterventionResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastInterventionResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastInterventionResult.costHt != null && (
              <div><strong>Coût HT :</strong> {lastInterventionResult.costHt} €</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Règlement Intérieur (entity-only, statique)                  */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Gavel className="h-5 w-5 text-orange-700" />
          Règlement Intérieur
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (8 articles conformes aux articles L.6352-3/4 et
          R.6352-1 à 15 du Code du travail). Seul l&apos;organisme varie.
        </p>
      </div>

      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gavel className="h-4 w-4 text-orange-700" />
            Générer le Règlement Intérieur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF du Règlement Intérieur avec les infos de ton entité
            courante. Aussi disponible dans les espaces client + apprenant.
          </p>
          <Button
            onClick={handleGenerateRi}
            disabled={generatingRi}
            className="w-full gap-2 bg-orange-700 hover:bg-orange-800"
            size="lg"
          >
            {generatingRi ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gavel className="h-4 w-4" />
            )}
            Générer le Règlement Intérieur
          </Button>
        </CardContent>
      </Card>

      {lastRiResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier Règlement Intérieur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastRiResult.engineUsed}
              {lastRiResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastRiResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastRiResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    📂 DOCUMENTS OPTIONNELS — à la demande, pas par défaut        */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-16 mt-8 border-t-4 border-double border-gray-400">
        <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg p-4 mb-2">
          <h2 className="text-2xl font-bold text-gray-900">📂 Documents optionnels</h2>
          <p className="text-sm text-gray-700 mt-1">
            Documents générables à la demande (pas systématiquement utilisés).
            Préfigurent la section "Documents optionnels" du futur refactor de{" "}
            <code className="text-xs bg-white px-1 rounded">TabConventionDocs</code>.
          </p>
        </div>
      </div>

      {/* ────────── Résultats des évaluations ────────── */}

      <div className="pt-4">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <BarChart3 className="h-5 w-5 text-violet-600" />
          Résultats des évaluations
        </h2>
        <p className="text-sm text-muted-foreground">
          Tableau des évaluations complétées par un apprenant. Score calculé
          depuis <code className="text-xs bg-gray-100 px-1 rounded">questionnaire_responses</code> +{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">questions.options.correct_answer</code>.
          Passing score = 70%.
        </p>
      </div>

      <Card className="border-violet-200 bg-violet-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-violet-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + 3 évaluations fake (Quiz entrée 80% acquis,
            Atelier 80% acquis, Quiz final 55% non acquis).
          </p>
          <Button
            onClick={handleGenerateEvalResMock}
            disabled={generatingEvalRes || generatingEvalResBatch}
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
          >
            {generatingEvalRes ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer un PDF résultats de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Résultats — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="evalres-session-select" className="text-sm">Session</Label>
            <Select value={evalResSessionId} onValueChange={setEvalResSessionId}
              disabled={loadingSessions || generatingEvalRes}>
              <SelectTrigger id="evalres-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="evalres-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={evalResLearnerId} onValueChange={setEvalResLearnerId}
              disabled={!evalResSessionId || loadingEvalResLearners || generatingEvalRes}>
              <SelectTrigger id="evalres-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !evalResSessionId ? "Choisis d'abord une session"
                    : loadingEvalResLearners ? "Chargement…"
                      : evalResLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {evalResLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateEvalRes}
            disabled={!evalResSessionId || !evalResLearnerId || generatingEvalRes}
            className="w-full gap-2" size="lg">
            {generatingEvalRes ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><BarChart3 className="h-4 w-4" />Générer le PDF résultats</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 PDF résultats par apprenant</strong> inscrit. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="evalres-batch-session-select" className="text-sm">Session</Label>
            <Select value={evalResBatchSessionId} onValueChange={setEvalResBatchSessionId}
              disabled={loadingSessions || generatingEvalResBatch}>
              <SelectTrigger id="evalres-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateEvalResBatch}
            disabled={!evalResBatchSessionId || generatingEvalResBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingEvalResBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les résultats</>}
          </Button>
        </CardContent>
      </Card>

      {lastEvalResBatchResult && (
        <Card className={lastEvalResBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastEvalResBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastEvalResBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch résultats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastEvalResBatchResult.successCount}</strong> / {lastEvalResBatchResult.totalLearners} PDF générés</div>
            <div><strong>Latence totale :</strong> {lastEvalResBatchResult.totalLatencyMs} ms</div>
            {lastEvalResBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastEvalResBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastEvalResBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastEvalResResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier PDF résultats</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastEvalResResult.engineUsed}
              {lastEvalResResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastEvalResResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastEvalResResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastEvalResResult.evaluationsCount !== undefined && (
              <div><strong>Évaluations :</strong> {lastEvalResResult.evaluationsCount}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ────────── Attestation de compétences (OPTIONNEL) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <GraduationCap className="h-5 w-5 text-fuchsia-600" />
          Attestation de compétences
        </h2>
        <p className="text-sm text-muted-foreground">
          Attestation par (session, apprenant) délivrée par le formateur avec
          mention <strong>ACQUIS / EN COURS D&apos;ACQUISITION / NON ACQUIS</strong>{" "}
          (à entourer manuellement à l&apos;impression). Inclut signature
          intervenant si <code className="text-xs bg-gray-100 px-1 rounded">trainer.signature_url</code>{" "}
          renseigné, sinon ligne vide pour signature manuelle.
        </p>
      </div>

      <Card className="border-fuchsia-200 bg-fuchsia-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-fuchsia-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + Brigitte MARTINEAU + formation Managers Proximité.
            Fake signature SVG inline pour le mock.
          </p>
          <Button
            onClick={handleGenerateAttCompMock}
            disabled={generatingAttComp || generatingAttCompBatch}
            className="w-full gap-2 bg-fuchsia-600 hover:bg-fuchsia-700"
          >
            {generatingAttComp ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer attestation de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attestation compétences — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="attcomp-session-select" className="text-sm">Session</Label>
            <Select value={attCompSessionId} onValueChange={setAttCompSessionId}
              disabled={loadingSessions || generatingAttComp}>
              <SelectTrigger id="attcomp-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="attcomp-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={attCompLearnerId} onValueChange={setAttCompLearnerId}
              disabled={!attCompSessionId || loadingAttCompLearners || generatingAttComp}>
              <SelectTrigger id="attcomp-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !attCompSessionId ? "Choisis d'abord une session"
                    : loadingAttCompLearners ? "Chargement…"
                      : attCompLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {attCompLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAttComp}
            disabled={!attCompSessionId || !attCompLearnerId || generatingAttComp}
            className="w-full gap-2" size="lg">
            {generatingAttComp ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><GraduationCap className="h-4 w-4" />Générer attestation compétences</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 attestation par apprenant</strong> inscrit. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="attcomp-batch-session-select" className="text-sm">Session</Label>
            <Select value={attCompBatchSessionId} onValueChange={setAttCompBatchSessionId}
              disabled={loadingSessions || generatingAttCompBatch}>
              <SelectTrigger id="attcomp-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAttCompBatch}
            disabled={!attCompBatchSessionId || generatingAttCompBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingAttCompBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les attestations</>}
          </Button>
        </CardContent>
      </Card>

      {lastAttCompBatchResult && (
        <Card className={lastAttCompBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastAttCompBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastAttCompBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch attestations compétences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastAttCompBatchResult.successCount}</strong> / {lastAttCompBatchResult.totalLearners} attestations générées</div>
            <div><strong>Latence totale :</strong> {lastAttCompBatchResult.totalLatencyMs} ms</div>
            {lastAttCompBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastAttCompBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastAttCompBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastAttCompResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière attestation compétences</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastAttCompResult.engineUsed}
              {lastAttCompResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastAttCompResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastAttCompResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Autorisation de droit à l'image (OPTIONNEL) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Camera className="h-5 w-5 text-pink-600" />
          Autorisation de droit à l&apos;image
        </h2>
        <p className="text-sm text-muted-foreground">
          Autorisation signée par l&apos;apprenant pour exploitation des
          photos/vidéos prises pendant la formation. Signature apprenant =
          ligne vide pour signature manuelle (sera remplie par image quand
          Lot C 'Signatures unifiées' sera implémenté).
        </p>
      </div>

      <Card className="border-pink-200 bg-pink-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-pink-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + formation Managers Proximité + 10/01/2025 à UNICIL.
          </p>
          <Button
            onClick={handleGenerateAutoImgMock}
            disabled={generatingAutoImg || generatingAutoImgBatch}
            className="w-full gap-2 bg-pink-600 hover:bg-pink-700"
          >
            {generatingAutoImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer autorisation image de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autorisation image — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="autoimg-session-select" className="text-sm">Session</Label>
            <Select value={autoImgSessionId} onValueChange={setAutoImgSessionId}
              disabled={loadingSessions || generatingAutoImg}>
              <SelectTrigger id="autoimg-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="autoimg-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={autoImgLearnerId} onValueChange={setAutoImgLearnerId}
              disabled={!autoImgSessionId || loadingAutoImgLearners || generatingAutoImg}>
              <SelectTrigger id="autoimg-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !autoImgSessionId ? "Choisis d'abord une session"
                    : loadingAutoImgLearners ? "Chargement…"
                      : autoImgLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {autoImgLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAutoImg}
            disabled={!autoImgSessionId || !autoImgLearnerId || generatingAutoImg}
            className="w-full gap-2" size="lg">
            {generatingAutoImg ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Camera className="h-4 w-4" />Générer autorisation image</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 autorisation par apprenant</strong> inscrit. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="autoimg-batch-session-select" className="text-sm">Session</Label>
            <Select value={autoImgBatchSessionId} onValueChange={setAutoImgBatchSessionId}
              disabled={loadingSessions || generatingAutoImgBatch}>
              <SelectTrigger id="autoimg-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAutoImgBatch}
            disabled={!autoImgBatchSessionId || generatingAutoImgBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingAutoImgBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les autorisations</>}
          </Button>
        </CardContent>
      </Card>

      {lastAutoImgBatchResult && (
        <Card className={lastAutoImgBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastAutoImgBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastAutoImgBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch autorisations image
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastAutoImgBatchResult.successCount}</strong> / {lastAutoImgBatchResult.totalLearners} autorisations générées</div>
            <div><strong>Latence totale :</strong> {lastAutoImgBatchResult.totalLatencyMs} ms</div>
            {lastAutoImgBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastAutoImgBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastAutoImgBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastAutoImgResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière autorisation image</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastAutoImgResult.engineUsed}
              {lastAutoImgResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastAutoImgResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastAutoImgResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Lettre de décharge de responsabilité (OPTIONNEL) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <LogOut className="h-5 w-5 text-red-600" />
          Lettre de décharge de responsabilité
        </h2>
        <p className="text-sm text-muted-foreground">
          Signée par l&apos;apprenant qui quitte la formation de manière
          anticipée pour décharger l&apos;organisme de toute responsabilité.
          Signature apprenant = ligne vide MVP (Lot C remplira).
        </p>
      </div>

      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-red-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN quitte la formation Managers Proximité.
          </p>
          <Button
            onClick={handleGenerateDechMock}
            disabled={generatingDech || generatingDechBatch}
            className="w-full gap-2 bg-red-600 hover:bg-red-700"
          >
            {generatingDech ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer décharge de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Décharge — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="dech-session-select" className="text-sm">Session</Label>
            <Select value={dechSessionId} onValueChange={setDechSessionId}
              disabled={loadingSessions || generatingDech}>
              <SelectTrigger id="dech-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dech-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={dechLearnerId} onValueChange={setDechLearnerId}
              disabled={!dechSessionId || loadingDechLearners || generatingDech}>
              <SelectTrigger id="dech-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !dechSessionId ? "Choisis d'abord une session"
                    : loadingDechLearners ? "Chargement…"
                      : dechLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {dechLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateDech}
            disabled={!dechSessionId || !dechLearnerId || generatingDech}
            className="w-full gap-2" size="lg">
            {generatingDech ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><LogOut className="h-4 w-4" />Générer décharge</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 décharge par apprenant</strong> inscrit. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="dech-batch-session-select" className="text-sm">Session</Label>
            <Select value={dechBatchSessionId} onValueChange={setDechBatchSessionId}
              disabled={loadingSessions || generatingDechBatch}>
              <SelectTrigger id="dech-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateDechBatch}
            disabled={!dechBatchSessionId || generatingDechBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingDechBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les décharges</>}
          </Button>
        </CardContent>
      </Card>

      {lastDechBatchResult && (
        <Card className={lastDechBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastDechBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastDechBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch décharges
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastDechBatchResult.successCount}</strong> / {lastDechBatchResult.totalLearners} décharges générées</div>
            <div><strong>Latence totale :</strong> {lastDechBatchResult.totalLatencyMs} ms</div>
            {lastDechBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastDechBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastDechBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastDechResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière décharge</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastDechResult.engineUsed}
              {lastDechResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastDechResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastDechResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Réponses satisfaction apprenants (vue SESSION) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <TrendingUp className="h-5 w-5 text-amber-600" />
          Réponses satisfaction apprenants (vue session)
        </h2>
        <p className="text-sm text-muted-foreground">
          Rapport interne admin/Qualiopi <strong>per session</strong> (pas
          per-apprenant). Agrège satisfaction (note moy + distribution) +
          KPIs Qualiopi (taux complétion / satisfaction / acquisition) +
          résultats évaluations agrégés. <strong>Pas de mode batch</strong> —
          1 PDF par session.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            4 questions satisfaction (rating + yes/no) + KPIs Qualiopi
            (10/10 présents, 92% satisfaction, 90% acquisition) +
            3 évaluations agrégées (Quiz entrée 80%, Atelier 100%, Quiz final 78%).
          </p>
          <Button
            onClick={handleGenerateSatRepMock}
            disabled={generatingSatRep}
            className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
          >
            {generatingSatRep ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer rapport satisfaction de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapport satisfaction — Données réelles (1 session)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lit <code className="text-xs bg-gray-100 px-1 rounded">questionnaire_responses</code>{" "}
            (type satisfaction + evaluation) + <code className="text-xs bg-gray-100 px-1 rounded">signatures</code> pour calculer les indicateurs.
          </p>
          <div>
            <Label htmlFor="satrep-session-select" className="text-sm">Session</Label>
            <Select value={satRepSessionId} onValueChange={setSatRepSessionId}
              disabled={loadingSessions || generatingSatRep}>
              <SelectTrigger id="satrep-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateSatRep}
            disabled={!satRepSessionId || generatingSatRep}
            className="w-full gap-2" size="lg">
            {generatingSatRep ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><TrendingUp className="h-4 w-4" />Générer le rapport satisfaction</>}
          </Button>
        </CardContent>
      </Card>

      {lastSatRepResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier rapport satisfaction</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastSatRepResult.engineUsed}
              {lastSatRepResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastSatRepResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastSatRepResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
            {lastSatRepResult.qualiopi && (
              <div className="mt-2 pt-2 border-t border-green-200 text-xs space-y-0.5">
                <div><strong>Apprenants :</strong> {lastSatRepResult.qualiopi.totalLearners}</div>
                <div><strong>Taux complétion :</strong> {lastSatRepResult.qualiopi.completionRate.toFixed(1)} %</div>
                <div><strong>Taux satisfaction :</strong> {lastSatRepResult.qualiopi.satisfactionRate?.toFixed(1) ?? "—"} %</div>
                <div><strong>Taux acquisition :</strong> {lastSatRepResult.qualiopi.acquisitionRate?.toFixed(1) ?? "—"} %</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ────────── Charte du formateur (per TRAINER, pas session) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <BookMarked className="h-5 w-5 text-stone-600" />
          Charte du formateur
        </h2>
        <p className="text-sm text-muted-foreground">
          Code de conduite éthique signé par le formateur (19 engagements
          déontologiques). <strong>Per formateur, pas per session</strong> —
          signé une fois lors de l&apos;onboarding. Batch = 1 PDF par formateur
          de l&apos;entité.
        </p>
      </div>

      <Card className="border-stone-200 bg-stone-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-stone-700" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Brigitte MARTINEAU + fake signature SVG inline.
          </p>
          <Button
            onClick={handleGenerateCharteMock}
            disabled={generatingCharte || generatingCharteBatch}
            className="w-full gap-2 bg-stone-600 hover:bg-stone-700"
          >
            {generatingCharte ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer charte de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charte — Données réelles (1 formateur)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="charte-trainer-select" className="text-sm">Formateur de l&apos;entité</Label>
            <Select value={charteTrainerId} onValueChange={setCharteTrainerId}
              disabled={loadingAllTrainers || generatingCharte}>
              <SelectTrigger id="charte-trainer-select" className="mt-1">
                <SelectValue placeholder={
                  loadingAllTrainers ? "Chargement…"
                    : allTrainers.length === 0 ? "Aucun formateur dans cette entité"
                      : "Choisir un formateur…"
                } />
              </SelectTrigger>
              <SelectContent>
                {allTrainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.last_name} {t.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateCharte}
            disabled={!charteTrainerId || generatingCharte}
            className="w-full gap-2" size="lg">
            {generatingCharte ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><BookMarked className="h-4 w-4" />Générer charte</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les formateurs de l&apos;entité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 charte par formateur</strong> de l&apos;entité courante.
            Sortie : 1 ZIP fail-soft. Utile pour onboarding masse / mise à jour
            de la charte.
          </p>
          <Button onClick={handleGenerateCharteBatch}
            disabled={generatingCharteBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingCharteBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les chartes</>}
          </Button>
        </CardContent>
      </Card>

      {lastCharteBatchResult && (
        <Card className={lastCharteBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastCharteBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastCharteBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch chartes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastCharteBatchResult.successCount}</strong> / {lastCharteBatchResult.totalTrainers} chartes générées</div>
            <div><strong>Latence totale :</strong> {lastCharteBatchResult.totalLatencyMs} ms</div>
            {lastCharteBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastCharteBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastCharteBatchResult.errors.map((e) => (
                    <li key={e.trainerId}><strong>{e.trainerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastCharteResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière charte</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastCharteResult.engineUsed}
              {lastCharteResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastCharteResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastCharteResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Attestation AIPR (Autorisation Intervention Proximité Réseaux) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <HardHat className="h-5 w-5 text-yellow-700" />
          Attestation AIPR (intervention proximité réseaux)
        </h2>
        <p className="text-sm text-muted-foreground">
          Doc spécifique BTP — conforme article R. 554-31 du code de l&apos;environnement.
          Validité 5 ans. 3 domaines (Concepteur / Encadrant / Opérateur) à
          cocher manuellement à l&apos;impression. <strong>Nécessite la migration{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">add_learner_birth_city.sql</code>{" "}
          en prod</strong> (sinon le n° ticket d&apos;examen apparaîtra en placeholder).
        </p>
      </div>

      <Card className="border-yellow-300 bg-yellow-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-800" />
            Mode rapide — Données factices (2 variantes)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + UNICIL + ticket MARSEILLE + examen 10/01/2025.
            Le PDF V2 échec change juste 1 phrase ("a échoué" au lieu de "a réussi") — même template partagé.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleGenerateAiprMock}
              disabled={generatingAipr || generatingAiprBatch}
              className="gap-2 bg-yellow-700 hover:bg-yellow-800"
            >
              {generatingAipr ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Mock — RÉUSSITE
            </Button>
            <Button
              onClick={async () => {
                setGeneratingAipr(true);
                setLastAiprResult(null);
                try {
                  const res = await fetch("/api/documents/generate-attestation-aipr-echec-mock", { method: "POST" });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
                  setLastAiprResult({
                    engineUsed: json.engineUsed, cacheHit: json.cacheHit,
                    latencyMs: json.latencyMs, fileSizeBytes: json.fileSizeBytes,
                  });
                  const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
                  const blob = new Blob([bytes], { type: "application/pdf" });
                  window.open(URL.createObjectURL(blob), "_blank");
                  toast({ title: "AIPR échec mock générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
                } catch (err) {
                  toast({ title: "Échec mock AIPR échec", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
                } finally {
                  setGeneratingAipr(false);
                }
              }}
              disabled={generatingAipr || generatingAiprBatch}
              variant="outline"
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
            >
              {generatingAipr ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Mock — ÉCHEC
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AIPR — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="aipr-session-select" className="text-sm">Session</Label>
            <Select value={aiprSessionId} onValueChange={setAiprSessionId}
              disabled={loadingSessions || generatingAipr}>
              <SelectTrigger id="aipr-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="aipr-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={aiprLearnerId} onValueChange={setAiprLearnerId}
              disabled={!aiprSessionId || loadingAiprLearners || generatingAipr}>
              <SelectTrigger id="aipr-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !aiprSessionId ? "Choisis d'abord une session"
                    : loadingAiprLearners ? "Chargement…"
                      : aiprLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {aiprLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAipr}
            disabled={!aiprSessionId || !aiprLearnerId || generatingAipr}
            className="w-full gap-2" size="lg">
            {generatingAipr ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><HardHat className="h-4 w-4" />Générer AIPR</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 AIPR par apprenant</strong> inscrit. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="aipr-batch-session-select" className="text-sm">Session</Label>
            <Select value={aiprBatchSessionId} onValueChange={setAiprBatchSessionId}
              disabled={loadingSessions || generatingAiprBatch}>
              <SelectTrigger id="aipr-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAiprBatch}
            disabled={!aiprBatchSessionId || generatingAiprBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingAiprBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les AIPR</>}
          </Button>
        </CardContent>
      </Card>

      {lastAiprBatchResult && (
        <Card className={lastAiprBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastAiprBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastAiprBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch AIPR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastAiprBatchResult.successCount}</strong> / {lastAiprBatchResult.totalLearners} AIPR générées</div>
            <div><strong>Latence totale :</strong> {lastAiprBatchResult.totalLatencyMs} ms</div>
            {lastAiprBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastAiprBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastAiprBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastAiprResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière AIPR</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastAiprResult.engineUsed}
              {lastAiprResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastAiprResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastAiprResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Avis Habilitation Électrique (per session+learner) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-amber-700" />
          Avis Habilitation Électrique
        </h2>
        <p className="text-sm text-muted-foreground">
          Doc BTP — 2 pages : (1) Avis après formation à la prévention du
          risque électrique (norme NF C 18-510 A1) + (2) Titre d&apos;habilitation
          électrique (tableau vide à remplir par l&apos;employeur). Validité 3 ans.
          Checkboxes Initiale/Recyclage + Favorable/Défavorable à cocher
          manuellement.
        </p>
      </div>

      <Card className="border-amber-300 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + Habilitation B1V-B2V-BR-BC + Brigitte MARTINEAU.
          </p>
          <Button
            onClick={handleGenerateHabilMock}
            disabled={generatingHabil || generatingHabilBatch}
            className="w-full gap-2 bg-amber-700 hover:bg-amber-800"
          >
            {generatingHabil ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer avis habilitation de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avis habilitation — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="habil-session-select" className="text-sm">Session</Label>
            <Select value={habilSessionId} onValueChange={setHabilSessionId}
              disabled={loadingSessions || generatingHabil}>
              <SelectTrigger id="habil-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="habil-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={habilLearnerId} onValueChange={setHabilLearnerId}
              disabled={!habilSessionId || loadingHabilLearners || generatingHabil}>
              <SelectTrigger id="habil-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !habilSessionId ? "Choisis d'abord une session"
                    : loadingHabilLearners ? "Chargement…"
                      : habilLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {habilLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabil}
            disabled={!habilSessionId || !habilLearnerId || generatingHabil}
            className="w-full gap-2" size="lg">
            {generatingHabil ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Zap className="h-4 w-4" />Générer avis habilitation</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 avis habilitation par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="habil-batch-session-select" className="text-sm">Session</Label>
            <Select value={habilBatchSessionId} onValueChange={setHabilBatchSessionId}
              disabled={loadingSessions || generatingHabilBatch}>
              <SelectTrigger id="habil-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabilBatch}
            disabled={!habilBatchSessionId || generatingHabilBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingHabilBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les avis</>}
          </Button>
        </CardContent>
      </Card>

      {lastHabilBatchResult && (
        <Card className={lastHabilBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastHabilBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastHabilBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch avis habilitation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastHabilBatchResult.successCount}</strong> / {lastHabilBatchResult.totalLearners} avis générés</div>
            <div><strong>Latence totale :</strong> {lastHabilBatchResult.totalLatencyMs} ms</div>
            {lastHabilBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastHabilBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastHabilBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastHabilResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier avis habilitation</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastHabilResult.engineUsed}
              {lastHabilResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastHabilResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastHabilResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Bilan de fin de POE (per session+learner) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <BookMarked className="h-5 w-5 text-teal-700" />
          Bilan de fin de POE
        </h2>
        <p className="text-sm text-muted-foreground">
          Doc POE (Préparation Opérationnelle à l&apos;Emploi) — similaire à
          l&apos;attestation d&apos;assiduité avec mention des objectifs
          pédagogiques. Réutilise les heures réalisées et le taux de réalisation
          basés sur les émargements.
        </p>
      </div>

      <Card className="border-teal-300 bg-teal-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + POE Managers de Proximité (35h, 5 objectifs).
          </p>
          <Button
            onClick={handleGenerateBilanPoeMock}
            disabled={generatingBilanPoe || generatingBilanPoeBatch}
            className="w-full gap-2 bg-teal-700 hover:bg-teal-800"
          >
            {generatingBilanPoe ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer bilan POE de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bilan POE — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="bilan-poe-session-select" className="text-sm">Session</Label>
            <Select value={bilanPoeSessionId} onValueChange={setBilanPoeSessionId}
              disabled={loadingSessions || generatingBilanPoe}>
              <SelectTrigger id="bilan-poe-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bilan-poe-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={bilanPoeLearnerId} onValueChange={setBilanPoeLearnerId}
              disabled={!bilanPoeSessionId || loadingBilanPoeLearners || generatingBilanPoe}>
              <SelectTrigger id="bilan-poe-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !bilanPoeSessionId ? "Choisis d'abord une session"
                    : loadingBilanPoeLearners ? "Chargement…"
                      : bilanPoeLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {bilanPoeLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateBilanPoe}
            disabled={!bilanPoeSessionId || !bilanPoeLearnerId || generatingBilanPoe}
            className="w-full gap-2" size="lg">
            {generatingBilanPoe ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><BookMarked className="h-4 w-4" />Générer bilan POE</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 bilan POE par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="bilan-poe-batch-session-select" className="text-sm">Session</Label>
            <Select value={bilanPoeBatchSessionId} onValueChange={setBilanPoeBatchSessionId}
              disabled={loadingSessions || generatingBilanPoeBatch}>
              <SelectTrigger id="bilan-poe-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateBilanPoeBatch}
            disabled={!bilanPoeBatchSessionId || generatingBilanPoeBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingBilanPoeBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les bilans</>}
          </Button>
        </CardContent>
      </Card>

      {lastBilanPoeBatchResult && (
        <Card className={lastBilanPoeBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastBilanPoeBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastBilanPoeBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch bilans POE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastBilanPoeBatchResult.successCount}</strong> / {lastBilanPoeBatchResult.totalLearners} bilans générés</div>
            {typeof lastBilanPoeBatchResult.signedCount === "number" && (
              <div><strong>Apprenants ayant émargé :</strong> {lastBilanPoeBatchResult.signedCount}</div>
            )}
            <div><strong>Latence totale :</strong> {lastBilanPoeBatchResult.totalLatencyMs} ms</div>
            {lastBilanPoeBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastBilanPoeBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastBilanPoeBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastBilanPoeResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier bilan POE</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastBilanPoeResult.engineUsed}
              {lastBilanPoeResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastBilanPoeResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastBilanPoeResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Avis Habilitation Électrique BT (variante INITIAL BT) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-orange-700" />
          Avis Habilitation Électrique — INITIAL BT
        </h2>
        <p className="text-sm text-muted-foreground">
          Variante BT (Basse Tension) — référence <strong>norme NF C 18-510 A2</strong>.
          Symboles habilitation : BO-H0-H0V (non élec), BS-BR (intervention BT),
          BE Manoeuvre (opérations spécifiques). 2 pages comme la version
          précédente.
        </p>
      </div>

      <Card className="border-orange-300 bg-orange-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + Habilitation INITIAL BT + Brigitte MARTINEAU.
          </p>
          <Button
            onClick={handleGenerateHabilBtMock}
            disabled={generatingHabilBt || generatingHabilBtBatch}
            className="w-full gap-2 bg-orange-700 hover:bg-orange-800"
          >
            {generatingHabilBt ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer avis habilitation BT de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avis habilitation BT — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="habil-bt-session-select" className="text-sm">Session</Label>
            <Select value={habilBtSessionId} onValueChange={setHabilBtSessionId}
              disabled={loadingSessions || generatingHabilBt}>
              <SelectTrigger id="habil-bt-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="habil-bt-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={habilBtLearnerId} onValueChange={setHabilBtLearnerId}
              disabled={!habilBtSessionId || loadingHabilBtLearners || generatingHabilBt}>
              <SelectTrigger id="habil-bt-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !habilBtSessionId ? "Choisis d'abord une session"
                    : loadingHabilBtLearners ? "Chargement…"
                      : habilBtLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {habilBtLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabilBt}
            disabled={!habilBtSessionId || !habilBtLearnerId || generatingHabilBt}
            className="w-full gap-2" size="lg">
            {generatingHabilBt ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Zap className="h-4 w-4" />Générer avis habilitation BT</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 avis habilitation BT par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="habil-bt-batch-session-select" className="text-sm">Session</Label>
            <Select value={habilBtBatchSessionId} onValueChange={setHabilBtBatchSessionId}
              disabled={loadingSessions || generatingHabilBtBatch}>
              <SelectTrigger id="habil-bt-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabilBtBatch}
            disabled={!habilBtBatchSessionId || generatingHabilBtBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingHabilBtBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les avis BT</>}
          </Button>
        </CardContent>
      </Card>

      {lastHabilBtBatchResult && (
        <Card className={lastHabilBtBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastHabilBtBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastHabilBtBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch avis habilitation BT
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastHabilBtBatchResult.successCount}</strong> / {lastHabilBtBatchResult.totalLearners} avis générés</div>
            <div><strong>Latence totale :</strong> {lastHabilBtBatchResult.totalLatencyMs} ms</div>
            {lastHabilBtBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastHabilBtBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastHabilBtBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastHabilBtResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier avis habilitation BT</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastHabilBtResult.engineUsed}
              {lastHabilBtResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastHabilBtResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastHabilBtResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Certificat Travail en Hauteur (per session+learner) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <HardHat className="h-5 w-5 text-sky-700" />
          Certificat Travail en Hauteur
        </h2>
        <p className="text-sm text-muted-foreground">
          Attestation de fin de formation pour <strong>Travail en hauteur et
          port du harnais</strong>. Titre + objectifs pédagogiques hardcodés
          (spécifiques à cette formation). Reste dynamique : organisme,
          apprenant, dates, durée, lieu, entreprise présentatrice.
        </p>
      </div>

      <Card className="border-sky-300 bg-sky-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-sky-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + UNICIL + Travail en hauteur (4h, 29/04/2026).
          </p>
          <Button
            onClick={handleGenerateHauteurMock}
            disabled={generatingHauteur || generatingHauteurBatch}
            className="w-full gap-2 bg-sky-700 hover:bg-sky-800"
          >
            {generatingHauteur ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer certificat hauteur de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificat hauteur — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="hauteur-session-select" className="text-sm">Session</Label>
            <Select value={hauteurSessionId} onValueChange={setHauteurSessionId}
              disabled={loadingSessions || generatingHauteur}>
              <SelectTrigger id="hauteur-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="hauteur-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={hauteurLearnerId} onValueChange={setHauteurLearnerId}
              disabled={!hauteurSessionId || loadingHauteurLearners || generatingHauteur}>
              <SelectTrigger id="hauteur-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !hauteurSessionId ? "Choisis d'abord une session"
                    : loadingHauteurLearners ? "Chargement…"
                      : hauteurLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {hauteurLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHauteur}
            disabled={!hauteurSessionId || !hauteurLearnerId || generatingHauteur}
            className="w-full gap-2" size="lg">
            {generatingHauteur ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><HardHat className="h-4 w-4" />Générer certificat hauteur</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 certificat par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="hauteur-batch-session-select" className="text-sm">Session</Label>
            <Select value={hauteurBatchSessionId} onValueChange={setHauteurBatchSessionId}
              disabled={loadingSessions || generatingHauteurBatch}>
              <SelectTrigger id="hauteur-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHauteurBatch}
            disabled={!hauteurBatchSessionId || generatingHauteurBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingHauteurBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les certificats</>}
          </Button>
        </CardContent>
      </Card>

      {lastHauteurBatchResult && (
        <Card className={lastHauteurBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastHauteurBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastHauteurBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch certificats hauteur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastHauteurBatchResult.successCount}</strong> / {lastHauteurBatchResult.totalLearners} certificats générés</div>
            <div><strong>Latence totale :</strong> {lastHauteurBatchResult.totalLatencyMs} ms</div>
            {lastHauteurBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastHauteurBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastHauteurBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastHauteurResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier certificat hauteur</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastHauteurResult.engineUsed}
              {lastHauteurResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastHauteurResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastHauteurResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Avis Habilitation Électrique BF-HF (Non électrique) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-yellow-700" />
          Avis Habilitation Électrique — BF-HF / H0-B0
        </h2>
        <p className="text-sm text-muted-foreground">
          3ème variante — <strong>Travaux d&apos;Ordre NON ELECTRIQUE</strong>.
          Norme NF C 18-510 A1. Symboles habilitation :{" "}
          <strong>BF-HF / H0-B0</strong> uniquement sur les lignes Non
          électrique (le reste vide).
        </p>
      </div>

      <Card className="border-yellow-300 bg-yellow-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN + Habilitation BF-HF / H0-B0 (7h) + Brigitte MARTINEAU.
          </p>
          <Button
            onClick={handleGenerateHabilBfHfMock}
            disabled={generatingHabilBfHf || generatingHabilBfHfBatch}
            className="w-full gap-2 bg-yellow-700 hover:bg-yellow-800"
          >
            {generatingHabilBfHf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer avis habilitation BF-HF de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avis habilitation BF-HF — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="habil-bf-hf-session-select" className="text-sm">Session</Label>
            <Select value={habilBfHfSessionId} onValueChange={setHabilBfHfSessionId}
              disabled={loadingSessions || generatingHabilBfHf}>
              <SelectTrigger id="habil-bf-hf-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="habil-bf-hf-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={habilBfHfLearnerId} onValueChange={setHabilBfHfLearnerId}
              disabled={!habilBfHfSessionId || loadingHabilBfHfLearners || generatingHabilBfHf}>
              <SelectTrigger id="habil-bf-hf-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !habilBfHfSessionId ? "Choisis d'abord une session"
                    : loadingHabilBfHfLearners ? "Chargement…"
                      : habilBfHfLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {habilBfHfLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabilBfHf}
            disabled={!habilBfHfSessionId || !habilBfHfLearnerId || generatingHabilBfHf}
            className="w-full gap-2" size="lg">
            {generatingHabilBfHf ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Zap className="h-4 w-4" />Générer avis habilitation BF-HF</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 avis habilitation BF-HF par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="habil-bf-hf-batch-session-select" className="text-sm">Session</Label>
            <Select value={habilBfHfBatchSessionId} onValueChange={setHabilBfHfBatchSessionId}
              disabled={loadingSessions || generatingHabilBfHfBatch}>
              <SelectTrigger id="habil-bf-hf-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateHabilBfHfBatch}
            disabled={!habilBfHfBatchSessionId || generatingHabilBfHfBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingHabilBfHfBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — tous les avis BF-HF</>}
          </Button>
        </CardContent>
      </Card>

      {lastHabilBfHfBatchResult && (
        <Card className={lastHabilBfHfBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastHabilBfHfBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastHabilBfHfBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch avis habilitation BF-HF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastHabilBfHfBatchResult.successCount}</strong> / {lastHabilBfHfBatchResult.totalLearners} avis générés</div>
            <div><strong>Latence totale :</strong> {lastHabilBfHfBatchResult.totalLatencyMs} ms</div>
            {lastHabilBfHfBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastHabilBfHfBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastHabilBfHfBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastHabilBfHfResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernier avis habilitation BF-HF</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastHabilBfHfResult.engineUsed}
              {lastHabilBfHfResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastHabilBfHfResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastHabilBfHfResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}

      {/* ────────── Attestation d'abandon de formation (per session+learner) ────────── */}

      <div className="pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <LogOut className="h-5 w-5 text-rose-700" />
          Attestation d&apos;abandon de formation
        </h2>
        <p className="text-sm text-muted-foreground">
          Constate officiellement qu&apos;un stagiaire a interrompu la formation
          avant son terme. Utile pour la facturation prorata et le dossier OPCO.
          Heures effectivement suivies = basées sur les émargements (signedLearnerIds).
          Date d&apos;abandon + motif (☐) : à remplir à la main après impression.
        </p>
      </div>

      <Card className="border-rose-300 bg-rose-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-rose-800" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Patrick ATTLAN abandonne POE Managers Proximité (14h, mock affiche 14/14).
          </p>
          <Button
            onClick={handleGenerateAbandonMock}
            disabled={generatingAbandon || generatingAbandonBatch}
            className="w-full gap-2 bg-rose-700 hover:bg-rose-800"
          >
            {generatingAbandon ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Générer attestation abandon de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attestation abandon — Données réelles (1 apprenant)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="abandon-session-select" className="text-sm">Session</Label>
            <Select value={abandonSessionId} onValueChange={setAbandonSessionId}
              disabled={loadingSessions || generatingAbandon}>
              <SelectTrigger id="abandon-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="abandon-learner-select" className="text-sm">Apprenant inscrit</Label>
            <Select value={abandonLearnerId} onValueChange={setAbandonLearnerId}
              disabled={!abandonSessionId || loadingAbandonLearners || generatingAbandon}>
              <SelectTrigger id="abandon-learner-select" className="mt-1">
                <SelectValue placeholder={
                  !abandonSessionId ? "Choisis d'abord une session"
                    : loadingAbandonLearners ? "Chargement…"
                      : abandonLearners.length === 0 ? "Aucun apprenant inscrit"
                        : "Choisir un apprenant…"
                } />
              </SelectTrigger>
              <SelectContent>
                {abandonLearners.map((l) => l.learner ? (
                  <SelectItem key={l.learner_id} value={l.learner_id}>
                    {l.learner.last_name} {l.learner.first_name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAbandon}
            disabled={!abandonSessionId || !abandonLearnerId || generatingAbandon}
            className="w-full gap-2" size="lg">
            {generatingAbandon ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><LogOut className="h-4 w-4" />Générer attestation abandon</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — tous les apprenants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>1 attestation d&apos;abandon par apprenant</strong>. Sortie : 1 ZIP.
          </p>
          <div>
            <Label htmlFor="abandon-batch-session-select" className="text-sm">Session</Label>
            <Select value={abandonBatchSessionId} onValueChange={setAbandonBatchSessionId}
              disabled={loadingSessions || generatingAbandonBatch}>
              <SelectTrigger id="abandon-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAbandonBatch}
            disabled={!abandonBatchSessionId || generatingAbandonBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg">
            {generatingAbandonBatch ? <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
              : <><Package className="h-4 w-4" />Générer ZIP — toutes les attestations</>}
          </Button>
        </CardContent>
      </Card>

      {lastAbandonBatchResult && (
        <Card className={lastAbandonBatchResult.failureCount === 0
          ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader>
            <CardTitle className={"text-base " + (lastAbandonBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")}>
              {lastAbandonBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch attestations abandon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><strong>{lastAbandonBatchResult.successCount}</strong> / {lastAbandonBatchResult.totalLearners} attestations générées</div>
            <div><strong>Latence totale :</strong> {lastAbandonBatchResult.totalLatencyMs} ms</div>
            {lastAbandonBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs ({lastAbandonBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastAbandonBatchResult.errors.map((e) => (
                    <li key={e.learnerId}><strong>{e.learnerName}</strong> : {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastAbandonResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader><CardTitle className="text-base text-green-900">✅ Dernière attestation abandon</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastAbandonResult.engineUsed}
              {lastAbandonResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚡ Cache hit</span>
              )}
            </div>
            <div><strong>Latence :</strong> {lastAbandonResult.latencyMs} ms</div>
            <div><strong>Taille PDF :</strong> {(lastAbandonResult.fileSizeBytes / 1024).toFixed(1)} KB</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
