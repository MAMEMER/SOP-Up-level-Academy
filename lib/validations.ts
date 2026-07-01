import { z } from "zod";

export const sopStepSchema = z.object({
  title: z.string(),
  body: z.string(),
  checklistItems: z.array(z.string())
});

export const sopFormSchema = z.object({
  title: z.string().min(1),
  departmentId: z.string().min(1),
  categoryId: z.string().min(1),
  purpose: z.string().min(1),
  whenToUse: z.string().min(1),
  responsibleRole: z.string().min(1),
  requiredTools: z.string(),
  precautions: z.string(),
  faq: z.string(),
  tags: z.array(z.string()),
  steps: z.array(sopStepSchema)
});

export type SopFormInput = z.infer<typeof sopFormSchema>;
