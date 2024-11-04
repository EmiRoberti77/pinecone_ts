import {
  CreateIndexRequestMetricEnum,
  Index,
  IndexModel,
  Pinecone,
  ServerlessSpecCloudEnum,
} from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { OpenAIEmbedding } from "./embeddings/openai_embedding.ts";
import { AWSTitanEmbedding } from "./embeddings/aws_titan_embeddings.js";
dotenv.config();

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
  namespace: "ns_emi", // Pinecone namespace
  indexName: "document-index", // Pinecone index name
  embeddingID: "id_emi", // Embedding identifier
  dimension: 1536,
  metric: "cosine",
  cloud: "aws",
  region: "us-east-1",
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
      let embedding;
      if (process.env.EMBEDDING_MODE === "AWS") {
        embedding = await AWSTitanEmbedding.embedding(item.textToEmbed);
      } else {
        embedding = await OpenAIEmbedding.embedding(item.textToEmbed);
      }

      const indexName = config.indexName;
      const id = `${config.embeddingID}-${index}`;
      await pineCone.index(config.indexName).upsert([
        {
          id: id,
          values: embedding,
          metadata: { ...item },
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
    ...config.similarityQuery,
    vector: queryEmbedding,
  });

  //console.log("result:", queryResult);
  console.table(queryResult.matches);
}

async function main() {
  //await maangeIndexes(INDEX_ACTION.DELETE);
  await manageIndexes(INDEX_ACTION.CREATE);
  await embeddMetadata();
  await queryEmbedding();
}

main();
