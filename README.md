# 🎙️ SpeakSense  
Sistema de chat con IA, RAG local y servicio de transcripción por voz

SpeakSense es una aplicación completa que integra:

- 🧠 **IA con RAG local** (LM Studio)
- 🔊 **Grabación y transcripción de voz** en tiempo real
- 💬 **Chat frontend con React**
- ⚙️ **Backend en Node.js** para procesamiento, embeddings y almacenamiento
- 🔉 **Microservicio de transcripción en Python**
- 📁 Gestión de documentos, vector store y base de datos SQLite

---

## 📁 Estructura del Proyecto
```
SPEAKSENSE/
│
├── backend/
│ ├── server.js
│ ├── rag.js
│ ├── embeddings.js
│ ├── document-processor-simple.js
│ ├── uploads/
│ ├── chat_history.db
│ ├── vector-store.json
│ └── package.json
│
├── frontend/
│ ├── src/
│ ├── public/
│ ├── vite.config.js
│ └── package.json
│
├── transcription-service/
│ ├── transcription_server.py
│ ├── requirements.txt
│ └── venv/
│
├── start_transcription.bat
├── .gitignore
└── README.md
```

---

## 🚀 Tecnologías principales

### **Frontend (React + Vite)**
- React 19
- Axios
- CSS modular
- Grabación de audio nativa
- Componente VoiceRecorder integrado al chat

### **Backend (Node.js + Express)**
- Express 5
- Better-SQLite3
- Multer (uploads)
- Mammoth (procesamiento de documentos)
- Integración con LM Studio vía API para embeddings y respuestas

### **Servicio de Transcripción (Python)**
- Python 3.x
- SpeechRecognition / Whisper (según configuración)
- API Flask (o servidor socket) para enviar transcripciones al frontend

---

## 🛠️ Instalación

### 🔹 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/speaksense.git
cd speaksense
```

### 🔹 2. Instalar el backend
```
cd backend
npm install
```

Ejecutar:
```
npm start
```

El servidor corre por defecto en:
```
http://localhost:3000
```

### 🔹 3. Instalar el frontend
```
cd ../frontend
npm install
npm run dev
```

Frontend corre en:
```
http://localhost:5173
```

### 🔹 4. Instalar el servicio de transcripción (Python)
```
cd ../transcription-service
python -m venv venv
venv/Scripts/activate   # En Windows
pip install -r requirements.txt
```

Iniciar el servidor:
```
python transcription_server.py
```
O en Windows:
```
start_transcription.bat
```
---
### 🧩 Arquitectura General
```
React (Frontend)
      │
      ▼
Node.js Backend (RAG + Embeddings + BD)
      │
      ▼
LM Studio (Local LLM)
      │
      └────────► Procesamiento de documentos, vector store

```
El servicio de transcripción funciona en paralelo y envía texto al frontend.

---
### 🧠 Flujo RAG

1. El usuario sube documentos (Word, texto).
2. El backend los convierte y limpia (Mammoth / PDF-parse).
3. Se generan embeddings usando LM Studio / OpenAI Compatible API.
4. Se almacenan en vector-store.json.
5. Cada pregunta:
  - Se vectoriza
  - Se buscan los chunks más relevantes
  - Se manda el contexto al LLM
  - El modelo responde de manera aumentada con información real del usuario

---
### 🎤 Flujo de Transcripción

1. El frontend activa el micrófono con un botón.
2. El audio se envía al servidor Python.
3. El servidor procesa (Whisper o SpeechRecognition).
4. Envía la transcripción al frontend.
5. El frontend la inserta automáticamente como prompt del chat.

---
### 📦 Scripts útiles

Backend
```
npm start
```

Frontend
```
npm run dev
npm run build
```

Transcripción
```
python transcription_server.py
```

---
### 📜 .gitignore recomendado

El proyecto incluye un .gitignore configurado para:
  - node_modules
  - dist
  - SQLite (*.db)
  - vector stores
  - venv de Python
  - uploads
  - caches de Vite
  - logs

---
### 📄 Licencia

MIT — Libre para uso personal.
