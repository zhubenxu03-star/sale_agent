import { z } from "zod";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? null : Number(value)),
  z.number().nonnegative("不能小于 0").nullable(),
);

export const customerFormSchema = z
  .object({
    name: z.string().min(1, "请输入客户名称").max(120),
    company_name: z.string().max(240).optional(),
    industry: z.string().max(120).optional(),
    company_size: z.string().max(80).optional(),
    region: z.string().max(120).optional(),
    source: z.string().max(120).optional(),
    stage: z.string().max(80).optional(),
    budget_min: optionalNumber,
    budget_max: optionalNumber,
    expected_amount: optionalNumber,
    expected_close_date: z.string().optional(),
    deal_probability: z.preprocess(
      (value) => (value === "" || value === null ? null : Number(value)),
      z.number().min(0).max(100).nullable(),
    ),
    core_needs: z.string().optional(),
    pain_points: z.string().optional(),
    objections: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (values) =>
      values.budget_min === null ||
      values.budget_max === null ||
      values.budget_min <= values.budget_max,
    { message: "预算下限不能高于预算上限", path: ["budget_max"] },
  );

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
export type CustomerFormInput = z.input<typeof customerFormSchema>;

export function linesToArray(value?: string): string[] | null {
  const items = (value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

export function collectionToLines(
  value: string[] | Record<string, unknown> | null,
): string {
  if (Array.isArray(value)) return value.join("\n");
  if (value && typeof value === "object") return Object.values(value).join("\n");
  return "";
}
