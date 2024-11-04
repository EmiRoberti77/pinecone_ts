import { IndexModel, Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const config = {
  similarityQuery: {
    topK: 1, // Top results limit
    includeValues: false,
    includeMetadata: true,
  },
  namespace: "ns_emi", // Pinecone namespace
  indexName: "document-index", // Pinecone index name
  embeddingID: "id_emi", // Embedding identifier
  dimension: 1536,
  metric: "cosine",
  cloud: "aws",
  region: "us-west-2",
  query: "What is my dog's name?",
};

const metadataToEmded = [
  {
    textToEmbed: "my dog name is leroy",
    extaInfo: [
      "likes running",
      "likes walking",
      "likes palying with ball",
      "likes eating my food",
    ],
  },
  {
    textToEmbed: "I drive an Audi TT",
    extaInfo: ["black", "sports car", "turbo"],
  },
];

const pineCone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function isIndexValid() {
  const existingIndexes = await pineCone.listIndexes();
  const found: IndexModel | undefined = existingIndexes.indexes?.find(
    (index) => index.name === config.indexName
  );
  if (!found) return false;
  console.log(found);
  return true;
}

async function embeddMetadata() {
  await Promise.all(
    metadataToEmded.map(async (item, index) => {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: item.textToEmbed,
      });

      const indexName = config.indexName;
      const id = `${config.embeddingID}-${index}`;
      await pineCone.index(config.indexName).upsert([
        {
          id: id,
          values: embedding.data[0].embedding,
          metadata: { ...item },
        },
      ]);

      console.log(`added embedding id:${id} in pinecone`);
    })
  );
}

async function main() {
  if (!(await isIndexValid())) {
    console.log(`Error:${config.indexName} not found`);
    return;
  }
  await embeddMetadata();
}

main();
