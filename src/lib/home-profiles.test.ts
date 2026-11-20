// Tests du choix des profils de l'accueil. Lancer : npm run test:profiles  (Node 22.6+)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickHomeProfiles, type ProfileCandidate } from "./home-profiles.ts";

function person(id: string, revealedCount: number, isCentral = false): ProfileCandidate {
  return { id, firstName: id, isCentral, revealedCount };
}

// Générateur pseudo-aléatoire reproductible (LCG), pour des tests stables.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("pickHomeProfiles", () => {
  it("prend en priorité les personnes qui ont des souvenirs révélés", () => {
    const candidates = [person("a", 0), person("b", 2), person("c", 0), person("d", 1), person("e", 3), person("f", 1)];
    for (let seed = 1; seed < 30; seed++) {
      const picked = pickHomeProfiles(candidates, 4, seeded(seed));
      assert.equal(picked.length, 4);
      assert.ok(picked.every((p) => p.revealedCount > 0), `seed ${seed}: ${picked.map((p) => p.id)}`);
    }
  });

  it("complète avec les autres personnes s'il n'y a pas assez de souvenirs", () => {
    const candidates = [person("a", 0), person("b", 2), person("c", 0), person("d", 0)];
    const picked = pickHomeProfiles(candidates, 4, seeded(7));
    assert.equal(picked.length, 4);
    assert.equal(picked[0].id, "b");
    assert.deepEqual(new Set(picked.map((p) => p.id)), new Set(["a", "b", "c", "d"]));
  });

  it("affiche moins de profils dans une petite famille, sans doublon", () => {
    const picked = pickHomeProfiles([person("a", 1), person("b", 0)], 4, seeded(3));
    assert.equal(picked.length, 2);
    assert.equal(new Set(picked.map((p) => p.id)).size, 2);
  });

  it("renvoie une liste vide sans personne", () => {
    assert.deepEqual(pickHomeProfiles([], 4, seeded(1)), []);
  });

  it("favorise les personnes centrales (poids ×1,5)", () => {
    const candidates = [person("central", 1, true), person("x", 1), person("y", 1), person("z", 1)];
    let centralFirst = 0;
    const runs = 4000;
    const random = seeded(42);
    for (let i = 0; i < runs; i++) if (pickHomeProfiles(candidates, 1, random)[0].id === "central") centralFirst++;
    // Probabilité attendue : 1,5 / 4,5 = 1/3 (contre 1/4 sans pondération).
    const share = centralFirst / runs;
    assert.ok(share > 0.3 && share < 0.37, `part observée ${share}`);
  });
});
