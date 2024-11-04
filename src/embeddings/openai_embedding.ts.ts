import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
const MODEL = "text-embedding-ada-002";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});
export class OpenAIEmbedding {
  public static async embedding(input: string): Promise<number[]> {
    const queryEmbedding = await openai.embeddings.create({
      model: MODEL,
      input,
    });
    return queryEmbedding.data[0].embedding;
  }
}
