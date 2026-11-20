// Tests de la répartition du catalogue pour l'écran « Ajouter un souvenir ».
// Lancer : npm run test:add-fact-catalog  (Node 22.6+)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAddFactCatalog, matchesCondition, type SubjectFact } from "./add-fact-catalog.ts";
import { CATEGORY_ORDER } from "../constants/categories.ts";
import type { Template } from "../types/question-template.ts";

// Enveloppe buildAddFactCatalog avec le vrai CATEGORY_ORDER (fourni par l'appelant dans le
// module réel, voir add-fact-catalog.ts), pour ne pas le répéter dans chaque test.
function run(params: Omit<Parameters<typeof buildAddFactCatalog>[0], "categoryOrder">) {
  return buildAddFactCatalog({ ...params, categoryOrder: CATEGORY_ORDER });
}

function template(over: Partial<Template> & { id: string; category: string }): Template {
  return {
    template_text: "texte",
    answer_input_kind: "text",
    list_name: null,
    related_role: null,
    slots: null,
    condition: null,
    recap: null,
    ...over,
  };
}

function fact(over: Partial<SubjectFact> & { id: string; template_id: string }): SubjectFact {
  return {
    author_person_id: "me",
    related_person_id: null,
    slot_values: null,
    status: "not_posed",
    ...over,
  };
}

const subject = { gender: "femme" as const, is_deceased: false };

describe("matchesCondition", () => {
  it("accepte une question sans condition", () => {
    assert.equal(matchesCondition(null, subject, false), true);
  });
  it("filtre par genre", () => {
    assert.equal(matchesCondition("homme", subject, false), false);
    assert.equal(matchesCondition("femme", subject, false), true);
  });
  it("filtre par adelphie", () => {
    assert.equal(matchesCondition("a des frères ou sœurs", subject, false), false);
    assert.equal(matchesCondition("a des frères ou sœurs", subject, true), true);
  });
});

describe("buildAddFactCatalog", () => {
  it("compte les souvenirs révélés et en réserve", () => {
    const templates = [template({ id: "t1", category: "jeunesse" })];
    const facts: SubjectFact[] = [
      fact({ id: "f1", template_id: "t1", status: "revealed" }),
    ];
    const { counts } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    assert.deepEqual(counts, { revealed: 1, reserve: 0 });
  });

  it("une question simple disparaît de « à renseigner » dès qu'un fait existe", () => {
    const templates = [template({ id: "t1", category: "jeunesse" })];
    const facts: SubjectFact[] = [fact({ id: "f1", template_id: "t1" })];
    const { categories } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    const jeunesse = categories.find((c) => c.category === "jeunesse")!;
    assert.equal(jeunesse.available.length, 0);
    assert.equal(jeunesse.mine.length, 1);
    assert.equal(jeunesse.isComplete, true);
  });

  it("une question à slot reste toujours disponible", () => {
    const templates = [template({ id: "t1", category: "retraite-voyages-loisirs", slots: ["pays"] })];
    const facts: SubjectFact[] = [fact({ id: "f1", template_id: "t1", status: "revealed" })];
    const { categories } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    const cat = categories.find((c) => c.category === "retraite-voyages-loisirs")!;
    assert.equal(cat.available.length, 1);
    assert.equal(cat.isComplete, false);
    assert.equal(cat.others.length, 1);
  });

  it("une question à personne liée reste toujours disponible", () => {
    const templates = [template({ id: "t1", category: "couple-installation", related_role: "conjoint" })];
    const facts: SubjectFact[] = [fact({ id: "f1", template_id: "t1", status: "not_posed" })];
    const { categories } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    const cat = categories.find((c) => c.category === "couple-installation")!;
    assert.equal(cat.available.length, 1);
    assert.equal(cat.mine.length, 1);
  });

  it("sépare mes questions pas encore posées des questions des autres / déjà posées", () => {
    const templates = [
      template({ id: "t1", category: "jeunesse" }),
      template({ id: "t2", category: "jeunesse" }),
      template({ id: "t3", category: "jeunesse" }),
    ];
    const facts: SubjectFact[] = [
      fact({ id: "f1", template_id: "t1", author_person_id: "me", status: "not_posed" }),
      fact({ id: "f2", template_id: "t2", author_person_id: "autre", status: "not_posed" }),
      fact({ id: "f3", template_id: "t3", author_person_id: "me", status: "revealed" }),
    ];
    const { categories } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    const jeunesse = categories.find((c) => c.category === "jeunesse")!;
    assert.deepEqual(
      jeunesse.mine.map((f) => f.id),
      ["f1"],
    );
    assert.deepEqual(
      jeunesse.others.map((f) => f.id).sort(),
      ["f2", "f3"],
    );
  });

  it("filtre les templates qui ne correspondent pas à la condition du sujet", () => {
    const templates = [template({ id: "t1", category: "jeunesse", condition: "homme" })];
    const { categories } = run({ templates, facts: [], subject, hasSibling: false, myPersonId: "me" });
    assert.equal(categories.find((c) => c.category === "jeunesse"), undefined);
  });

  it("place les thèmes complets en fin de liste, le reste dans l'ordre du catalogue", () => {
    const templates = [
      template({ id: "retraite", category: "retraite-voyages-loisirs" }),
      template({ id: "naissance", category: "naissance-enfance" }),
      template({ id: "jeunesse", category: "jeunesse" }),
    ];
    const facts: SubjectFact[] = [fact({ id: "f1", template_id: "jeunesse" })];
    const { categories } = run({ templates, facts, subject, hasSibling: false, myPersonId: "me" });
    assert.deepEqual(
      categories.map((c) => c.category),
      ["naissance-enfance", "retraite-voyages-loisirs", "jeunesse"],
    );
  });
});
