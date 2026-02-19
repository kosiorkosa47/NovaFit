import NextAuth from "next-auth";
import { DynamoDBAdapter } from "@auth/dynamodb-adapter";
import { dynamodb, AUTH_TABLE } from "@/lib/db/dynamodb";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DynamoDBAdapter(dynamodb, { tableName: AUTH_TABLE }),
  basePath: "/api/nextauth",
  ...authConfig,
});
