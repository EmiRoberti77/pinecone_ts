import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

const pineCone = new Pinecone({
  apiKey: process.env.API_KEY!,
});

async function main() {
  const index_name = "document-index";
  const existingIndexes = await pineCone.listIndexes();
  console.log(existingIndexes.indexes);
}

main();
