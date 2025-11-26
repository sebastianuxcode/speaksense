import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar base de datos SQLite
const db = new Database("chat_history.db");

// Crear tablas si no existen
db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        title TEXT
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

// Endpoint para obtener todas las conversaciones
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

// Endpoint para crear nueva conversación
app.post("/conversations", (req, res) => {
    try {
        const { title } = req.body;
        const result = db.prepare(`
            INSERT INTO conversations (title) VALUES (?)
        `).run(title || "Nueva conversación");
        
        res.json({ id: result.lastInsertRowid, title });
    } catch (error) {
        console.error("Error creando conversación:", error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener mensajes de una conversación
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

// ENDPOINT ORIGINAL: GET /chat-stream (compatibilidad con tu código existente)
app.get("/chat-stream", async (req, res) => {
    const message = req.query.message;
    const conversationId = req.query.conversationId;

    console.log("Mensaje recibido:", message);
    console.log("Conversation ID:", conversationId);

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
        } else {
            // Si no hay conversación, solo enviar el mensaje actual
            history = [{ role: "user", content: message }];
        }

        console.log("Conectando a LM Studio...");

        // Petición a LM Studio
        const response = await fetch("http://192.168.1.24:1234/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "lmstudio",
                messages: history.map(msg => ({
                    role: msg.role === "bot" ? "assistant" : msg.role,
                    content: msg.content
                })),
                stream: true
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

// Endpoint para eliminar conversación
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

// Endpoint de salud
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint para ver TODOS los datos de la BD (solo para desarrollo)
app.get("/debug/database", (req, res) => {
    try {
        const conversations = db.prepare("SELECT * FROM conversations").all();
        const messages = db.prepare("SELECT * FROM messages").all();
        
        res.json({
            total_conversations: conversations.length,
            total_messages: messages.length,
            conversations: conversations,
            messages: messages
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor con streaming y BD listo en http://localhost:${PORT}`);
    console.log(`Conectando a LM Studio en http://192.168.1.24:1234`);
});
