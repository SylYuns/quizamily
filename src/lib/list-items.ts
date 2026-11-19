import { supabase } from "@/lib/supabase";

export async function ensureListItemExists(params: {
  listName: string;
  value: string;
  familyId: string;
  personId: string;
  /** Catégorie de la liste (ex : « musique » pour les personnalités), si la question en a une. */
  category?: string | null;
}): Promise<void> {
  const { listName, value, familyId, personId, category = null } = params;

  let lookup = supabase.from("list_items").select("id").eq("list_name", listName).ilike("value", value);
  lookup = category ? lookup.eq("category", category) : lookup.is("category", null);
  const { data: existingItem } = await lookup.limit(1).maybeSingle();

  if (!existingItem) {
    await supabase.from("list_items").insert({
      list_name: listName,
      value,
      status: "pending",
      family_id: familyId,
      created_by_person_id: personId,
      category,
    });
  }
}
