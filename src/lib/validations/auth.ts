import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});
