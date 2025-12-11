import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

import logoApp from "./icons/logo-speaksense-blanco.svg";
import chatIcon from "./icons/chat.svg";
import plusIcon from "./icons/plus.svg";
import trashIcon from "./icons/trash.svg";
import userIcon from "./icons/user.svg";
import botIcon from "./icons/bot.svg";
import sparklesIcon from "./icons/sparkles.svg";
import clipIcon from "./icons/clip.svg";
import sendIcon from "./icons/send.svg";
import arrowLeftIcon from "./icons/sidebar.svg";
import arrowRightIcon from "./icons/sidebar.svg";
import documentIcon from "./icons/document.svg";
import lockIcon from "./icons/refresh.svg";
import refreshIcon from "./icons/lock.svg";
import microphoneIcon from "./icons/microphone.svg";
import microfoneRedIcon from "./icons/microphone-red.svg";

export default function ModernChat() {
    const [conversations, setConversations] = useState([]);
    const [currentConversationId, setCurrentConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [hasStartedChat, setHasStartedChat] = useState(false); // Nuevo estado
    
    // Estados para documentos
    const [documents, setDocuments] = useState([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [ragMode, setRagMode] = useState("hybrid");
    const [showRagModeDropdown, setShowRagModeDropdown] = useState(false);
    
    // Estado para grabación de voz
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    
    const chatBoxRef = useRef(null);
    const streamingContentRef = useRef("");
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        loadConversations();
        loadDocuments();
    }, []);

    useEffect(() => {
        if (currentConversationId) {
            loadMessages(currentConversationId);
        } else {
            // Si no hay conversación, resetear estado
            setMessages([]);
            setHasStartedChat(false);
        }
    }, [currentConversationId]);

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTo({
                top: chatBoxRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages]);

    useEffect(() => {
        if (isLoading && chatBoxRef.current) {
            const scrollInterval = setInterval(() => {
                if (chatBoxRef.current) {
                    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
                }
            }, 100);
            return () => clearInterval(scrollInterval);
        }
    }, [isLoading]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showRagModeDropdown && !event.target.closest('.custom-select-wrapper')) {
                setShowRagModeDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showRagModeDropdown]);

    // ============= CALLBACK PARA TRANSCRIPCIÓN =============
    const handleTranscription = (text) => {
        console.log("📝 Texto transcrito recibido en Chat.jsx:", text);
        setInput(text);
    };

    // ============= FUNCIONES DE GRABACIÓN DE VOZ =============
    const startVoiceRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                } 
            });

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await transcribeAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log("🎤 Grabación iniciada");
        } catch (error) {
            console.error("Error al acceder al micrófono:", error);
            alert("No se pudo acceder al micrófono. Verifica los permisos.");
        }
    };

    const stopVoiceRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            console.log("⏹️ Grabación detenida");
        }
    };

    const transcribeAudio = async (audioBlob) => {
        setIsTranscribing(true);

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('language', 'es');

            console.log("📤 Enviando audio al servidor...");
            
            const response = await fetch("http://localhost:5000/transcribe", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                console.log("✅ Transcripción recibida:", data.text);
                setInput(data.text);
            } else {
                throw new Error(data.error || "Error en la transcripción");
            }
        } catch (error) {
            console.error("❌ Error en transcripción:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsTranscribing(false);
        }
    };

    const toggleVoiceRecording = () => {
        if (isRecording) {
            stopVoiceRecording();
        } else {
            startVoiceRecording();
        }
    };

    const loadConversations = async () => {
        try {
            const response = await fetch("http://localhost:3000/conversations");
            const data = await response.json();
            setConversations(data);
        } catch (error) {
            console.error("Error cargando conversaciones:", error);
        }
    };

    const loadMessages = async (conversationId) => {
        try {
            const response = await fetch(`http://localhost:3000/conversations/${conversationId}/messages`);
            const data = await response.json();
            setMessages(data);
            if (data.length > 0) {
                setHasStartedChat(true);
            }
        } catch (error) {
            console.error("Error cargando mensajes:", error);
        }
    };

    const loadDocuments = async () => {
        try {
            const response = await fetch("http://localhost:3000/documents");
            const data = await response.json();
            setDocuments(data);
        } catch (error) {
            console.error("Error cargando documentos:", error);
        }
    };

    const createNewConversation = async () => {
        try {
            const response = await fetch("http://localhost:3000/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    title: "Nueva conversación",
                    documentId: selectedDocumentId 
                })
            });
            const data = await response.json();
            setCurrentConversationId(data.id);
            setMessages([]);
            setHasStartedChat(false);
            await loadConversations();
        } catch (error) {
            console.error("Error creando conversación:", error);
        }
    };

    const deleteConversation = async (conversationId, e) => {
        e.stopPropagation();
        if (!window.confirm("¿Eliminar esta conversación?")) return;
        
        try {
            await fetch(`http://localhost:3000/conversations/${conversationId}`, {
                method: "DELETE"
            });
            await loadConversations();
            if (currentConversationId === conversationId) {
                setCurrentConversationId(null);
                setMessages([]);
                setHasStartedChat(false);
            }
        } catch (error) {
            console.error("Error eliminando conversación:", error);
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("document", file);

        setIsUploading(true);

        try {
            const response = await fetch("http://localhost:3000/upload-document", {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert(`✅ Documento "${data.document.filename}" procesado correctamente!\n${data.document.chunks} fragmentos creados.`);
                await loadDocuments();
            } else {
                console.error("Error del servidor:", data);
                alert(`❌ Error al procesar el documento:\n${data.error || "Error desconocido"}`);
            }
        } catch (error) {
            console.error("Error subiendo documento:", error);
            alert(`❌ Error al subir el documento:\n${error.message}`);
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const deleteDocument = async (docId, e) => {
        e.stopPropagation();
        if (!window.confirm("¿Eliminar este documento y todos sus datos?")) return;

        try {
            await fetch(`http://localhost:3000/documents/${docId}`, {
                method: "DELETE"
            });
            await loadDocuments();
            if (selectedDocumentId === docId) {
                setSelectedDocumentId(null);
            }
        } catch (error) {
            console.error("Error eliminando documento:", error);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const messageToSend = input.trim();
        
        // CRÍTICO: Marcar que el chat ha comenzado ANTES de cualquier cosa
        setHasStartedChat(true);
        
        // Crear los mensajes PRIMERO antes de limpiar el input
        const userMessage = { role: "user", content: messageToSend };
        const botMessage = { role: "bot", content: "" };
        
        // Actualizar los mensajes INMEDIATAMENTE
        setMessages(prevMessages => [...prevMessages, userMessage, botMessage]);
        
        // Ahora sí limpiamos el input y marcamos como cargando
        setInput("");
        setIsLoading(true);
        streamingContentRef.current = "";
        
        let convId = currentConversationId;
        if (!convId) {
            try {
                const response = await fetch("http://localhost:3000/conversations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        title: messageToSend.substring(0, 50),
                        documentId: selectedDocumentId 
                    })
                });
                const data = await response.json();
                convId = data.id;
                setCurrentConversationId(convId);
                await loadConversations();
            } catch (error) {
                console.error("Error creando conversación:", error);
                setIsLoading(false);
                // No resetear hasStartedChat aquí para evitar parpadeo
                return;
            }
        }

        try {
            const encodedMessage = encodeURIComponent(messageToSend);
            let url = `http://localhost:3000/chat-stream?message=${encodedMessage}&conversationId=${convId}`;
            
            if (selectedDocumentId) {
                url += `&documentId=${selectedDocumentId}&ragMode=${ragMode}`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const text = line.replace("data: ", "").trim();
                        if (text === "[END]" || text === "[DONE]") break;

                        streamingContentRef.current += text;
                        setMessages(prevMessages => {
                            const newMessages = [...prevMessages];
                            newMessages[newMessages.length - 1] = {
                                role: "bot",
                                content: streamingContentRef.current
                            };
                            return newMessages;
                        });
                    }
                }
            }
            await loadMessages(convId);
            await loadConversations();
        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                newMessages[newMessages.length - 1] = {
                    role: "bot",
                    content: "❌ Error al conectar con el servidor."
                };
                return newMessages;
            });
        } finally {
            setIsLoading(false);
            streamingContentRef.current = "";
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const formatMarkdown = (text) => {
        if (!text) return "";
        
        let formatted = text;
        
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
        formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        formatted = formatted.replace(/\n/g, '<br/>');
        
        return formatted;
    };

    const selectedDoc = documents.find(d => d.id === selectedDocumentId);

    return (
        <div className="modern-chat-wrapper">
            <div className={`modern-sidebar ${showSidebar ? 'show' : 'hide'}`}>
                <div className="sidebar-header">
                    <div className="app-title">
                        <div className="app-icon">
                            <img src={logoApp} alt="Logo" className="svg-icon" />
                        </div>
                        <span>SpeakSense</span>
                    </div>
                </div>

                <button className="new-chat-btn" onClick={createNewConversation}>
                    <span className="plus-icon">
                        <img src={plusIcon} alt="New" className="svg-icon small" />
                    </span>
                    Nuevo chat
                </button>

                <div className="sidebar-section">
                    <h3 className="section-title">Documentos</h3>
                    
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.doc,.docx"
                        style={{ display: "none" }}
                        onChange={handleFileSelect}
                    />

                    <div className="documents-container">
                        {documents.length === 0 ? (
                            <p className="empty-message">No hay documentos cargados</p>
                        ) : (
                            documents.map((doc) => (
                                <div 
                                    key={doc.id}
                                    className={`document-card ${selectedDocumentId === doc.id ? 'active' : ''}`}
                                    onClick={() => setSelectedDocumentId(
                                        selectedDocumentId === doc.id ? null : doc.id
                                    )}
                                >
                                    <div className="document-info">
                                        <span className="document-icon">
                                            <img src={documentIcon} alt="Document" className="svg-icon small" />
                                        </span>
                                        <div className="document-text">
                                            <div className="document-name">
                                                {doc.filename}
                                            </div>
                                            <div className="document-meta">
                                                {doc.totalChunks} fragmentos
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        className="delete-doc-btn"
                                        onClick={(e) => deleteDocument(doc.id, e)}
                                    >
                                        <img src={trashIcon} alt="Delete" className="svg-icon small" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="sidebar-section">
                    <h3 className="section-title">Historial de chats</h3>
                    <div className="conversations-container">
                        {conversations.length === 0 ? (
                            <p className="empty-message">No hay conversaciones guardadas</p>
                        ) : (
                            conversations.map((conv) => (
                                <div 
                                    key={conv.id}
                                    className={`conversation-card ${currentConversationId === conv.id ? 'active' : ''}`}
                                    onClick={() => setCurrentConversationId(conv.id)}
                                >
                                    <div className="conversation-info">
                                        <span className="conversation-icon">
                                            <img src={chatIcon} alt="Chat" className="svg-icon small" />
                                        </span>
                                        <div className="conversation-text">
                                            <div className="conversation-title">
                                                {conv.title || `Conversación ${conv.id}`}
                                            </div>
                                            <div className="conversation-meta">
                                                {conv.message_count} mensajes
                                                {conv.document_id && (
                                                    <>
                                                        {" • "}
                                                        <img src={documentIcon} alt="Document" className="svg-icon tiny inline-icon" />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        className="delete-conv-btn"
                                        onClick={(e) => deleteConversation(conv.id, e)}
                                    >
                                        <img src={trashIcon} alt="Delete" className="svg-icon small" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="modern-chat-main">
                {!hasStartedChat ? (
                    <div className="empty-state">
                        <div className="orb-container">
                            <div className="orb"></div>
                        </div>
                        <h1 className="empty-title">
                            {selectedDoc 
                                ? `Pregúntame sobre ${selectedDoc.filename}` 
                                : "Inicia una conversación o analiza tus archivos"
                            }
                        </h1>
                        <p className="empty-subtitle">
                            {selectedDoc 
                                ? "Haz preguntas sobre el contenido del documento" 
                                : "Sube tus documentos y deja que la IA te guíe a través de su contenido"
                            }
                        </p>
                    </div>
                ) : (
                    <div className="messages-container" ref={chatBoxRef}>
                        {messages.map((msg, i) => (
                            <div 
                                key={i} 
                                className={`message-bubble ${msg.role === "user" ? "user" : "bot"}`}
                            >
                                <div className="message-avatar">
                                    <img 
                                        src={msg.role === "user" ? userIcon : botIcon} 
                                        alt={msg.role} 
                                        className="svg-icon avatar" 
                                    />
                                </div>
                                <div className="message-content">
                                    <div 
                                        className="message-text"
                                        dangerouslySetInnerHTML={{ 
                                            __html: msg.role === "bot" 
                                                ? formatMarkdown(msg.content || "...") 
                                                : msg.content || "..."
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                        <div style={{ height: '1px' }} />
                    </div>
                )}

                <div className="input-area-wrapper">
                    {selectedDoc && (
                        <div className="active-document-banner">
                            <div className="banner-left">
                                <img src={documentIcon} alt="Document" className="svg-icon small" />
                                <span>Consultando: <strong>{selectedDoc.filename}</strong></span>
                            </div>
                            <div className="banner-right">
                                <div className="custom-select-wrapper">
                                    <button 
                                        className="custom-select-button"
                                        onClick={() => setShowRagModeDropdown(!showRagModeDropdown)}
                                    >
                                        <img 
                                            src={ragMode === "hybrid" ? refreshIcon : lockIcon} 
                                            alt="Mode" 
                                            className="svg-icon tiny" 
                                        />

                                        <span>{ragMode === "hybrid" ? "Modo Híbrido" : "Solo Documento"}</span>
                                        <span className="dropdown-arrow">{showRagModeDropdown ? "▲" : "▼"}</span>
                                    </button>
                                    
                                    {showRagModeDropdown && (
                                        <div className="custom-select-dropdown">
                                            <div 
                                                className={`custom-select-option ${ragMode === "hybrid" ? "active" : ""}`}
                                                onClick={() => {
                                                    setRagMode("hybrid");
                                                    setShowRagModeDropdown(false);
                                                }}
                                            >
                                                <img src={refreshIcon} alt="Hybrid" className="svg-icon tiny" />
                                                <span>Modo Híbrido</span>
                                            </div>
                                            <div 
                                                className={`custom-select-option ${ragMode === "strict" ? "active" : ""}`}
                                                onClick={() => {
                                                    setRagMode("strict");
                                                    setShowRagModeDropdown(false);
                                                }}
                                            >
                                                <img src={lockIcon} alt="Strict" className="svg-icon tiny" />
                                                <span>Solo Documento</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <button 
                                    className="close-doc-btn"
                                    onClick={() => setSelectedDocumentId(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="input-container">
                        <div className="input-wrapper">
                            <div className="input-icon">
                                <img src={sparklesIcon} alt="Sparkles" className="svg-icon" />
                            </div>
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={selectedDoc ? "Pregunta sobre el documento..." : "Pregunta lo que quieras..."}
                                disabled={isLoading}
                                className="modern-input"
                            />
                            <div className="input-actions">
                                <button 
                                    className={`action-btn mic-btn ${isRecording ? 'recording' : ''}`}
                                    title={isRecording ? "Detener grabación" : "Grabar audio"}
                                    onClick={toggleVoiceRecording}
                                    disabled={isTranscribing || isLoading}
                                >
                                    {isRecording ? (
                                        <img src={microfoneRedIcon} alt="Recording" className="svg-icon recording-dot" />
                                    ) : isTranscribing ? (
                                        <span className="transcribing">⏳</span>
                                    ) : (
                                        <img src={microphoneIcon} alt="Mic" className="svg-icon" />
                                    )}
                                </button>
                                <button 
                                    className="action-btn" 
                                    title="Cargar documento"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                >
                                    <img src={clipIcon} alt="Attach" className="svg-icon" />
                                </button>
                                <button 
                                    className="send-btn"
                                    onClick={sendMessage}
                                    disabled={isLoading || !input.trim()}
                                >
                                    <img src={sendIcon} alt="Send" className="svg-icon" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}