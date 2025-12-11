import React, { useState, useRef } from "react";
import "./VoiceRecorder.css";
import microphoneIcon from "./icons/microphone.svg";

export default function VoiceRecorder({ onTranscription }) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerIntervalRef = useRef(null);
    const chunkIntervalRef = useRef(null);
    const chunkCountRef = useRef(0);
    const accumulatedTextRef = useRef("");

    const startRecording = async () => {
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
            chunkCountRef.current = 0;
            accumulatedTextRef.current = "";

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("📌 MediaRecorder detenido");
                
                if (audioChunksRef.current.length > 0) {
                    const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    await transcribeChunk(finalBlob, true);
                }
                
                setTimeout(() => {
                    const finalText = accumulatedTextRef.current;
                    console.log("✅ Texto final acumulado:", finalText);
                    
                    if (onTranscription && finalText) {
                        console.log("🔔 Enviando al input:", finalText);
                        onTranscription(finalText);
                    } else {
                        console.warn("⚠️ No hay texto para enviar");
                    }
                    
                    accumulatedTextRef.current = "";
                }, 1000);
                
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(2000);
            
            chunkIntervalRef.current = setInterval(() => {
                if (mediaRecorder.state === "recording") {
                    mediaRecorder.requestData();
                }
            }, 2000);

            setIsRecording(true);
            setRecordingTime(0);
            
            timerIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            console.log("🎤 Grabación iniciada (streaming)");
        } catch (error) {
            console.error("Error al acceder al micrófono:", error);
            alert("No se pudo acceder al micrófono. Verifica los permisos.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
            
            if (chunkIntervalRef.current) {
                clearInterval(chunkIntervalRef.current);
            }
            
            console.log("⏹️ Grabación detenida");
        }
    };

    const transcribeChunk = async (audioBlob, isFinal = false) => {
        if (audioBlob.size < 1000) return;

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'chunk.webm');
            formData.append('language', 'es');
            formData.append('chunk_index', chunkCountRef.current.toString());

            const response = await fetch("http://localhost:5000/transcribe-chunk", {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (data.success && data.text) {
                chunkCountRef.current++;
                
                const previousText = accumulatedTextRef.current;
                const newText = previousText + (previousText ? " " : "") + data.text;
                accumulatedTextRef.current = newText;
                
                console.log(`📝 Chunk ${data.chunk_index}: "${data.text}"`);
                console.log(`📝 Texto acumulado total: "${newText}"`);
            }
        } catch (error) {
            console.error("❌ Error en chunk:", error);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <button 
            className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            title={isRecording ? `Detener grabación (${formatTime(recordingTime)})` : "Grabar audio"}
        >
            {isRecording && <span className="recording-pulse"></span>}
            <img 
                src={microphoneIcon} 
                alt={isRecording ? "Detener" : "Grabar"} 
                className={`mic-icon-svg ${isRecording ? 'recording-icon' : ''}`}
            />
        </button>
    );
}