import { supabase } from "@/lib/supabase";

export async function ensureListItemExists(params: {
  listName: string;
  value: string;
  familyId: string;
  personId: string;
}): Promise<void> {
  const { listName, value, familyId, personId } = params;

  const { data: existingItem } = await supabase
    .from("list_items")
    .select("id")
    .eq("list_name", listName)
    .ilike("value", value)
    .maybeSingle();

  if (!existingItem) {
    await supabase.from("list_items").insert({
      list_name: listName,
      value,
      status: "pending",
      family_id: familyId,
      created_by_person_id: personId,
    });
  }
}
