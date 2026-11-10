// Tests du calcul de placement de l'arbre familial.
// Lancer : npm run test:layout  (Node 22.18+ : exécute le TypeScript directement)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFamilyTree,
  connectorSegments,
  DEFAULT_METRICS,
  layoutFamilyTree,
  moveFocus,
  personsInGeneration,
  rowOffsetsFor,
  type FamilyTree,
  type TreeLayout,
  type TreePersonInput,
  type TreeRelationInput,
} from "./family-tree-layout.ts";

const parent = (a: string, b: string): TreeRelationInput => ({ personA: a, personB: b, type: "parent_of" });
const spouse = (a: string, b: string): TreeRelationInput => ({ personA: a, personB: b, type: "spouse_of" });
const sibling = (a: string, b: string): TreeRelationInput => ({ personA: a, personB: b, type: "sibling_of" });
const people = (...ids: string[]): TreePersonInput[] => ids.map((id) => ({ id }));

// Famille de la maquette : Marcel et Marie, 3 enfants, 4 petits-enfants, 3 arrière-petits-enfants.
function martin() {
  const persons: TreePersonInput[] = [
    { id: "marie", isCentral: true },
    ...people("marcel", "jean", "helene", "claire", "paul", "luc", "thomas", "julie", "camille", "lea", "hugo", "emma", "nathan", "jade"),
  ];
  const relations: TreeRelationInput[] = [
    spouse("marcel", "marie"),
    ...["jean", "claire", "luc"].flatMap((c) => [parent("marcel", c), parent("marie", c)]),
    spouse("jean", "helene"),
    spouse("claire", "paul"),
    ...["thomas", "camille"].flatMap((c) => [parent("jean", c), parent("helene", c)]),
    ...["lea", "hugo"].flatMap((c) => [parent("claire", c), parent("paul", c)]),
    spouse("thomas", "julie"),
    parent("thomas", "emma"),
    parent("thomas", "nathan"),
    parent("lea", "jade"),
  ];
  return { persons, relations };
}

const names = (tree: FamilyTree, g: number) => tree.generations[g].map((id) => tree.units[id].members.join("+"));

/** Vérifie les invariants du placement : pas de chevauchement, parents centrés sur leurs enfants. */
function assertLayoutInvariants(layout: TreeLayout) {
  const { tree, unitPositions, metrics } = layout;
  for (const row of tree.generations) {
    for (let i = 1; i < row.length; i++) {
      const prev = unitPositions[row[i - 1]];
      const cur = unitPositions[row[i]];
      assert.ok(
        cur.x0 >= prev.x0 + prev.width + metrics.familyGap - 1e-6,
        `chevauchement entre ${row[i - 1]} et ${row[i]}`,
      );
    }
  }
  for (const u of Object.values(tree.units)) {
    if (!u.childUnitIds.length) continue;
    const first = unitPositions[u.childUnitIds[0]].cx;
    const last = unitPositions[u.childUnitIds[u.childUnitIds.length - 1]].cx;
    assert.ok(Math.abs(unitPositions[u.id].cx - (first + last) / 2) < 1e-6, `${u.id} n'est pas centré sur ses enfants`);
  }
}

describe("buildFamilyTree", () => {
  it("construit les générations de la famille d'exemple", () => {
    const { persons, relations } = martin();
    const tree = buildFamilyTree(persons, relations, "marie");
    assert.equal(tree.topAncestorId, "marie");
    assert.deepEqual(names(tree, 0), ["marie+marcel"]);
    assert.deepEqual(names(tree, 1), ["jean+helene", "claire+paul", "luc"]);
    assert.deepEqual(names(tree, 2), ["thomas+julie", "camille", "lea", "hugo"]);
    assert.deepEqual(names(tree, 3), ["emma", "nathan", "jade"]);
    assert.deepEqual(tree.unlinkedPersonIds, []);
  });

  it("remonte jusqu'à l'ancêtre le plus haut depuis la personne de départ", () => {
    const { persons, relations } = martin();
    const tree = buildFamilyTree(persons, relations, "jade");
    assert.equal(tree.topAncestorId, "marie");
    assert.equal(tree.generations.length, 4);
    assert.deepEqual(tree.unlinkedPersonIds, []);
  });

  it("prend la première personne centrale si aucune personne de départ n'est donnée", () => {
    const { persons, relations } = martin();
    const tree = buildFamilyTree(persons, relations);
    assert.equal(tree.rootPersonId, "marie");
  });

  it("signale les personnes et groupes non reliés à l'arbre", () => {
    const { persons, relations } = martin();
    const extra = [...persons, ...people("pierre", "sophie", "bernard", "mamieB")];
    const rels = [...relations, spouse("sophie", "bernard"), parent("mamieB", "sophie")];
    const tree = buildFamilyTree(extra, rels, "marie");
    assert.deepEqual(tree.unlinkedPersonIds.sort(), ["bernard", "mamieB", "pierre", "sophie"]);
  });

  it("ignore l'ascendance d'un conjoint (pièce rapportée)", () => {
    const { persons, relations } = martin();
    const extra = [...persons, ...people("pereH", "mereH")];
    const rels = [...relations, parent("pereH", "helene"), parent("mereH", "helene"), spouse("pereH", "mereH")];
    const tree = buildFamilyTree(extra, rels, "marie");
    assert.equal(tree.unitOfPerson["helene"], tree.unitOfPerson["jean"]);
    assert.deepEqual(tree.unlinkedPersonIds.sort(), ["mereH", "pereH"]);
  });

  it("place les adelphes liés directement (sans parents connus) dans la fratrie", () => {
    const persons = [{ id: "marie", isCentral: true }, ...people("soeur", "frere", "neveu", "fils")];
    const relations = [sibling("marie", "soeur"), sibling("soeur", "frere"), parent("soeur", "neveu"), parent("marie", "fils")];
    const tree = buildFamilyTree(persons, relations, "marie");
    assert.deepEqual(names(tree, 0), ["marie", "soeur", "frere"]);
    assert.deepEqual(names(tree, 1), ["fils", "neveu"]);
    assert.deepEqual(tree.unlinkedPersonIds, []);
  });

  it("ajoute à une fratrie un adelphe lié directement dont les parents sont inconnus", () => {
    const persons = [{ id: "pere", isCentral: true }, ...people("a", "b")];
    const relations = [parent("pere", "a"), sibling("a", "b")];
    const tree = buildFamilyTree(persons, relations, "pere");
    assert.deepEqual(names(tree, 1), ["a", "b"]);
  });

  it("ne boucle pas sur des relations incohérentes", () => {
    const persons = [{ id: "a", isCentral: true }, ...people("b")];
    const tree = buildFamilyTree(persons, [parent("a", "b"), parent("b", "a")], "a");
    assert.equal(Object.keys(tree.unitOfPerson).length, 2);
  });

  it("renvoie un arbre vide sans personne", () => {
    const tree = buildFamilyTree([], [], null);
    assert.equal(tree.generations.length, 0);
  });
});

describe("layoutFamilyTree", () => {
  it("respecte les invariants sur la famille d'exemple", () => {
    const { persons, relations } = martin();
    const layout = layoutFamilyTree(buildFamilyTree(persons, relations, "marie"));
    assertLayoutInvariants(layout);
  });

  it("tient une grande fratrie : 9 enfants, chacun avec conjoint et 3 enfants", () => {
    const persons: TreePersonInput[] = [{ id: "aieule", isCentral: true }, ...people("aieul")];
    const relations: TreeRelationInput[] = [spouse("aieule", "aieul")];
    for (let i = 1; i <= 9; i++) {
      persons.push(...people(`e${i}`, `c${i}`));
      relations.push(parent("aieule", `e${i}`), parent("aieul", `e${i}`), spouse(`e${i}`, `c${i}`));
      for (let j = 1; j <= 3; j++) {
        persons.push({ id: `p${i}-${j}` });
        relations.push(parent(`e${i}`, `p${i}-${j}`));
      }
    }
    const layout = layoutFamilyTree(buildFamilyTree(persons, relations, "aieule"));
    assertLayoutInvariants(layout);
    assert.equal(layout.tree.generations[1].length, 9);
    assert.equal(layout.tree.generations[2].length, 27);
    // 27 petits-enfants : 27 places + 26 écarts de famille.
    const { slot, familyGap } = DEFAULT_METRICS;
    assert.equal(layout.width, 27 * slot + 26 * familyGap);
  });

  it("respecte les invariants sur des familles aléatoires", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 200; run++) {
      const persons: TreePersonInput[] = [{ id: "r", isCentral: true }];
      const relations: TreeRelationInput[] = [];
      let n = 0;
      const grow = (p: string, depth: number) => {
        if (rand() < 0.7) {
          const s = `s${n++}`;
          persons.push({ id: s });
          relations.push(spouse(p, s));
        }
        if (depth >= 4) return;
        const kids = Math.floor(rand() * 5);
        for (let k = 0; k < kids; k++) {
          const c = `k${n++}`;
          persons.push({ id: c });
          relations.push(parent(p, c));
          grow(c, depth + 1);
        }
      };
      grow("r", 0);
      const layout = layoutFamilyTree(buildFamilyTree(persons, relations, "r"));
      assertLayoutInvariants(layout);
      assert.deepEqual(layout.tree.unlinkedPersonIds, []);
    }
  });
});

describe("navigation", () => {
  const { persons, relations } = martin();
  const layout = layoutFamilyTree(buildFamilyTree(persons, relations, "marie"));
  const CENTER = 195;
  const half = DEFAULT_METRICS.slot / 2;
  const screenCx = (id: string, off: number) => layout.personX[id] + half + off;

  it("centre la personne, ses parents au-dessus et les enfants de son couple en dessous", () => {
    const r = rowOffsetsFor(layout, "jean", CENTER);
    assert.ok(r);
    assert.equal(r.focusGeneration, 1);
    assert.equal(screenCx("jean", r.offsets[1]), CENTER);
    const parentsU = layout.tree.unitOfPerson["marie"];
    assert.equal(layout.unitPositions[parentsU].cx + r.offsets[0], CENTER);
    const kids = [layout.tree.unitOfPerson["thomas"], layout.tree.unitOfPerson["camille"]];
    const mid = (layout.unitPositions[kids[0]].cx + layout.unitPositions[kids[1]].cx) / 2;
    assert.equal(mid + r.offsets[2], CENTER);
  });

  it("garde la ligne du dessus immobile au sein d'une fratrie, et la recale pour une autre", () => {
    const jean = rowOffsetsFor(layout, "jean", CENTER);
    const claire = rowOffsetsFor(layout, "claire", CENTER);
    assert.ok(jean && claire);
    assert.equal(jean.offsets[0], claire.offsets[0]);
    const thomas = rowOffsetsFor(layout, "thomas", CENTER);
    const lea = rowOffsetsFor(layout, "lea", CENTER);
    assert.ok(thomas && lea);
    assert.notEqual(thomas.offsets[1], lea.offsets[1]);
  });

  it("centre les mêmes parents quel que soit le conjoint centré", () => {
    const a = rowOffsetsFor(layout, "thomas", CENTER);
    const b = rowOffsetsFor(layout, "julie", CENTER);
    assert.ok(a && b);
    assert.equal(a.offsets[1], b.offsets[1]);
  });

  it("déplace la personne centrée d'un cran", () => {
    assert.deepEqual(personsInGeneration(layout.tree, 1), ["jean", "helene", "claire", "paul", "luc"]);
    assert.equal(moveFocus(layout, "jean", "right"), "helene");
    assert.equal(moveFocus(layout, "jean", "left"), "jean");
    assert.equal(moveFocus(layout, "luc", "right"), "luc");
    assert.equal(moveFocus(layout, "thomas", "up"), "jean");
    assert.equal(moveFocus(layout, "julie", "up"), "jean");
    assert.equal(moveFocus(layout, "marie", "up"), "marie");
    assert.equal(moveFocus(layout, "claire", "down"), "lea");
    assert.ok(personsInGeneration(layout.tree, 2).includes(moveFocus(layout, "luc", "down", CENTER)));
    assert.equal(moveFocus(layout, "jade", "down"), "jade");
  });
});

describe("connectorSegments", () => {
  const { persons, relations } = martin();
  const layout = layoutFamilyTree(buildFamilyTree(persons, relations, "marie"));
  const rows = [
    { generation: 1, top: 186, height: 82, avatar: 46 },
    { generation: 2, top: 360, height: 124, avatar: 60 },
    { generation: 3, top: 576, height: 82, avatar: 46 },
  ];

  it("ne produit que des traits horizontaux ou verticaux, sans valeur invalide", () => {
    const r = rowOffsetsFor(layout, "lea", 195);
    assert.ok(r);
    const segs = connectorSegments(layout, rows, r.offsets);
    assert.ok(segs.length > 0);
    for (const s of segs) {
      for (const v of [s.x, s.y, s.w, s.h]) assert.ok(Number.isFinite(v));
      assert.ok(s.w === 2 || s.h === 2, "trait oblique ou épais");
      assert.ok(s.w > 0 && s.h > 0);
    }
  });

  it("relie toutes les familles visibles, pas seulement la branche centrée", () => {
    const r = rowOffsetsFor(layout, "lea", 195);
    assert.ok(r);
    const segs = connectorSegments(layout, rows, r.offsets);
    // Génération 1 -> 2 : Jean+Hélène et Claire+Paul ont des enfants. 2 -> 3 : Thomas+Julie et Léa.
    const bars = segs.filter((s) => s.kind === "family" && s.h === 2);
    assert.equal(bars.length, 4);
  });

  it("ajoute les amorces vers le haut et vers le bas", () => {
    const r = rowOffsetsFor(layout, "jean", 195);
    assert.ok(r);
    const segs = connectorSegments(
      layout,
      [
        { generation: 1, top: 186, height: 82, avatar: 46 },
        { generation: 2, top: 360, height: 124, avatar: 60 },
      ],
      r.offsets,
    );
    const stubs = segs.filter((s) => s.kind === "stub");
    // En haut : Jean+Hélène, Claire+Paul, Luc ont des parents (3). En bas : Thomas+Julie, Léa ont des enfants (2).
    assert.equal(stubs.length, 5);
  });
});
