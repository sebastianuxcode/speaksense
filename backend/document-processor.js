import mammoth from "mammoth";
import fs from "fs";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { PDFDocument } from "pdf-lib";

const VECTOR_DB = "./vector-store.json";
const DOCUMENTS_DB = "./documents.json";

// Cargar stores
const loadStore = () => {
  if (!fs.existsSync(VECTOR_DB)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_DB));
};

const saveStore = (data) => {
  fs.writeFileSync(VECTOR_DB, JSON.stringify(data, null, 2));
};

const loadDocuments = () => {
  if (!fs.existsSync(DOCUMENTS_DB)) return [];
  return JSON.parse(fs.readFileSync(DOCUMENTS_DB));
};

const saveDocuments = (data) => {
  fs.writeFileSync(DOCUMENTS_DB, JSON.stringify(data, null, 2));
};

// Obtener embedding de LM Studio
async function getEmbedding(text) {
  try {
    const res = await axios.post("http://192.168.1.24:1234/v1/embeddings", {
      input: text,
      model: "text-embedding"
    });
    return res.data.data[0].embedding;
  } catch (error) {
    console.error("Error obteniendo embedding:", error.message);
    throw error;
  }
}

// Extraer texto de PDF usando pdf-lib
async function extractPDFText(filePath) {
  try {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    let fullText = "";
    
    // Intentar extraer texto de cada página
    // Nota: pdf-lib no extrae texto directamente, así que usaremos un enfoque básico
    // Para PDFs con texto real, necesitaríamos otra librería
    
    // Por ahora, retornaremos un mensaje indicando que se necesita otra librería
    // o el usuario puede usar TXT/DOC
    fullText = `[PDF detectado con ${pages.length} páginas. Para mejor extracción de texto, por favor use archivos TXT o DOC/DOCX, o instale pdf-parse correctamente]`;
    
    return fullText;
  } catch (error) {
    console.error("Error extrayendo PDF:", error);
    throw error;
  }
}

// Extraer texto según tipo de archivo
async function extractText(filePath, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      // Intentar con pdf-parse primero
      try {
        const pdfParse = await import("pdf-parse");
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse.default(buffer);
        return data.text;
      } catch (pdfError) {
        console.log("pdf-parse no disponible, usando método alternativo");
        return await extractPDFText(filePath);
      }
    } else if (mimeType === "text/plain") {
      return fs.readFileSync(filePath, "utf-8");
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else {
      throw new Error("Tipo de archivo no soportado");
    }
  } catch (error) {
    console.error("Error extrayendo texto:", error);
    throw error;
  }
}

// Dividir texto en chunks
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

// Procesar documento completo
export async function processDocument(filePath, filename, mimeType) {
  console.log(`Procesando documento: ${filename}`);
  
  const documentId = uuid();
  const text = await extractText(filePath, mimeType);
  
  console.log(`Texto extraído: ${text.length} caracteres`);
  
  // Crear chunks
  const chunks = chunkText(text, 500, 50);
  console.log(`Creados ${chunks.length} chunks`);
  
  // Crear embeddings para cada chunk
  const store = loadStore();
  const chunkIds = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Procesando chunk ${i + 1}/${chunks.length}`);
    const chunkId = uuid();
    const embedding = await getEmbedding(chunks[i]);
    
    store.push({
      id: chunkId,
      documentId: documentId,
      text: chunks[i],
      embedding: embedding,
      chunkIndex: i
    });
    
    chunkIds.push(chunkId);
  }
  
  saveStore(store);
  
  // Guardar metadata del documento
  const documents = loadDocuments();
  documents.push({
    id: documentId,
    filename: filename,
    mimeType: mimeType,
    uploadedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    chunkIds: chunkIds,
    textLength: text.length
  });
  saveDocuments(documents);
  
  console.log(`Documento procesado exitosamente: ${documentId}`);
  
  return {
    id: documentId,
    filename: filename,
    chunks: chunks.length
  };
}

// Eliminar documento y sus chunks
export function deleteDocument(documentId) {
  // Eliminar chunks del vector store
  const store = loadStore();
  const filteredStore = store.filter(item => item.documentId !== documentId);
  saveStore(filteredStore);
  
  // Eliminar documento de la lista
  const documents = loadDocuments();
  const filteredDocuments = documents.filter(doc => doc.id !== documentId);
  saveDocuments(filteredDocuments);
  
  return { success: true };
}

// Obtener todos los documentos
export function getAllDocuments() {
  return loadDocuments();
}

// Buscar en documentos específicos usando RAG
export async function searchInDocuments(query, documentIds = null) {
  const store = loadStore();
  
  // Filtrar por documentos específicos si se proporcionan
  let relevantChunks = store;
  if (documentIds && documentIds.length > 0) {
    relevantChunks = store.filter(item => documentIds.includes(item.documentId));
  }
  
  if (relevantChunks.length === 0) {
    return { context: "", chunks: [] };
  }
  
  // Obtener embedding de la consulta
  const queryEmbedding = await getEmbedding(query);
  
  // Calcular similitud coseno
  const cosineSimilarity = (a, b) => {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (magA * magB);
  };
  
  // Rankear chunks por similitud
  const ranked = relevantChunks
    .map((item) => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5 chunks más relevantes
  
  const context = ranked.map((r) => r.text).join("\n\n");
  
  return {
    context: context,
    chunks: ranked.map(r => ({
      documentId: r.documentId,
      text: r.text.substring(0, 100) + "...",
      score: r.score
    }))
  };
}