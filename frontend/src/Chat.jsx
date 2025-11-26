import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";

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

export default function ModernChat() {
    const [conversations, setConversations] = useState([]);
    const [currentConversationId, setCurrentConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const chatBoxRef = useRef(null);
    const streamingContentRef = useRef("");

    useEffect(() => {
        loadConversations();
    }, []);

    useEffect(() => {
        if (currentConversationId) {
            loadMessages(currentConversationId);
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
        } catch (error) {
            console.error("Error cargando mensajes:", error);
        }
    };

    const createNewConversation = async () => {
        try {
            const response = await fetch("http://localhost:3000/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Nueva conversación" })
            });
            const data = await response.json();
            setCurrentConversationId(data.id);
            setMessages([]);
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
            }
        } catch (error) {
            console.error("Error eliminando conversación:", error);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        let convId = currentConversationId;
        if (!convId) {
            const response = await fetch("http://localhost:3000/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: input.substring(0, 50) })
            });
            const data = await response.json();
            convId = data.id;
            setCurrentConversationId(convId);
            await loadConversations();
        }

        const messageToSend = input.trim();
        setInput("");
        setIsLoading(true);
        streamingContentRef.current = "";

        const userMessage = { role: "user", content: messageToSend };
        const botMessage = { role: "bot", content: "" };
        
        setMessages(prevMessages => [...prevMessages, userMessage, botMessage]);

        try {
            const encodedMessage = encodeURIComponent(messageToSend);
            const response = await fetch(
                `http://localhost:3000/chat-stream?message=${encodedMessage}&conversationId=${convId}`
            );

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

    return (
        <div className="modern-chat-wrapper">
            <div className={`modern-sidebar ${showSidebar ? 'show' : 'hide'}`}>
                <div className="sidebar-header">
                    <div className="app-title">
                        <div className="app-icon">
                            <img src={chatIcon} alt="Logo" className="svg-icon" />
                        </div>
                        <span>SpeakSense</span>
                    </div>
                    <button className="toggle-btn" onClick={() => setShowSidebar(!showSidebar)}>
                        <img 
                            src={showSidebar ? arrowLeftIcon : arrowRightIcon} 
                            alt="Toggle Sidebar" 
                            className="svg-icon small" 
                        />
                    </button>
                </div>
                <button className="new-chat-btn" onClick={createNewConversation}>
                    <span className="plus-icon">
                        <img src={plusIcon} alt="New" className="svg-icon small" />
                    </span>
                    Nuevo chat
                </button>

                <div className="sidebar-section">
                    <h3 className="section-title">Historial de chats</h3>
                    <div className="conversations-container">
                        {conversations.map((conv) => (
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
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="modern-chat-main">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <div className="orb-container">
                            <div className="orb"></div>
                        </div>
                        <h1 className="empty-title">Ready to Create Something New?</h1>
                        <p className="empty-subtitle">Start a conversation and let AI assist you</p>
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
                                    <div className="message-text">{msg.content || "..."}</div>
                                </div>
                            </div>
                        ))}
                        <div style={{ height: '1px' }} />
                    </div>
                )}

                {/* Input Area */}
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
                            placeholder="Ask Anything..."
                            disabled={isLoading}
                            className="modern-input"
                        />
                        <div className="input-actions">
                            <button className="action-btn" title="Attach">
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
    );
}