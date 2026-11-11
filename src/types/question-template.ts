export type Template = {
  id: string;
  category: string;
  template_text: string;
  answer_input_kind: string;
  list_name: string | null;
  related_role: string | null;
  slots: string[] | null;
  condition: string | null;
  recap: string | null;
};
