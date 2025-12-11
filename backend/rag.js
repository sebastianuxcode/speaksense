import axios from "axios";
import fs from "fs";

const VECTOR_DB = "./vector-store.json";

const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
};

async function getEmbedding(text) {
  const res = await axios.post("http://192.168.1.24:1234/v1/embeddings", {
    input: text,
    model: "text-embedding"
  });

  return res.data.data[0].embedding;
}

export async function chatWithRAG(query) {
  const store = JSON.parse(fs.readFileSync(VECTOR_DB));

  const qEmbedding = await getEmbedding(query);

  // Obtener los 3 documentos más similares
  const ranked = store
    .map((item) => ({
      ...item,
      score: cosineSimilarity(qEmbedding, item.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const context = ranked.map((r) => r.text).join("\n\n");

  const prompt = `
Usa solo la siguiente información para responder la pregunta:

${context}

Pregunta: ${query}
Respuesta:
`;

  const res = await axios.post("http://192.168.1.24:1234/v1/chat/completions", {
    model: "local-model",
    messages: [{ role: "user", content: prompt }]
  });

  return res.data.choices[0].message.content;
}
