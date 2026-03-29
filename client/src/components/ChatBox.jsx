import React, { useState, useEffect,useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { assets } from "../assets/assets";
import Message from "./Message";
import toast from "react-hot-toast";

const findAssistantReplyIndexForUserMessage = (list, userMessageIndex) => {
  if (!Array.isArray(list) || userMessageIndex < 0) return -1;

  for (let i = userMessageIndex + 1; i < list.length; i += 1) {
    const current = list[i];
    if (current?.role === "assistant") return i;
    if (current?.role === "user") break;
  }

  return -1;
};

const isEditableUserTextMessage = (message) => {
  const messageType = String(message?.messageType || "").toLowerCase();
  const isFileMessage = messageType === "file";

  return (
    message?.role === "user" &&
    !message?.isImage &&
    !isFileMessage &&
    typeof message?.content === "string" &&
    message.content.trim().length > 0
  );
};

const ChatBox = () => {
  const { selectedChat, theme,axios,user,token,setUser } = useAppContext();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isStreamingReply, setIsStreamingReply] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("text");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [editTargetIndex, setEditTargetIndex] = useState(null);
  const [hiddenResponseIndexes, setHiddenResponseIndexes] = useState([]);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    messageIndex: null,
  });
  const streamIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const isImageMode = mode?.trim().toLowerCase() === "image";
  const isWebsiteMode = mode?.trim().toLowerCase() === "website";
  const isUploadQaMode = mode?.trim().toLowerCase() === "upload-qa";
  const promptPlaceholder = isImageMode
    ? "Describe the image you want to generate"
    : isWebsiteMode
      ? "Ask anything about pasted website URL"
      : isUploadQaMode
        ? "Ask anything "
        : "Type your prompt here";

  const deductCreditsSafely = (amount) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;

      const currentCredits = Number(prevUser.credits ?? 0);
      const nextCredits = Number.isFinite(currentCredits)
        ? Math.max(currentCredits - amount, 0)
        : 0;

      return {
        ...prevUser,
        credits: nextCredits,
      };
    });
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const sendMessageRequest = async (payload) => {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await axios.post(`/api/v1/messages/${mode}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        const shouldRetry = status === 429 && attempt < 2;

        if (shouldRetry) {
          await sleep(1200);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  };

  const sendUploadQaRequest = async ({ promptValue, file }) => {
    let lastError;
    const formData = new FormData();
    formData.append("chatId", selectedChat._id);
    formData.append("prompt", promptValue);
    if (file) {
      formData.append("file", file);
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await axios.post(`/api/v1/messages/upload-qa`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        });
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        const shouldRetry = status === 429 && attempt < 2;

        if (shouldRetry) {
          await sleep(1200);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onSelectFile = (e) => {
    const file = e?.target?.files?.[0] || null;
    setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearActiveStream = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreamingReply(false);
  };

  const appendReplyWithStreaming = async (reply, options = {}) => {
    const replaceIndex = Number.isInteger(options?.replaceIndex)
      ? options.replaceIndex
      : null;

    const insertOrReplaceReply = (prevMessages, nextReply) => {
      if (
        Number.isInteger(replaceIndex) &&
        replaceIndex >= 0 &&
        replaceIndex < prevMessages.length
      ) {
        return prevMessages.map((message, index) =>
          index === replaceIndex ? nextReply : message
        );
      }

      return [...prevMessages, nextReply];
    };

    const isTextAssistantReply =
      reply?.role === "assistant" &&
      !reply?.isImage &&
      typeof reply?.content === "string" &&
      reply.content.length > 0;

    if (!isTextAssistantReply) {
      setMessages((prev) => insertOrReplaceReply(prev, reply));
      return;
    }

    const fullContent = reply.content;
    const streamKey = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setMessages((prev) =>
      insertOrReplaceReply(prev, {
        ...reply,
        content: "",
        __isStreaming: true,
        __streamKey: streamKey,
      })
    );

    setIsStreamingReply(true);

    await new Promise((resolve) => {
      let cursor = 0;
      const total = fullContent.length;
      const minStep = 1;
      const dynamicStep = Math.max(minStep, Math.ceil(total / 120));

      clearActiveStream();
      setIsStreamingReply(true);

      streamIntervalRef.current = setInterval(() => {
        cursor = Math.min(total, cursor + dynamicStep);
        const partial = fullContent.slice(0, cursor);

        setMessages((prev) =>
          prev.map((message) =>
            message?.__streamKey === streamKey
              ? {
                  ...message,
                  content: partial,
                  __isStreaming: cursor < total,
                }
              : message
          )
        );

        if (cursor >= total) {
          clearActiveStream();
          setMessages((prev) =>
            prev.map((message) =>
              message?.__streamKey === streamKey
                ? {
                    ...message,
                    content: fullContent,
                    __isStreaming: false,
                  }
                : message
            )
          );
          resolve();
        }
      }, 22);
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, messageIndex: null });
  };

  const handleMessageRightClick = (event, message, index) => {
    if (!isEditableUserTextMessage(message)) return;

    const lastEditableUserIndex = messages.reduce(
      (latestIndex, currentMessage, currentIndex) =>
        isEditableUserTextMessage(currentMessage) ? currentIndex : latestIndex,
      -1
    );

    if (index !== lastEditableUserIndex) return;

    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      messageIndex: index,
    });
  };

  const handleStartEditFromContextMenu = () => {
    const messageIndex = Number(contextMenu.messageIndex);
    if (!Number.isFinite(messageIndex) || messageIndex < 0) {
      closeContextMenu();
      return;
    }

    const targetMessage = messages[messageIndex];
    if (!targetMessage) {
      closeContextMenu();
      return;
    }

    const targetContent = String(targetMessage?.content || "").trim();
    if (!targetContent) {
      closeContextMenu();
      return;
    }

    const replyIndex = findAssistantReplyIndexForUserMessage(messages, messageIndex);
    if (replyIndex >= 0) {
      setHiddenResponseIndexes((prev) =>
        prev.includes(replyIndex) ? prev : [...prev, replyIndex]
      );
    }

    setEditTargetIndex(messageIndex);
    setPrompt(targetContent);
    closeContextMenu();
  };

  const onSubmit = async (e) => {
    let promptCopy = "";
    let optimisticMessage = null;
    let originalEditedMessage = null;
    let editedMessageId = "";
    const previousHiddenIndexes = [...hiddenResponseIndexes];
    const isEditingTarget = Number.isInteger(editTargetIndex) && editTargetIndex >= 0;
    try {
      e.preventDefault();
      if (loading || isStreamingReply) return;
      if (prompt.trim() === "") return;
      if (!user) {
        toast.error("Please login to send a message.");
        return;
      }
      if (!selectedChat?._id) {
        toast.error("Please create or select a chat first.");
        return;
      }

      promptCopy = prompt;
      setPrompt("");

      if (isEditingTarget) {
        originalEditedMessage = messages[editTargetIndex];
        editedMessageId = String(originalEditedMessage?._id || "").trim();

        setMessages((prevMessages) =>
          prevMessages.map((message, index) =>
            index === editTargetIndex
              ? {
                  ...message,
                  content: promptCopy,
                  timestamp: new Date().toISOString(),
                }
              : message
          )
        );
      } else {
        const newMessage = {
          sender: user._id,
          content: promptCopy,
          type: mode,
          isImage: false,
          timestamp: new Date().toISOString(),
          role: "user"
        };
        optimisticMessage = newMessage;
        setMessages((prevMessages) => [...prevMessages, newMessage]);
      }

      setLoading(true);

      const { data } = isUploadQaMode
        ? await sendUploadQaRequest({ promptValue: promptCopy, file: selectedFile })
        : await sendMessageRequest({
            chatId: selectedChat._id,
            prompt: promptCopy,
            isPublished: isImageMode ? isPublished : false,
            editedMessageId,
          });

      setLoading(false);

      if (data.success) {
        const reply = data?.data;
        const replyReplaceIndex = isEditingTarget
          ? findAssistantReplyIndexForUserMessage(messages, editTargetIndex)
          : -1;

        if (reply) {
          await appendReplyWithStreaming(reply, {
            replaceIndex: replyReplaceIndex >= 0 ? replyReplaceIndex : null,
          });
        }

        if (editTargetIndex !== null) {
          setEditTargetIndex(null);
          setHiddenResponseIndexes([]);
        }

        if (isUploadQaMode) {
          clearSelectedFile();
        }

        // decrease credits only when response is successful
        if (isImageMode || isUploadQaMode) {
          deductCreditsSafely(3);
        } else {
          deductCreditsSafely(1);
        }
      } else {
        toast.error(data.message || "Failed to send message");
        if (!isEditingTarget && optimisticMessage) {
          setMessages((prev) => prev.filter((message) => message !== optimisticMessage));
        }
        setPrompt(promptCopy); // Restore the prompt on failure
      }
    } catch (error) {
      const status = error?.response?.status;
      if (status === 429) {
        console.warn("Message throttled by provider (429)");
      } else {
        console.error("Error sending message:", error);
      }

      toast.error(
        error?.response?.data?.message ||
          (status === 429
            ? "AI is busy right now. Please wait a moment and try again."
            : "An error occurred while sending the message")
      );

      if (!isEditingTarget && optimisticMessage) {
        setMessages((prev) => prev.filter((message) => message !== optimisticMessage));
      }
      if (isEditingTarget && originalEditedMessage) {
        setMessages((prevMessages) =>
          prevMessages.map((message, index) =>
            index === editTargetIndex ? originalEditedMessage : message
          )
        );
      }
      if (promptCopy) {
        setPrompt(promptCopy);
      }
      setHiddenResponseIndexes(previousHiddenIndexes);
    } finally {
      setLoading(false);
    }
  };



  useEffect(() => {
    if (selectedChat) {
      clearActiveStream();
      setMessages(selectedChat.messages);
      setEditTargetIndex(null);
      setHiddenResponseIndexes([]);
      closeContextMenu();
    }
  }, [selectedChat]); 

  useEffect(() => {
    return () => {
      clearActiveStream();
    };
  }, []);

  useEffect(() => {
    if (!contextMenu.visible) return;

    const closeMenu = () => closeContextMenu();

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu.visible]);

  useEffect(() => {
    if (messages.length > 0 && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  useEffect(() => {
    if (!isImageMode && isPublished) {
      setIsPublished(false);
    }
  }, [isImageMode, isPublished]);

  useEffect(() => {
    if (!selectedFile || !String(selectedFile?.type || "").startsWith("image/")) {
      setSelectedFilePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const lastEditableUserIndex = messages.reduce(
    (latestIndex, message, index) =>
      isEditableUserTextMessage(message) ? index : latestIndex,
    -1
  );

  const visibleMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ index }) => !hiddenResponseIndexes.includes(index));

  const containerRef = useRef(null);
  return (
    <div className="flex flex-1 flex-col h-[100dvh]">
      {/* Full-screen image viewer */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setFullScreenImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-5xl font-light hover:text-gray-300 transition-colors leading-none"
            onClick={() => setFullScreenImage(null)}
            aria-label="Close"
          >
            ×
          </button>
          <img 
            src={fullScreenImage} 
            alt="Full screen view" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {contextMenu.visible && (
        <div
          className="fixed z-50 min-w-36 rounded-md border border-gray-300 dark:border-[#80609F]/40 bg-white dark:bg-[#1e1b24] shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#2a2431]"
            onClick={handleStartEditFromContextMenu}
          >
            Edit message
          </button>
        </div>
      )}
      {/* {chat messages} */}
      <div ref={containerRef}
        className={`flex flex-col flex-1 gap-0.5 px-2 py-2 pb-28 overflow-y-auto ${
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

            <div className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-gradient-to-r from-orange-500 via-white to-green-600 shadow-lg">
              <span className="text-xs font-semibold tracking-widest text-black">
                MADE IN INDIA
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 bg-clip-text pb-2 text-transparent ">
              Ask me anything...
            </h1>

            <p className="text-gray-500  dark:text-gray-400 text-sm sm:text-base max-w-md leading-relaxed">
              Powered with innovation. Built with passion.
            </p>
          </>
        ) : (
          visibleMessages.map(({ message, index }) => (
            <Message 
              key={index} 
              index={index}
              message={message} 
              onImageClick={(imageUrl) => setFullScreenImage(imageUrl)}
              onMessageRightClick={handleMessageRightClick}
              canEdit={index === lastEditableUserIndex}
            />
          ))
        )}

        {/* {3 dots loading animation} */}

        {loading && (
          <div className="loader flex items-start gap-1.5 px-2 py-1 rounded-full h-auto bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 scale-125 p-4 ml-14 mt-5 mb-4 dark">
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate-bounce"></div>
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate-bounce"></div>
            <div className="dot w-1.5 h-1.5 rounded-full dark:bg-white bg-gray-500 animate-bounce"></div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0  w-full px-2 pb-3 pt-2 bg-grey-400 dark:bg-black backdrop-blur-md  ">
        {isImageMode && (
          <label className="inline-flex justify-start items-center gap-2 w-full max-w-4xl mx-auto text-xs text-gray-500 dark:text-gray-400 mb-2">
            <p className="ml-12 text-gray-700 dark:text-gray-300">Publish Generated Image to Community</p>
            <input type="checkbox" checked={isPublished} onChange={() => setIsPublished(!isPublished)} className="scale-150"/>
          </label>
        )}
        {isWebsiteMode && (
          <p className="w-full max-w-4xl mx-auto text-xs text-gray-500 dark:text-gray-400 mb-2 px-2">
            Tip: First paste a page URL. Then ask follow-up questions in website mode.
          </p>
        )}
        {isUploadQaMode && (
          <div className="w-full max-w-4xl mx-auto text-xs text-gray-500 dark:text-gray-400 mb-2 px-2 flex flex-wrap items-center gap-2">
            <span>Upload an image/PDF/DOCX/TXT/CSV/JSON and ask questions. You can ask follow-ups without re-uploading.</span>
            {selectedFile && (
              selectedFilePreview ? (
                <div className="relative group rounded-md overflow-hidden border border-black/10 dark:border-white/20">
                  <img
                    src={selectedFilePreview}
                    alt={selectedFile.name || "Uploaded image"}
                    className="h-16 w-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-black/75 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove uploaded image"
                    aria-label="Remove uploaded image"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-black/5 dark:bg-white/10 text-[11px]">
                  {selectedFile.name}
                  <button type="button" onClick={clearSelectedFile} className="font-bold">×</button>
                </span>
              )
            )}
          </div>
        )}
        {editTargetIndex !== null && (
          <div className="w-full max-w-4xl mx-auto mb-2 px-2 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <span>Editing previous message. Old assistant response is hidden.</span>
            <button
              type="button"
              onClick={() => {
                setEditTargetIndex(null);
                setPrompt("");
                setHiddenResponseIndexes([]);
              }}
              className="underline cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
        {/* {input box} */}
        <form
          onSubmit={onSubmit}
         className="bg-primary/20 dark:bg-[#583C79]/30 border border-black dark:border-[#90609F]/30 rounded-full w-full max-w-4xl lg:p-3 py-4 mx-auto flex gap-4 items-center mb-8 px-4"
        >
          <select
            onChange={(e) => setMode(e.target.value.trim().toLowerCase())}
            value={mode}
            className="text-sm cursor-pointer pl-1 pr-1 outline-none bg-primary/20 dark:bg-[#583C79]/30 rounded-full py-3 md:ml-2 ml-1 border border-primary dark:border-[#90609F]/30"
          >
            <option className="bg-white text-black hover:bg-gray-100" value="image">
              Image
            </option>
            <option className="bg-white text-black hover:bg-gray-100" value="text">
              Text
            </option>
            <option className="bg-white text-black hover:bg-gray-100" value="website">
              Website
            </option>
            <option className="bg-white text-black hover:bg-gray-100" value="upload-qa">
              Upload
            </option>
          </select>
          {isUploadQaMode && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.docx,.txt,.md,.csv,.json"
                onChange={onSelectFile}
              />
              <button
                type="button"
                onClick={triggerFilePicker}
                className="text-xs cursor-pointer px-3 py-2 rounded-full border border-primary dark:border-[#90609F]/30 bg-primary/20 dark:bg-[#583C79]/30"
              >
                {selectedFile ? "Change" : "Upload"}
              </button>
            </>
          )}
          <input
            type="text"
            placeholder={promptPlaceholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="flex-1 w-full text-lg  outline-none "
            required
          />
          <button>
            <img
              src={loading ? assets.stop_icon : assets.send_icon}
              alt=""
              className="w-11 cursor pointer mr-1 "
            />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBox;
