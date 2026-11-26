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
  /** Types de réponse entre lesquels l'auteur choisit (null = un seul type, answer_input_kind). */
  answer_forms: string[] | null;
  /** Question sans présumer du type, pour la liste avant que l'auteur n'ait choisi la forme. */
  template_text_neutral: string | null;
  /** { "<forme>": { text, recap } } pour chaque forme autre que answer_input_kind (par défaut). */
  form_texts: Record<string, { text: string; recap: string }> | null;
};
