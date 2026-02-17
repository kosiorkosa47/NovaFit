import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const DEFAULT_AWS_REGION = "us-east-1";

let bedrockClient: BedrockRuntimeClient | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) {
    return bedrockClient;
  }

  bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? DEFAULT_AWS_REGION
  });

  return bedrockClient;
}

export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function assertBedrockEnv(): void {
  getEnv("AWS_REGION", DEFAULT_AWS_REGION);
  getEnv("BEDROCK_MODEL_ID_LITE", "amazon.nova-lite-v1:0");
  getEnv("BEDROCK_MODEL_ID_SONIC", "amazon.nova-2-sonic-v1:0");
}
