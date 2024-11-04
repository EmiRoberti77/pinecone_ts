import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL = "amazon.titan-embed-text-v1";
const REGION = "us-east-1";

const client = new BedrockRuntimeClient({
  region: REGION,
});

export class AWSTitanEmbedding {
  constructor() {
    console.log("embedding:", this.constructor.name);
  }
  public static async embedding(input: string): Promise<number[]> {
    const response = await client.send(
      new InvokeModelCommand({
        modelId: MODEL,
        accept: "*/*",
        contentType: "application/json",
        body: JSON.stringify({
          inputText: input,
        }),
      })
    );
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding;
  }
}
