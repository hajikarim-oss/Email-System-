/**
 * VOICE-ENABLED AI ASSISTANT
 * Speaks your language, understands your data
 */

import React, { useState, useRef, useEffect } from "react";
import { Mic, Send, Loader, AlertCircle, Volume2, X } from "lucide-react";

interface VoiceMessage {
  id: string;
  type: "user" | "assistant";
  text: string;
  timestamp: Date;
  isSpoken?: boolean;
}

interface ProcessedVoiceInput {
  intent: string;
  understood: boolean;
  response: string;
  action?: string;
  voiceFormat: string;
}

export default function VoiceAssistant({ userId }: { userId: string }) {
  // State
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: "welcome",
      type: "assistant",
      text: "Hey there! I'm your AI assistant. Ask me about your campaigns, leads, replies, automation, or anything else about your system. Just speak naturally!",
      timestamp: new Date(),
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Refs
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (!typeof window) return;

    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          handleVoiceInput(finalTranscript.trim());
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        setError(`Microphone error: ${event.error}`);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    // Initialize speech synthesis
    synthRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle voice input from microphone
  async function handleVoiceInput(transcribedText: string) {
    setIsListening(false);
    setIsProcessing(true);

    try {
      // Add user message
      const userMessage: VoiceMessage = {
        id: Math.random().toString(),
        type: "user",
        text: transcribedText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Send to backend
      const response = await fetch("/api/voice/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcribedText,
          userId,
          voiceFormat: "speech",
        }),
      });

      if (!response.ok) throw new Error("Voice processing failed");

      const data = (await response.json()) as {
        response: string;
        intent: string;
        understood: boolean;
      };

      // Add assistant response
      const assistantMessage: VoiceMessage = {
        id: Math.random().toString(),
        type: "assistant",
        text: data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Speak the response
      speakText(data.response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);

      const errorMessageObj: VoiceMessage = {
        id: Math.random().toString(),
        type: "assistant",
        text: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessageObj]);
    } finally {
      setIsProcessing(false);
    }
  }

  // Text-to-speech
  function speakText(text: string) {
    if (!synthRef.current) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;

    synthRef.current.cancel();
    synthRef.current.speak(utterance);
  }

  // Start listening
  function startListening() {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    } else {
      setError("Speech recognition not supported in your browser");
    }
  }

  // Manual text input
  async function handleTextInput(text: string) {
    if (!text.trim()) return;
    await handleVoiceInput(text);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Main Assistant Bubble */}
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all"
          title="Open voice assistant"
        >
          <Mic className="w-6 h-6" />
        </button>
      ) : (
        /* Expanded Assistant Panel */
        <div className="bg-white rounded-lg shadow-2xl w-96 h-[600px] flex flex-col border border-gray-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg">Email System AI</h2>
              <p className="text-sm opacity-90">Your intelligent assistant</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:opacity-80">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    message.type === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-white text-gray-900 border border-gray-200 rounded-bl-none shadow-sm"
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <p className={`text-xs mt-1 ${message.type === "user" ? "opacity-70" : "opacity-50"}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-900 px-4 py-2 rounded-lg border border-gray-200 rounded-bl-none">
                  <Loader className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 mx-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
            {/* Voice Button */}
            <button
              onClick={startListening}
              disabled={isListening || isProcessing}
              className={`w-full py-3 px-4 rounded-lg font-medium mb-3 transition-all flex items-center justify-center gap-2 ${
                isListening ? "bg-red-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />
              {isListening ? "Listening..." : "Click to Speak"}
            </button>

            {/* Text Input */}
            <TextInputField onSubmit={handleTextInput} disabled={isProcessing} />

            {/* Quick Commands */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuickButton text="How's my status?" onClick={() => handleTextInput("How are my campaigns doing?")} />
              <QuickButton text="Recent replies?" onClick={() => handleTextInput("What recent replies did I get?")} />
              <QuickButton text="Pending approval" onClick={() => handleTextInput("How many emails are pending approval?")} />
              <QuickButton text="Suggestions?" onClick={() => handleTextInput("What improvements do you suggest?")} />
            </div>

            {/* Info */}
            <p className="text-xs text-gray-500 text-center mt-3">Speak naturally or use text input above</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * TEXT INPUT FIELD COMPONENT
 */
function TextInputField({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText("");
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Or type your question..."
        disabled={disabled}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * QUICK COMMAND BUTTON
 */
function QuickButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
    >
      {text}
    </button>
  );
}
