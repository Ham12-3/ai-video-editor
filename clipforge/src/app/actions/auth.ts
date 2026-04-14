"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { signUpSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function signUp(formData: {
  email: string;
  password: string;
  name: string;
}) {
  const parsed = signUpSchema.safeParse(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, name } = parsed.data;

  // Check if user exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return { error: "An account with this email already exists" };
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(users).values({
      email,
      name,
      passwordHash,
    });

    return { success: true };
  } catch (err) {
    console.error("Sign up error:", err);
    return { error: "Failed to create account. Please try again." };
  }
}
