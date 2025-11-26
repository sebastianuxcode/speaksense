import mammoth from "mammoth";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { PDFDocument } from "pdf-lib";

const DOCUMENTS_DB = "./documents-simple.json";

// Cargar documentos
const loadDocuments = () => {
  if (!fs.existsSync(DOCUMENTS_DB)) return [];
  return JSON.parse(fs.readFileSync(DOCUMENTS_DB));
};

const saveDocuments = (data) => {
  fs.writeFileSync(DOCUMENTS_DB, JSON.stringify(data, null, 2));
};

// Extraer texto de PDF
async function extractPDFText(filePath) {
  try {
    const pdfParse = await import("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse.default(buffer);
    return data.text;
  } catch (pdfError) {
    throw new Error("No se pudo extraer texto del PDF. Usa archivos TXT o DOCX.");
  }
}

// Extraer texto según tipo de archivo
async function extractText(filePath, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      return await extractPDFText(filePath);
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

// Procesar documento SIN embeddings
export async function processDocument(filePath, filename, mimeType) {
  console.log(`Procesando documento: ${filename}`);
  
  const documentId = uuid();
  const text = await extractText(filePath, mimeType);
  
  console.log(`Texto extraído: ${text.length} caracteres`);
  
  // Crear chunks
  const chunks = chunkText(text, 500, 50);
  console.log(`Creados ${chunks.length} chunks`);
  
  // Guardar documento con su texto completo y chunks
  const documents = loadDocuments();
  documents.push({
    id: documentId,
    filename: filename,
    mimeType: mimeType,
    uploadedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    chunks: chunks, // Guardar los chunks directamente
    fullText: text,
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

// Eliminar documento
export function deleteDocument(documentId) {
  const documents = loadDocuments();
  const filteredDocuments = documents.filter(doc => doc.id !== documentId);
  saveDocuments(filteredDocuments);
  return { success: true };
}

// Obtener todos los documentos
export function getAllDocuments() {
  return loadDocuments();
}

// Búsqueda simple por palabras clave (sin embeddings)
export function searchInDocuments(query, documentIds = null) {
  const documents = loadDocuments();
  
  // Filtrar por documentos específicos
  let relevantDocs = documents;
  if (documentIds && documentIds.length > 0) {
    relevantDocs = documents.filter(doc => documentIds.includes(doc.id));
  }
  
  if (relevantDocs.length === 0) {
    return { context: "", chunks: [] };
  }
  
  // Búsqueda simple por palabras clave
  const queryWords = query.toLowerCase().split(/\s+/);
  const allChunks = [];
  
  relevantDocs.forEach(doc => {
    doc.chunks.forEach((chunk, index) => {
      const chunkLower = chunk.toLowerCase();
      // Contar cuántas palabras de la query aparecen en el chunk
      const matchCount = queryWords.filter(word => 
        chunkLower.includes(word)
      ).length;
      
      if (matchCount > 0) {
        allChunks.push({
          documentId: doc.id,
          text: chunk,
          chunkIndex: index,
          score: matchCount / queryWords.length // Porcentaje de coincidencia
        });
      }
    });
  });
  
  // Ordenar por relevancia y tomar los top 5
  const ranked = allChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  // Si no hay coincidencias, usar los primeros chunks del documento
  if (ranked.length === 0 && relevantDocs.length > 0) {
    const doc = relevantDocs[0];
    const firstChunks = doc.chunks.slice(0, 5);
    return {
      context: firstChunks.join("\n\n"),
      chunks: firstChunks.map((chunk, i) => ({
        documentId: doc.id,
        text: chunk.substring(0, 100) + "...",
        score: 0
      }))
    };
  }
  
  const context = ranked.map(r => r.text).join("\n\n");
  
  return {
    context: context,
    chunks: ranked.map(r => ({
      documentId: r.documentId,
      text: r.text.substring(0, 100) + "...",
      score: r.score
    }))
  };
}