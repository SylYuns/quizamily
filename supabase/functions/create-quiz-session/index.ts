// Crée une session de quiz pour une famille : pioche pondérée d'un seul fait à poser (voir
// pioche.ts — une session = une seule question), puis crée la session + la question + les
// destinataires.
//
// Déclenchement manuel pour l'instant (pas de tâche planifiée) : appelée depuis l'app par
// un membre de la famille. ctx.supabaseAdmin (service role) est nécessaire car
// quiz_sessions/quiz_questions/question_recipients n'ont pas de policy d'écriture pour les
// utilisateurs (voir supabase/migrations/20261106130000_rls_policies.sql) — ces tables sont
// gérées par le système, pas modifiables directement par les joueurs.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

import { FactCandidate, pickWeightedFact } from "./pioche.ts";

const SESSION_DURATION_DAYS = 7;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const familyId = body?.family_id;
    if (!familyId || typeof familyId !== "string") {
      return Response.json({ error: "family_id manquant." }, { status: 400 });
    }

    // Vérifie l'appartenance à la famille via le client RLS-scopé (pas l'admin) : si cette
    // requête ne renvoie rien, soit la famille n'existe pas, soit l'appelant n'en fait pas partie.
    const { data: membership } = await ctx.supabase
      .from("persons")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", userId)
      .eq("kind", "player")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return Response.json({ error: "Famille introuvable ou accès refusé." }, { status: 403 });
    }

    const admin = ctx.supabaseAdmin;

    const { data: openSession } = await admin
      .from("quiz_sessions")
      .select("id")
      .eq("family_id", familyId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openSession) {
      return Response.json(
        { error: "Une session de quiz est déjà en cours pour cette famille." },
        { status: 409 },
      );
    }

    const { data: facts, error: factsError } = await admin
      .from("facts")
      .select("id, author_person_id, subject_person_id, answer_value, question_templates (answer_input_kind)")
      .eq("family_id", familyId)
      .eq("status", "active");
    if (factsError) {
      return Response.json({ error: factsError.message }, { status: 500 });
    }

    const { data: persons, error: personsError } = await admin
      .from("persons")
      .select("id, is_central, kind")
      .eq("family_id", familyId);
    if (personsError) {
      return Response.json({ error: personsError.message }, { status: 500 });
    }
    const isCentralById = new Map((persons ?? []).map((p) => [p.id, p.is_central]));
    const playerIds = (persons ?? []).filter((p) => p.kind === "player").map((p) => p.id);

    const { data: sessions } = await admin.from("quiz_sessions").select("id, status").eq("family_id", familyId);
    const sessionStatusById = new Map((sessions ?? []).map((s) => [s.id, s.status]));
    const sessionIds = (sessions ?? []).map((s) => s.id);

    const posedByFactId = new Map<string, { lastPosedAt: string; hasOpen: boolean }>();
    if (sessionIds.length > 0) {
      const { data: pastQuestions } = await admin
        .from("quiz_questions")
        .select("fact_id, created_at, session_id")
        .in("session_id", sessionIds);

      for (const q of pastQuestions ?? []) {
        const status = sessionStatusById.get(q.session_id);
        const existing = posedByFactId.get(q.fact_id);
        const isOpen = status === "open";
        if (!existing) {
          posedByFactId.set(q.fact_id, { lastPosedAt: q.created_at, hasOpen: isOpen });
        } else {
          posedByFactId.set(q.fact_id, {
            lastPosedAt: q.created_at > existing.lastPosedAt ? q.created_at : existing.lastPosedAt,
            hasOpen: existing.hasOpen || isOpen,
          });
        }
      }
    }

    type FactRow = {
      id: string;
      author_person_id: string;
      subject_person_id: string;
      answer_value: string | number;
      question_templates: { answer_input_kind: string } | { answer_input_kind: string }[] | null;
    };

    function templateKindOf(row: FactRow): string {
      const t = row.question_templates;
      if (Array.isArray(t)) return t[0]?.answer_input_kind ?? "";
      return t?.answer_input_kind ?? "";
    }

    const eligibleFacts = ((facts ?? []) as FactRow[]).filter((f) => !posedByFactId.get(f.id)?.hasOpen);

    const candidates: FactCandidate[] = eligibleFacts.map((f) => ({
      id: f.id,
      authorPersonId: f.author_person_id,
      isCentralSubject: isCentralById.get(f.subject_person_id) ?? false,
      lastPosedAt: posedByFactId.get(f.id)?.lastPosedAt ?? null,
    }));

    const picked = pickWeightedFact(candidates);

    if (!picked) {
      return Response.json(
        { error: "Pas assez de faits disponibles pour créer une session." },
        { status: 422 },
      );
    }

    const fact = eligibleFacts.find((f) => f.id === picked.id)!;

    const now = new Date();
    const closesAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { data: session, error: sessionError } = await admin
      .from("quiz_sessions")
      .insert({ family_id: familyId, status: "open", opens_at: now.toISOString(), closes_at: closesAt.toISOString() })
      .select()
      .single();
    if (sessionError || !session) {
      return Response.json({ error: sessionError?.message ?? "Échec de création de la session." }, { status: 500 });
    }

    const kind = templateKindOf(fact);
    const { data: question, error: questionError } = await admin
      .from("quiz_questions")
      .insert({
        session_id: session.id,
        fact_id: fact.id,
        answer_value_snapshot: fact.answer_value,
        validator_person_id: kind === "free_text" ? fact.author_person_id : null,
      })
      .select()
      .single();
    if (questionError || !question) {
      return Response.json({ error: questionError?.message ?? "Échec de création de la question." }, { status: 500 });
    }

    const recipientsToInsert = playerIds
      .filter((personId) => personId !== fact.author_person_id)
      .map((personId) => ({ quiz_question_id: question.id, person_id: personId, result: "unanswered" }));

    if (recipientsToInsert.length > 0) {
      const { error: recipientsError } = await admin.from("question_recipients").insert(recipientsToInsert);
      if (recipientsError) {
        return Response.json({ error: recipientsError.message }, { status: 500 });
      }
    }

    return Response.json({
      sessionId: session.id,
      closesAt: session.closes_at,
      factId: fact.id,
      recipientsCreated: recipientsToInsert.length,
    });
  }),
};
