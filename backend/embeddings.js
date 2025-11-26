import pdf from "pdf-parse";
import fs from "fs";
import axios from "axios";
import { v4 as uuid } from "uuid";

const VECTOR_DB = "./vector-store.json";

// Cargar vector store o crearlo
const loadStore = () => {
  if (!fs.existsSync(VECTOR_DB)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_DB));
};

const saveStore = (data) => {
  fs.writeFileSync(VECTOR_DB, JSON.stringify(data, null, 2));
};

export async function processPDF(path) {
  const buffer = fs.readFileSync(path);
  const data = await pdf(buffer);

  const textChunks = data.text.match(/(.|\n){1,500}/g); // chunks de 500 chars

  for (let chunk of textChunks) {
    const embedding = await getEmbedding(chunk);
    const store = loadStore();
    store.push({
      id: uuid(),
      text: chunk,
      embedding
    });
    saveStore(store);
  }
}

async function getEmbedding(text) {
  const res = await axios.post("http://localhost:1234/v1/embeddings", {
    input: text,
    model: "text-embedding"
  });

  return res.data.data[0].embedding;
}
