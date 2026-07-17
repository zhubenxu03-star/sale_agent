import { z } from "zod";

export const loginSchema = z.object({
  tenant_code: z
    .string()
    .min(3, "企业编码至少 3 个字符")
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, "仅支持小写字母、数字和短横线"),
  email: z.string().email("请输入有效邮箱"),
  password: z.string().min(8, "密码至少 8 位"),
});

export const registerSchema = loginSchema
  .extend({
    tenant_name: z.string().min(2, "企业名称至少 2 个字符").max(200),
    admin_name: z.string().min(1, "请输入管理员姓名").max(120),
    confirm_password: z.string().min(8, "确认密码至少 8 位"),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "两次输入的密码不一致",
    path: ["confirm_password"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
