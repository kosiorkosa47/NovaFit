import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { dynamodb, AUTH_TABLE } from "@/lib/db/dynamodb";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authConfig: NextAuthConfig = {
  trustHost: true,
  debug: false,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Demo account — hardcoded for hackathon judges
        if (parsed.data.email === "demo@novafit.ai" && parsed.data.password === "demo1234") {
          return { id: "demo-user", name: "Demo User", email: "demo@novafit.ai", image: null };
        }

        // Find user by email via GSI1
        const result = await dynamodb.query({
          TableName: AUTH_TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
          ExpressionAttributeValues: {
            ":pk": `USER#${parsed.data.email}`,
            ":sk": `USER#${parsed.data.email}`,
          },
          Limit: 1,
        });

        const user = result.Items?.[0];
        if (!user?.password) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password as string);
        if (!valid) return null;

        return {
          id: user.id as string,
          name: (user.name as string) ?? null,
          email: (user.email as string) ?? null,
          image: (user.image as string) ?? null,
        };
      },
    }),
  ],
  logger: {
    error(error) {
      console.error("[AUTH-ERR]", error.name, error.message);
      if ("cause" in error && error.cause) {
        const cause = error.cause as Record<string, unknown>;
        console.error("[AUTH-CAUSE]", cause.err ?? cause.message ?? JSON.stringify(cause).slice(0, 500));
      }
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
