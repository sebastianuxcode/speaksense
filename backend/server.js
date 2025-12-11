import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";
import fs from "fs";
import { 
  processDocument, 
  deleteDocument, 
  getAllDocuments, 
  searchInDocuments 
} from "./document-processor-simple.js";

const app = express();
app.use(cors());
app.use(express.json());

// Configurar multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "./uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo PDF, TXT, DOC, DOCX"));
    }
  }
});

// Inicializar base de datos SQLite
const db = new Database("chat_history.db");

// Crear tablas si no existen
db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        title TEXT,
        document_id TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
`);

// ==================== ENDPOINTS DE DOCUMENTOS ====================

// Subir y procesar documento
app.post("/upload-document", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se subió ningún archivo" });
    }

    console.log("Archivo recibido:", req.file.originalname);

    const result = await processDocument(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );

    // Eliminar archivo temporal después de procesar
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      document: result
    });
  } catch (error) {
    console.error("Error procesando documento:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener lista de documentos
app.get("/documents", (req, res) => {
  try {
    const documents = getAllDocuments();
    res.json(documents);
  } catch (error) {
    console.error("Error obteniendo documentos:", error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar documento
app.delete("/documents/:id", (req, res) => {
  try {
    const result = deleteDocument(req.params.id);
    res.json(result);
  } catch (error) {
    console.error("Error eliminando documento:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENDPOINTS DE CONVERSACIONES ====================

// Obtener todas las conversaciones
app.get("/conversations", (req, res) => {
    try {
        const conversations = db.prepare(`
            SELECT c.*, COUNT(m.id) as message_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `).all();
        
        res.json(conversations);
    } catch (error) {
        console.error("Error obteniendo conversaciones:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear nueva conversación
app.post("/conversations", (req, res) => {
    try {
        const { title, documentId } = req.body;
        const result = db.prepare(`
            INSERT INTO conversations (title, document_id) VALUES (?, ?)
        `).run(title || "Nueva conversación", documentId || null);
        
        res.json({ 
          id: result.lastInsertRowid, 
          title,
          documentId 
        });
    } catch (error) {
        console.error("Error creando conversación:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener mensajes de una conversación
app.get("/conversations/:id/messages", (req, res) => {
    try {
        const messages = db.prepare(`
            SELECT * FROM messages 
            WHERE conversation_id = ? 
            ORDER BY created_at ASC
        `).all(req.params.id);
        
        res.json(messages);
    } catch (error) {
        console.error("Error obteniendo mensajes:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar conversación
app.delete("/conversations/:id", (req, res) => {
    try {
        db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(req.params.id);
        db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error("Error eliminando conversación:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CHAT CON RAG ====================

app.get("/chat-stream", async (req, res) => {
    const message = req.query.message;
    const conversationId = req.query.conversationId;
    const documentId = req.query.documentId;
    const ragMode = req.query.ragMode || "hybrid"; // "strict" o "hybrid"

    console.log("Mensaje recibido:", message);
    console.log("Conversation ID:", conversationId);
    console.log("Document ID:", documentId);
    console.log("RAG Mode:", ragMode);

    // Configurar SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
        // Guardar mensaje del usuario en BD si hay conversationId
        if (conversationId) {
            db.prepare(`
                INSERT INTO messages (conversation_id, role, content) 
                VALUES (?, ?, ?)
            `).run(conversationId, "user", message);
        }

        // Obtener historial de la conversación
        let history = [];
        if (conversationId) {
            history = db.prepare(`
                SELECT role, content FROM messages 
                WHERE conversation_id = ? 
                ORDER BY created_at ASC
            `).all(conversationId);
        }

        // Si hay documentId, usar RAG
        let finalMessages = [];
        if (documentId && documentId !== 'null' && documentId !== 'undefined') {
            console.log("Usando RAG para documento:", documentId);
            
            try {
                // Buscar contexto relevante (ahora es síncrono)
                const { context, chunks } = searchInDocuments(message, [documentId]);
                
                console.log(`Encontrados ${chunks.length} chunks relevantes`);
                
                // Crear prompt según el modo
                let ragPrompt;
                
                if (ragMode === "strict") {
                    // Modo estricto: solo documento
                    ragPrompt = `Basándote ÚNICAMENTE en la siguiente información del documento, responde la pregunta del usuario. Si la información no está en el documento, di claramente que no puedes responder basándote en el documento proporcionado.

CONTEXTO DEL DOCUMENTO:
${context}

PREGUNTA DEL USUARIO: ${message}

RESPUESTA:`;
                } else {
                    // Modo híbrido: documento + conocimiento general
                    ragPrompt = `Tienes acceso a la siguiente información de un documento. Úsala como referencia principal para responder, pero también puedes complementar con tu conocimiento general cuando sea relevante y útil. Indica claramente cuando estás usando información del documento vs. conocimiento general.

INFORMACIÓN DEL DOCUMENTO:
${context}

PREGUNTA DEL USUARIO: ${message}

INSTRUCCIONES:
- Prioriza la información del documento cuando responda directamente a la pregunta
- Si el documento no tiene toda la información, puedes complementar con conocimiento general
- Indica la fuente de tu información ("Según el documento..." o "Basándome en conocimiento general...")

RESPUESTA:`;
                }

                finalMessages = [
                    ...history.slice(0, -1).map(msg => ({
                        role: msg.role === "bot" ? "assistant" : msg.role,
                        content: msg.content
                    })),
                    {
                        role: "user",
                        content: ragPrompt
                    }
                ];
            } catch (ragError) {
                console.error("Error en RAG:", ragError);
                // Si falla RAG, continuar con chat normal
                finalMessages = history.map(msg => ({
                    role: msg.role === "bot" ? "assistant" : msg.role,
                    content: msg.content
                }));
                
                if (finalMessages.length === 0) {
                    finalMessages = [{ role: "user", content: message }];
                }
            }
        } else {
            // Chat normal sin RAG
            finalMessages = history.map(msg => ({
                role: msg.role === "bot" ? "assistant" : msg.role,
                content: msg.content
            }));
            
            if (finalMessages.length === 0) {
                finalMessages = [{ role: "user", content: message }];
            }
        }

        console.log("Conectando a LM Studio...");

        // Petición a LM Studio
        const response = await fetch("http://192.168.1.24:1234/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "lmstudio",
                messages: finalMessages,
                stream: true,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        console.log("Respuesta de LM Studio:", response.status);

        if (!response.ok) {
            throw new Error(`LM Studio error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botResponse = "";

        console.log("Iniciando streaming...");

        // Leer chunks del modelo
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });

            const lines = text
                .split("\n")
                .filter((line) => line.startsWith("data: "));

            for (const line of lines) {
                const json = line.replace("data: ", "").trim();
                if (json === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(json);
                    const token = parsed.choices?.[0]?.delta?.content;

                    if (token) {
                        botResponse += token;
                        res.write(`data: ${token}\n\n`);
                    }
                } catch (err) {
                    console.error("Error parsing JSON:", err);
                }
            }
        }

        // Guardar respuesta completa del bot en BD si hay conversationId
        if (conversationId && botResponse) {
            db.prepare(`
                INSERT INTO messages (conversation_id, role, content) 
                VALUES (?, ?, ?)
            `).run(conversationId, "bot", botResponse);
        }

        console.log("Streaming completado");

        res.write("data: [END]\n\n");
        res.end();
    } catch (error) {
        console.error("Error completo:", error);
        res.write(`data: Error: ${error.message}\n\n`);
        res.end();
    }
});

// ==================== OTROS ENDPOINTS ====================

// Endpoint de salud
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint para ver TODOS los datos de la BD (solo para desarrollo)
app.get("/debug/database", (req, res) => {
    try {
        const conversations = db.prepare("SELECT * FROM conversations").all();
        const messages = db.prepare("SELECT * FROM messages").all();
        const documents = getAllDocuments();
        
        res.json({
            total_conversations: conversations.length,
            total_messages: messages.length,
            total_documents: documents.length,
            conversations: conversations,
            messages: messages,
            documents: documents
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor con RAG listo en http://localhost:${PORT}`);
    console.log(`📡 Conectando a LM Studio en http://192.168.1.24:1234`);
    console.log(`📁 Carga de documentos habilitada`);
});