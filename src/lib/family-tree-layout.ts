// Calcul du placement de l'arbre familial (écran 10, voir docs/ecrans.md).
//
// Module pur, sans dépendance à React, Expo ou Supabase : il prend les personnes et les
// relations de la famille, et renvoie où placer chaque personne et chaque trait. L'écran
// n'a plus qu'à dessiner. Testé par family-tree-layout.test.ts (`npm run test:layout`).
//
// Règles (décisions du 2026-11-10) :
// - La famille affichée, ce sont les descendants de l'ancêtre commun, avec leurs conjoints.
//   On part de la première personne centrale, on remonte de parent en parent jusqu'au plus
//   haut, puis on descend. Tout le reste est « non relié » (signalé par une alerte).
// - Un couple n'a qu'un seul couple de parents ; un seul conjoint par personne.
// - Les adelphes liés directement (sibling_of) sans parents connus rejoignent la fratrie.
// - Placement d'un bloc : chaque couple est centré au-dessus de ses enfants, chaque
//   descendance occupe sa propre largeur, même écartement sur toutes les lignes.
// - Navigation : la personne centrée au milieu de l'écran, les parents de sa fratrie centrés
//   au-dessus, les enfants de son couple centrés en dessous.
// - Traits toujours horizontaux ou verticaux, pour toutes les familles visibles.

export type RelationType = "parent_of" | "spouse_of" | "sibling_of";

export type TreePersonInput = {
  id: string;
  isCentral?: boolean;
};

/** parent_of : personA est le parent de personB. spouse_of et sibling_of sont symétriques. */
export type TreeRelationInput = {
  personA: string;
  personB: string;
  type: RelationType;
};

/** Un couple, ou une personne seule. Le premier membre est celui qui descend de l'ancêtre commun. */
export type TreeUnit = {
  id: string;
  generation: number;
  members: string[];
  parentUnitId: string | null;
  childUnitIds: string[];
};

export type FamilyTree = {
  /** Personne de départ (première personne centrale, ou première personne fournie). */
  rootPersonId: string | null;
  /** Ancêtre le plus haut, en partant de rootPersonId. */
  topAncestorId: string | null;
  units: Record<string, TreeUnit>;
  /** Unités de chaque génération, de gauche à droite ; generations[0] = la plus haute. */
  generations: string[][];
  unitOfPerson: Record<string, string>;
  /** Personnes non rattachées à l'arbre affiché. */
  unlinkedPersonIds: string[];
};

export type LayoutMetrics = {
  /** Largeur réservée à chaque personne (même valeur sur toutes les lignes). */
  slot: number;
  /** Espace entre deux conjoints. */
  coupleGap: number;
  /** Espace minimal entre deux familles voisines. */
  familyGap: number;
};

export const DEFAULT_METRICS: LayoutMetrics = { slot: 96, coupleGap: 6, familyGap: 18 };

export type UnitPosition = {
  /** Bord gauche de l'unité, en coordonnées de l'arbre (indépendantes de l'écran). */
  x0: number;
  /** Centre de l'unité : là où part le trait vers les enfants. */
  cx: number;
  width: number;
};

export type TreeLayout = {
  tree: FamilyTree;
  metrics: LayoutMetrics;
  unitPositions: Record<string, UnitPosition>;
  /** Bord gauche de chaque personne, en coordonnées de l'arbre. */
  personX: Record<string, number>;
  /** Largeur totale de l'arbre. */
  width: number;
};

// ---------- 1. Construction de l'arbre ----------

export function buildFamilyTree(
  persons: TreePersonInput[],
  relations: TreeRelationInput[],
  rootPersonId?: string | null,
): FamilyTree {
  const known = new Set(persons.map((p) => p.id));
  const order = new Map(persons.map((p, i) => [p.id, i]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const siblingsOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k);
    if (list) {
      if (!list.includes(v)) list.push(v);
    } else {
      m.set(k, [v]);
    }
  };
  for (const r of relations) {
    if (!known.has(r.personA) || !known.has(r.personB) || r.personA === r.personB) continue;
    if (r.type === "parent_of") {
      push(parentsOf, r.personB, r.personA);
      push(childrenOf, r.personA, r.personB);
    } else if (r.type === "spouse_of") {
      push(spousesOf, r.personA, r.personB);
      push(spousesOf, r.personB, r.personA);
    } else if (r.type === "sibling_of") {
      push(siblingsOf, r.personA, r.personB);
      push(siblingsOf, r.personB, r.personA);
    }
  }
  for (const m of [parentsOf, childrenOf, spousesOf, siblingsOf]) for (const list of m.values()) list.sort(byOrder);

  const empty: FamilyTree = {
    rootPersonId: null,
    topAncestorId: null,
    units: {},
    generations: [],
    unitOfPerson: {},
    unlinkedPersonIds: [],
  };
  const root = rootPersonId && known.has(rootPersonId) ? rootPersonId : (persons.find((p) => p.isCentral)?.id ?? persons[0]?.id);
  if (!root) return empty;

  // Remonter jusqu'à l'ancêtre le plus haut. Si les deux conjoints ont des parents
  // renseignés, on suit la lignée de la personne de départ.
  let top = root;
  const climbed = new Set([top]);
  for (;;) {
    const next = (parentsOf.get(top) ?? []).find((p) => !climbed.has(p));
    if (!next) break;
    climbed.add(next);
    top = next;
  }

  // Adelphes liés directement, sans parents connus (fermeture transitive).
  const directSiblingGroup = (p: string): string[] => {
    const seen = new Set([p]);
    const stack = [p];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const s of siblingsOf.get(cur) ?? []) {
        if (!seen.has(s)) {
          seen.add(s);
          stack.push(s);
        }
      }
    }
    return [...seen].sort(byOrder);
  };

  const units: Record<string, TreeUnit> = {};
  const unitOfPerson: Record<string, string> = {};
  const generations: string[][] = [];
  const placed = new Set<string>();
  let counter = 0;

  const makeUnit = (person: string, generation: number, parentUnitId: string | null): TreeUnit => {
    placed.add(person);
    const members = [person];
    const spouse = (spousesOf.get(person) ?? []).find((s) => !placed.has(s));
    if (spouse) {
      placed.add(spouse);
      members.push(spouse);
    }
    const unit: TreeUnit = { id: `u${counter++}`, generation, members, parentUnitId, childUnitIds: [] };
    units[unit.id] = unit;
    for (const m of members) unitOfPerson[m] = unit.id;
    (generations[generation] ??= []).push(unit.id);
    return unit;
  };

  // Fratrie : les enfants donnés, plus leurs adelphes liés directement qui n'ont pas de parents.
  const withDirectSiblings = (children: string[]): string[] => {
    const out: string[] = [];
    const add = (p: string) => {
      if (!out.includes(p) && !placed.has(p)) out.push(p);
    };
    for (const c of children) {
      add(c);
      for (const s of directSiblingGroup(c)) if ((parentsOf.get(s) ?? []).length === 0) add(s);
    }
    return out.sort(byOrder);
  };

  // Parcours en largeur, génération par génération, pour que l'ordre de gauche à droite
  // suive l'ordre des familles.
  let frontier: TreeUnit[] = withDirectSiblings([top]).map((p) => makeUnit(p, 0, null));
  while (frontier.length) {
    const next: TreeUnit[] = [];
    for (const unit of frontier) {
      const kids: string[] = [];
      for (const m of unit.members) for (const c of childrenOf.get(m) ?? []) if (!kids.includes(c)) kids.push(c);
      for (const c of withDirectSiblings(kids.sort(byOrder))) {
        if (placed.has(c)) continue;
        const child = makeUnit(c, unit.generation + 1, unit.id);
        unit.childUnitIds.push(child.id);
        next.push(child);
      }
    }
    frontier = next;
  }

  return {
    rootPersonId: root,
    topAncestorId: top,
    units,
    generations,
    unitOfPerson,
    unlinkedPersonIds: persons.map((p) => p.id).filter((id) => !placed.has(id)),
  };
}

// ---------- 2. Placement horizontal ----------

export function layoutFamilyTree(tree: FamilyTree, metrics: LayoutMetrics = DEFAULT_METRICS): TreeLayout {
  const { slot, coupleGap, familyGap } = metrics;
  const unitWidth = (u: TreeUnit) => u.members.length * slot + (u.members.length - 1) * coupleGap;

  const subtreeWidth = new Map<string, number>();
  const measure = (id: string): number => {
    const u = tree.units[id];
    const kidsWidth =
      u.childUnitIds.reduce((sum, k) => sum + measure(k), 0) + Math.max(0, u.childUnitIds.length - 1) * familyGap;
    const w = Math.max(unitWidth(u), kidsWidth);
    subtreeWidth.set(id, w);
    return w;
  };

  const unitPositions: Record<string, UnitPosition> = {};
  const place = (id: string, left: number) => {
    const u = tree.units[id];
    const sw = subtreeWidth.get(id) as number;
    let cx: number;
    if (u.childUnitIds.length) {
      const kidsWidth =
        u.childUnitIds.reduce((sum, k) => sum + (subtreeWidth.get(k) as number), 0) +
        (u.childUnitIds.length - 1) * familyGap;
      let x = left + (sw - kidsWidth) / 2;
      for (const k of u.childUnitIds) {
        place(k, x);
        x += (subtreeWidth.get(k) as number) + familyGap;
      }
      const first = unitPositions[u.childUnitIds[0]];
      const last = unitPositions[u.childUnitIds[u.childUnitIds.length - 1]];
      cx = (first.cx + last.cx) / 2;
    } else {
      cx = left + sw / 2;
    }
    const width = unitWidth(u);
    unitPositions[id] = { x0: cx - width / 2, cx, width };
  };

  let x = 0;
  for (const rootUnit of tree.generations[0] ?? []) {
    measure(rootUnit);
    place(rootUnit, x);
    x += (subtreeWidth.get(rootUnit) as number) + familyGap;
  }

  const personX: Record<string, number> = {};
  for (const u of Object.values(tree.units)) {
    const pos = unitPositions[u.id];
    u.members.forEach((m, i) => {
      personX[m] = pos.x0 + i * (slot + coupleGap);
    });
  }

  return { tree, metrics, unitPositions, personX, width: Math.max(0, x - familyGap) };
}

// ---------- 3. Navigation : décalage de chaque ligne pour une personne centrée ----------

export type RowOffsets = {
  focusPersonId: string;
  focusGeneration: number;
  /** Décalage à ajouter aux coordonnées de l'arbre pour obtenir la position à l'écran. */
  offsets: Record<number, number>;
};

/**
 * Personne centrée au milieu de l'écran (centerX) ; ligne du dessus : parents de sa fratrie
 * centrés ; ligne du dessous : enfants de son couple centrés. Une ligne sans repère reprend
 * le décalage de la ligne centrale.
 */
export function rowOffsetsFor(layout: TreeLayout, focusPersonId: string, centerX: number): RowOffsets | null {
  const { tree, unitPositions, personX, metrics } = layout;
  const unitId = tree.unitOfPerson[focusPersonId];
  if (!unitId) return null;
  const unit = tree.units[unitId];
  const g = unit.generation;
  const center = centerX - (personX[focusPersonId] + metrics.slot / 2);
  const offsets: Record<number, number> = { [g]: center };
  if (g > 0) {
    offsets[g - 1] = unit.parentUnitId ? centerX - unitPositions[unit.parentUnitId].cx : center;
  }
  if (g + 1 < tree.generations.length) {
    const kids = unit.childUnitIds;
    offsets[g + 1] = kids.length
      ? centerX - (unitPositions[kids[0]].cx + unitPositions[kids[kids.length - 1]].cx) / 2
      : center;
  }
  return { focusPersonId, focusGeneration: g, offsets };
}

/** Personnes d'une génération, de gauche à droite (crans horizontaux). */
export function personsInGeneration(tree: FamilyTree, generation: number): string[] {
  return (tree.generations[generation] ?? []).flatMap((id) => tree.units[id].members);
}

export type FocusMove = "left" | "right" | "up" | "down";

/**
 * Personne centrée après un cran. Gauche/droite : voisin dans la génération. Haut : le
 * parent de la lignée. Bas : le premier enfant du couple ; sans enfant, la personne de la
 * génération suivante la plus proche à l'écran. Renvoie la même personne si on est au bord.
 */
export function moveFocus(layout: TreeLayout, focusPersonId: string, move: FocusMove, centerX = 0): string {
  const { tree } = layout;
  const unitId = tree.unitOfPerson[focusPersonId];
  if (!unitId) return focusPersonId;
  const unit = tree.units[unitId];
  const g = unit.generation;
  if (move === "left" || move === "right") {
    const row = personsInGeneration(tree, g);
    const i = row.indexOf(focusPersonId) + (move === "right" ? 1 : -1);
    return row[i] ?? focusPersonId;
  }
  if (move === "up") {
    return unit.parentUnitId ? tree.units[unit.parentUnitId].members[0] : focusPersonId;
  }
  if (unit.childUnitIds.length) return tree.units[unit.childUnitIds[0]].members[0];
  const below = personsInGeneration(tree, g + 1);
  if (!below.length) return focusPersonId;
  const offsets = rowOffsetsFor(layout, focusPersonId, centerX);
  if (!offsets) return focusPersonId;
  const off = offsets.offsets[g + 1];
  const half = layout.metrics.slot / 2;
  let best = below[0];
  let bestDist = Infinity;
  for (const p of below) {
    const d = Math.abs(layout.personX[p] + half + off - centerX);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// ---------- 4. Traits ----------

export type RowGeometry = {
  generation: number;
  /** Haut des cartes de la ligne, à l'écran. */
  top: number;
  /** Hauteur des cartes. */
  height: number;
  /** Diamètre du rond (le trait de couple passe à mi-hauteur du rond). */
  avatar: number;
};

/** Trait horizontal (h = épaisseur) ou vertical (w = épaisseur), à l'écran. */
export type Segment = { x: number; y: number; w: number; h: number; kind: "couple" | "family" | "stub" };

/**
 * Traits pour les lignes visibles (de haut en bas) : trait de couple, filiation entre deux
 * lignes voisines pour toutes les familles (descente, barre, descentes), et amorces vers le
 * haut (la ligne du haut a des parents) ou vers le bas (la ligne du bas a des enfants).
 */
export function connectorSegments(
  layout: TreeLayout,
  rows: RowGeometry[],
  offsets: Record<number, number>,
  options: { thickness?: number; stub?: number } = {},
): Segment[] {
  const { tree, unitPositions, personX, metrics } = layout;
  const t = options.thickness ?? 2;
  const stub = options.stub ?? 22;
  const half = metrics.slot / 2;
  const segs: Segment[] = [];
  const v = (x: number, y0: number, y1: number, kind: Segment["kind"]) => {
    if (y1 > y0) segs.push({ x: x - t / 2, y: y0, w: t, h: y1 - y0, kind });
  };
  const h = (x0: number, x1: number, y: number, kind: Segment["kind"]) => {
    if (x1 > x0) segs.push({ x: x0, y: y - t / 2, w: x1 - x0, h: t, kind });
  };
  const sorted = [...rows].sort((a, b) => a.generation - b.generation);
  // Point de départ d'un trait vers le bas : milieu du trait de couple, ou bas de la carte.
  const downAnchor = (unit: TreeUnit, row: RowGeometry) =>
    unit.members.length === 2 ? row.top + row.avatar / 2 : row.top + row.height;
  const upAnchor = (unit: TreeUnit, row: RowGeometry) =>
    unit.members.length === 2 ? row.top + row.avatar / 2 : row.top;

  for (const row of sorted) {
    const off = offsets[row.generation] ?? 0;
    for (const id of tree.generations[row.generation] ?? []) {
      const unit = tree.units[id];
      if (unit.members.length === 2) {
        const a = personX[unit.members[0]] + half + row.avatar / 2 + off;
        const b = personX[unit.members[1]] + half - row.avatar / 2 + off;
        h(a, b, row.top + row.avatar / 2, "couple");
      }
    }
  }

  for (let i = 0; i + 1 < sorted.length; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (to.generation !== from.generation + 1) continue;
    const offFrom = offsets[from.generation] ?? 0;
    const offTo = offsets[to.generation] ?? 0;
    const barY = Math.round((from.top + from.height + to.top) / 2);
    for (const id of tree.generations[from.generation] ?? []) {
      const unit = tree.units[id];
      if (!unit.childUnitIds.length) continue;
      const x = unitPositions[id].cx + offFrom;
      const xs = unit.childUnitIds.map((k) => personX[tree.units[k].members[0]] + half + offTo);
      v(x, downAnchor(unit, from), barY, "family");
      h(Math.min(x, ...xs) - t / 2, Math.max(x, ...xs) + t / 2, barY, "family");
      for (const cx of xs) v(cx, barY, to.top, "family");
    }
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first) {
    const off = offsets[first.generation] ?? 0;
    for (const id of tree.generations[first.generation] ?? []) {
      const unit = tree.units[id];
      if (unit.parentUnitId) v(unitPositions[id].cx + off, first.top - stub, upAnchor(unit, first), "stub");
    }
  }
  if (last) {
    const off = offsets[last.generation] ?? 0;
    for (const id of tree.generations[last.generation] ?? []) {
      const unit = tree.units[id];
      if (unit.childUnitIds.length) v(unitPositions[id].cx + off, downAnchor(unit, last), last.top + last.height + stub, "stub");
    }
  }
  return segs;
}
