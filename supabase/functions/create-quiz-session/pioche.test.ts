// Tests de la pioche. Lancer : npm run test:pioche  (Node 22.6+, exécute le TypeScript directement)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countNeverPosed, pickFact, type FactCandidate } from "./pioche.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const fact = (id: string, lastPosedAt: string | null, isCentralSubject = false): FactCandidate => ({
  id,
  authorPersonId: "auteur",
  isCentralSubject,
  lastPosedAt,
});

// Générateur pseudo-aléatoire déterministe.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("pickFact", () => {
  it("ne repioche jamais un fait déjà posé tant qu'il en reste de jamais posés", () => {
    const candidates = [
      fact("ancien-1", daysAgo(400), true),
      fact("ancien-2", daysAgo(300), true),
      fact("neuf", null, false),
    ];
    const random = seeded(1);
    for (let i = 0; i < 2000; i++) {
      const r = pickFact(candidates, NOW, random);
      assert.ok(r);
      assert.equal(r.candidate.id, "neuf");
      assert.equal(r.reused, false);
    }
  });

  it("donne une priorité aux faits sur une personne centrale parmi les jamais posés", () => {
    const candidates = [fact("central", null, true), fact("autre", null, false)];
    const random = seeded(7);
    let central = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (pickFact(candidates, NOW, random)?.candidate.id === "central") central++;
    // Poids 1,5 contre 1 : 60 % attendus.
    assert.ok(Math.abs(central / N - 0.6) < 0.02, `part des faits sur une personne centrale : ${central / N}`);
  });

  it("repioche un fait déjà posé seulement s'il n'y a plus aucun fait jamais posé, et le signale", () => {
    const candidates = [fact("a", daysAgo(10)), fact("b", daysAgo(60))];
    const r = pickFact(candidates, NOW, seeded(3));
    assert.ok(r);
    assert.equal(r.reused, true);
  });

  it("privilégie les faits posés il y a le plus longtemps quand il faut repiocher", () => {
    const candidates = [fact("recent", daysAgo(2)), fact("ancien", daysAgo(80))];
    const random = seeded(11);
    let ancien = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (pickFact(candidates, NOW, random)?.candidate.id === "ancien") ancien++;
    // Poids 80 contre 2 : environ 97,6 %.
    assert.ok(ancien / N > 0.95, `part du fait ancien : ${ancien / N}`);
  });

  it("renvoie null sans candidat", () => {
    assert.equal(pickFact([], NOW), null);
  });

  it("compte les faits jamais posés", () => {
    assert.equal(countNeverPosed([fact("a", null), fact("b", daysAgo(3)), fact("c", null)]), 2);
  });
});
