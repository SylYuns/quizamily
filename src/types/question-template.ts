export type Template = {
  id: string;
  category: string;
  template_text: string;
  answer_input_kind: string;
  list_name: string | null;
  /** Catégorie de la liste à laquelle limiter la recherche (ex : « musique » pour les personnalités). */
  list_category?: string | null;
  related_role: string | null;
  slots: string[] | null;
  condition: string | null;
  recap: string | null;
};
