import { IndexModel, Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { OpenAIEmbedding } from "./embeddings/openai_embedding.ts";
import { AWSTitanEmbedding } from "./embeddings/aws_titan_embeddings.js";
import pdfParse from "pdf-parse";
import fs from "fs";
import OpenAI from "openai";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const enum INDEX_ACTION {
  CREATE = "create",
  DELETE = "delete",
}

const config = {
  similarityQuery: {
    topK: 1, // Top results limit
    includeValues: false,
    includeMetadata: true,
  },
  namespace: "ns_emi_pdf", // Pinecone namespace
  indexName: "pdf-search-index", // Pinecone index name
  embeddingID: "id_emi", // Embedding identifier
  dimension: 1536,
  metric: "cosine",
  cloud: "aws",
  region: "us-east-1",
  pdfPath: "./pdf/report.pdf",
  query: "summarise lending to SMEs",
};

const pineCone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

async function parsePdf(): Promise<string[]> {
  const pdfBuffer = fs.readFileSync(config.pdfPath);
  const bufferInMB = pdfBuffer.length / (1024 * 1024);
  console.log(`buffer size: ${bufferInMB.toFixed(2)}MB`);
  const pdfData = await pdfParse(pdfBuffer);
  const pages = pdfData.text
    .split("\f")
    .map((page) => page.trim())
    .filter((page) => page.length > 0);
  const chunkSize = 500;
  const chunks: string[] = [];
  for (const page of pages) {
    for (let i = 0; i < page.length; i += chunkSize) {
      const chunk = page.slice(i, i + chunkSize).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }
  }
  return chunks;
}

async function manageIndexes(indexAction: INDEX_ACTION) {
  const existingIndexes = await pineCone.listIndexes();
  const indexFound: IndexModel | undefined = existingIndexes.indexes?.find(
    (index) => index.name === config.indexName
  );

  switch (indexAction) {
    case INDEX_ACTION.CREATE:
      if (indexFound) {
        console.log(`Found:${config.indexName}-no create required`);
        return;
      }

      await pineCone.createIndex({
        name: config.indexName,
        dimension: config.dimension,
        metric: config.metric as any,
        spec: {
          serverless: {
            cloud: config.cloud as any,
            region: config.region,
          },
        },
      });
      //await waitForIndexReady();
      console.log(`Created:${config.indexName}`);
      break;
    case INDEX_ACTION.DELETE:
      if (!indexFound) {
        console.log(`Not Found:${config.indexName}-no need to delete`);
        return;
      }
      await pineCone.deleteIndex(config.indexName);
      console.log(`deleted:${config.indexName}`);
      break;
  }
}

async function embeddMetadata() {
  const metadataToEmded = await parsePdf();
  console.log(metadataToEmded);
  await Promise.all(
    metadataToEmded.map(async (chunk, index) => {
      let embedding;
      if (process.env.EMBEDDING_MODE === "AWS") {
        embedding = await AWSTitanEmbedding.embedding(chunk);
      } else {
        embedding = await OpenAIEmbedding.embedding(chunk);
      }

      const indexName = config.indexName;
      const id = `${config.embeddingID}-${index}`;
      await pineCone.index(config.indexName).upsert([
        {
          id: id,
          values: embedding,
          metadata: { text: chunk },
        },
      ]);

      console.log(`added embedding id:${id} in pinecone`);
    })
  );
}

async function waitForIndexReady() {
  while (true) {
    const indexDescription = await pineCone.describeIndex(config.indexName);
    if (indexDescription.status.ready) {
      console.log(`Index ${config.indexName} is ready`);
      break;
    } else {
      console.log(`waiting for ${config.indexName} to be ready`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function queryEmbedding() {
  let queryEmbedding;
  if (process.env.EMBEDDING_MODE === "AWS") {
    queryEmbedding = await AWSTitanEmbedding.embedding(config.query);
  } else {
    queryEmbedding = await OpenAIEmbedding.embedding(config.query);
  }

  const queryResult = await pineCone.index(config.indexName).query({
    topK: 3,
    vector: queryEmbedding,
    includeMetadata: true,
  });

  const context =
    queryResult.matches
      ?.map((match) => (match.metadata?.text as string) || "")
      .join(" ") ?? "";

  const question = config.query;

  const completionResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: `Based on the following context, answer the question:\n\nContext: ${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  console.table(completionResponse.choices[0].message.content);
  console.log(completionResponse.choices[0].message.content);
}

async function main() {
  //await maangeIndexes(INDEX_ACTION.DELETE);
  await manageIndexes(INDEX_ACTION.CREATE);
  await embeddMetadata();
  await queryEmbedding();
}

main();
