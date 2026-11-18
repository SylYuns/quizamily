// Tests de l'accord au féminin/masculin. Lancer : npm run test:gender  (Node 22.6+)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveGenderedTokens } from "./gender.ts";

describe("resolveGenderedTokens", () => {
  it("accorde au féminin", () => {
    assert.equal(
      resolveGenderedTokens("Jusqu'à quel âge <sujet> est-{il|elle} {allé|allée} à l'école ?", "femme"),
      "Jusqu'à quel âge <sujet> est-elle allée à l'école ?",
    );
  });

  it("accorde au masculin", () => {
    assert.equal(
      resolveGenderedTokens("Dans quelle commune <sujet> s'est-{il|elle} {marié|mariée} ?", "homme"),
      "Dans quelle commune <sujet> s'est-il marié ?",
    );
  });

  it("utilise le masculin quand le genre est inconnu", () => {
    for (const g of [null, undefined]) {
      assert.equal(resolveGenderedTokens("<sujet> a-t-{il|elle} pris l'avion", g), "<sujet> a-t-il pris l'avion");
    }
  });

  it("remplace plusieurs alternatives dans la même phrase", () => {
    assert.equal(
      resolveGenderedTokens("a-t-{il|elle} vu la première fois qu'{il|elle} est {allé|allée}", "femme"),
      "a-t-elle vu la première fois qu'elle est allée",
    );
  });

  it("remplace {Sujet} et {sujet} par le pronom (phrases de récapitulatif)", () => {
    assert.equal(resolveGenderedTokens("{Sujet} est {né|née} le {réponse}.", "femme"), "Elle est née le {réponse}.");
    assert.equal(resolveGenderedTokens("Quand {sujet} était enfant", "homme"), "Quand il était enfant");
  });

  it("ne touche ni à {réponse} ni aux éléments <sujet>, <conjoint>, <pays>", () => {
    const text = "<sujet> et <conjoint> en <pays> : {réponse}";
    assert.equal(resolveGenderedTokens(text, "femme"), text);
  });
});
