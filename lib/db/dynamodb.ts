import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export const dynamodb = DynamoDBDocument.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const AUTH_TABLE = process.env.DYNAMODB_AUTH_TABLE ?? "novafit-auth";
