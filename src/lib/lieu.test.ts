// Tests de la préposition de lieu. Lancer : npm run test:lieu  (Node 22.6+)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COUNTRIES } from "../constants/countries.ts";
import { lieuPourPays, lieuPourVille, reponseLieu } from "./lieu.ts";

describe("lieuPourPays", () => {
  it("accorde en/au/aux selon le pays", () => {
    assert.equal(lieuPourPays("Italie"), "en Italie");
    assert.equal(lieuPourPays("Portugal"), "au Portugal");
    assert.equal(lieuPourPays("États-Unis"), "aux États-Unis");
  });

  it("gère les territoires à article propre", () => {
    assert.equal(lieuPourPays("Réunion"), "à La Réunion");
    assert.equal(lieuPourPays("Madagascar"), "à Madagascar");
  });

  it("couvre tous les pays de la liste fermée avec une vraie préposition (src/constants/countries.ts)", () => {
    for (const pays of COUNTRIES) {
      const phrase = lieuPourPays(pays);
      assert.ok(
        /^(en|au|aux|à) /.test(phrase),
        `"${pays}" → "${phrase}" (devrait commencer par en/au/aux/à)`,
      );
    }
  });

  it("se replie sur « en <pays> » pour un pays hors liste (réponse libre tapée)", () => {
    assert.equal(lieuPourPays("Atlantide"), "en Atlantide");
  });
});

describe("lieuPourVille", () => {
  it("utilise toujours « à »", () => {
    assert.equal(lieuPourVille("Lyon"), "à Lyon");
  });
});

describe("reponseLieu", () => {
  it("choisit la préposition pays ou ville selon le type", () => {
    assert.equal(reponseLieu("country", "Portugal"), "au Portugal");
    assert.equal(reponseLieu("city", "Lyon"), "à Lyon");
  });
});
