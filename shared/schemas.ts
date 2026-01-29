import { z } from 'zod';

// ── User ────────────────────────────────────────────────────────────────────
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  created_at: z.string().optional(),
});

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

export const LoginUserSchema = UserSchema.extend({
  must_change_password: z.number().optional(),
});

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: LoginUserSchema,
});

// ── Family ──────────────────────────────────────────────────────────────────
export const FamilySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  invite_code: z.string(),
  created_by: z.number().nullable(),
  created_at: z.string().nullable().optional(),
});

export const FamilyWithUsersSchema = FamilySchema.extend({
  users: z.array(z.object({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    role: z.string(),
  })),
});

export const MeResponseSchema = UserSchema.extend({
  families: z.array(FamilySchema.extend({
    user_role: z.string(),
  })),
});

// ── Member ──────────────────────────────────────────────────────────────────
export const MemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  display_order: z.number(),
  family_id: z.number().nullable(),
});

// ── Event ───────────────────────────────────────────────────────────────────
export const EventSchema = z.object({
  id: z.number(),
  member_id: z.number(),
  category_id: z.number().nullable(),
  title: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  date: z.string().nullable(),
  weekday: z.number().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  is_recurring: z.union([z.boolean(), z.number()]),
  ride_outbound: z.string().nullable(),
  ride_return: z.string().nullable(),
  family_id: z.number().nullable(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  member_name: z.string(),
  member_color: z.string(),
  category_name: z.string().nullable(),
  category_icon: z.string().nullable(),
});

// ── Category ────────────────────────────────────────────────────────────────
export const CategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string().nullable(),
});

// ── Generic ─────────────────────────────────────────────────────────────────
export const ErrorSchema = z.object({
  error: z.string(),
});

export const OkSchema = z.object({
  ok: z.literal(true),
});
