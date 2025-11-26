import { useState } from "react";

export default function useStream() {
  const [streamingText, setStreamingText] = useState("");

  const startStream = (userMessage) => {
    setStreamingText("");

    const eventSource = new EventSource(
      `http://localhost:3000/chat-stream?message=${encodeURIComponent(userMessage)}`
    );

    eventSource.onmessage = (event) => {
      if (event.data === "[END]") {
        eventSource.close();
        return;
      }
      setStreamingText((prev) => prev + event.data);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  return { streamingText, startStream };
}
