import React, { useState, useEffect,useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { assets } from "../assets/assets";
import Message from "./Message";

const ChatBox = () => {
  const { selectedChat, theme } = useAppContext();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("text");
  const [isPublished, setIsPublished] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (prompt.trim() === "") return;
    setLoading(true);
  };
  useEffect(() => {
    if (selectedChat) {
      setMessages(selectedChat.messages);
    }
  }, [selectedChat]); 

  useEffect(() => {
    if (messages.length > 0 && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);
  const containerRef = useRef(null);
  return (
    <div className="flex flex-1 flex-col justify-between h-screen">
      {/* {chat messages} */}
      <div ref={containerRef}
        className={`flex flex-col flex-1 gap-0.5 px-8 py-4 overflow-y-auto ${
          messages.length === 0
            ? "items-center justify-center text-center gap-3 "
            : "items-start justify-start"
        }`}
      >
        {messages.length === 0 ? (
          <>
            <img
              src={theme === "dark" ? assets.logo_full : assets.logo_full_dark}
              alt="logo"
              className="w-full max-w-56 sm:max-w-64 drop-shadow-2xl"
            />

            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500 via-white to-green-600 shadow-lg">
              <span className="text-xs font-semibold tracking-widest text-black">
                MADE IN INDIA
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 bg-clip-text pb-2 text-transparent">
              Ask me anything...
            </h1>

            <p className="text-gray-500  dark:text-gray-400 text-sm sm:text-base max-w-md leading-relaxed">
              Powered with innovation. Built with passion.
            </p>
          </>
        ) : (
          messages.map((message, index) => (
            <Message key={index} message={message} />
          ))
        )}

        {/* {3 dots loading animation} */}

        {loading && (
          <div className="loader flex items-start gap-1.5 ">
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate bounce"></div>
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate bounce"></div>
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate bounce"></div>
          </div>
        )}
      </div>
      {mode === "image" && (
        <label className="inline-flex  justify-start items-center gap-2 mb-3 text-m mx-auto text-gray-500 dark:text-gray-400 mb-2">
          <p className="font-bold text-gray-700 dark:text-gray-300">Publish Generated Image to Community</p>
          <input type="checkbox" checked={isPublished} onChange={() => setIsPublished(!isPublished)} className="scale-150"/>
        </label>
      )}
      {/* {input box} */}
      <form
        onSubmit={onSubmit}
        className="bg-primary/20 dark:bg-[#583C79]/30 border border -primary dark:border-[#90609F]/30 rounded-full w-full max-w-3xl p-3 pl-4 mx-auto flex gap-4 items-center mb-16"
      >
        <select
          onChange={(e) => setMode(e.target.value)}
          value={mode}
          className="text-sm pl-2 pr-2 outline-none bg-primary/20 dark:bg-[#583C79]/30  rounded-full py-1 
        border border-primary dark:border-[#90609F]/30"
        >
          <option className="bg-gray-800 text-white" value="image">
            Image
          </option>
          <option className="bg-gray-800 text-white" value="text">
            Text
          </option>
        </select>
        <input
          type="text"
          placeholder="Type your prompt here"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="flex-1 w-full text-sm outline-none"
          required
        />
        <button>
          <img
            src={loading ? assets.stop_icon : assets.send_icon}
            alt=""
            className="w-8 cursor pointer"
          />
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
