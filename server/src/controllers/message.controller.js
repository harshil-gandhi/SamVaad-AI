//text based AI chat Message  controller           
import { Chat } from "../models/chat.model.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { ApiResponse } from "../../utils/apiResponse.js"
import { ApiError } from "../../utils/apiError.js"
import axios from "axios"
import { User } from "../models/user.model.js"
import { getOpenAIClient } from "../config/openai.config.js"
import { getImageKitClient } from "../config/imagekit.config.js"
import mammoth from "mammoth"
import mongoose from "mongoose"

const URL_REGEX = /(https?:\/\/[^\s)]+|www\.[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)(?=\s|$)/i
const MAX_WEBSITE_TEXT_CHARS = 8000

const normalizeMessagePayload = (req) => {
    const body = req.body || {}

    const chatId = String(
        body.chatId ?? req.params?.chatId ?? req.query?.chatId ?? ""
    ).trim()

    const promptSource = body.prompt ?? body.message ?? body.text ?? ""
    const prompt = String(promptSource).trim()

    const editedMessageId = String(
        body.editedMessageId ?? body.messageId ?? ""
    ).trim()

    const isPublishedRaw = body.isPublished
    const isPublished = String(isPublishedRaw).toLowerCase() === "true"

    return { chatId, prompt, isPublished, editedMessageId, receivedKeys: Object.keys(body) }
}

const normalizeUploadQaPayload = (req) => {
    const body = req.body || {}

    const chatId = String(
        body.chatId ?? req.params?.chatId ?? req.query?.chatId ?? ""
    ).trim()

    const promptSource = body.prompt ?? body.message ?? body.question ?? ""
    const prompt = String(promptSource).trim()

    const editedMessageId = String(
        body.editedMessageId ?? body.messageId ?? ""
    ).trim()

    return { chatId, prompt, editedMessageId, receivedKeys: Object.keys(body) }
}

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || "").trim())

const shouldAutoGenerateChatName = (chatName) => {
    const normalizedName = String(chatName || "").trim().toLowerCase()
    return !normalizedName || normalizedName === "new chat"
}

const getChatNameFromPrompt = (prompt) => {
    return String(prompt || "").trim().slice(0, 40)
}

const MAX_MEMORY_CHATS = 10
const MAX_MEMORY_MESSAGES_PER_CHAT = 6
const MAX_MEMORY_CHARS = 7000
const MAX_MEMORY_MESSAGE_CHARS = 220

const compactMemoryText = (value, maxLength = MAX_MEMORY_MESSAGE_CHARS) => {
    const text = String(value || "").replace(/\s+/g, " ").trim()
    if (!text) return ""
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text
}

const truncateMemoryBlock = (value, maxLength = MAX_MEMORY_CHARS) => {
    const text = String(value || "").trim()
    if (!text) return ""
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text
}

const isMeaningfulMemoryMessage = (message) => {
    const role = String(message?.role || "").trim().toLowerCase()
    const messageType = String(message?.messageType || "text").trim().toLowerCase()
    const content = String(message?.content || "").trim()

    if (!content) return false
    if (!role || !["user", "assistant"].includes(role)) return false

    // Skip URL-only / media-only payloads because they add noise to the prompt.
    if (messageType !== "text" && messageType !== "") {
        return false
    }

    return true
}

const formatMemoryTranscript = (messages, label) => {
    const transcript = (Array.isArray(messages) ? messages : [])
        .filter(isMeaningfulMemoryMessage)
        .slice(-MAX_MEMORY_MESSAGES_PER_CHAT)
        .map((message) => {
            const speaker = message?.role === "assistant" ? "Assistant" : "User"
            return `${speaker}: ${compactMemoryText(message?.content)}`
        })

    if (!transcript.length) return ""

    return [label, ...transcript].join("\n")
}

const buildChatMemoryContext = async ({ chat, userId }) => {
    const currentChatBlock = formatMemoryTranscript(chat?.messages, "Current chat memory:")

    const recentChats = await Chat.find({
        userId,
        _id: { $ne: chat?._id },
    })
        .sort({ updatedAt: -1 })
        .limit(MAX_MEMORY_CHATS)
        .select("name messages updatedAt")

    const recentChatBlocks = recentChats
        .map((recentChat) => {
            const chatName = compactMemoryText(recentChat?.name || "Previous chat", 60) || "Previous chat"
            return formatMemoryTranscript(recentChat?.messages, `Chat: ${chatName}`)
        })
        .filter(Boolean)

    const sections = []

    if (currentChatBlock) {
        sections.push(currentChatBlock)
    }

    if (recentChatBlocks.length) {
        sections.push("Recent chats memory:", ...recentChatBlocks)
    }

    return truncateMemoryBlock(sections.join("\n\n"), MAX_MEMORY_CHARS)
}

const buildConversationMemoryMessage = async ({ chat, userId }) => {
    const memoryContext = await buildChatMemoryContext({ chat, userId })

    if (!memoryContext) {
        return null
    }

    return {
        role: "system",
        content: `Conversation memory:\n${memoryContext}`,
    }
}

const buildMemoryAwareImagePrompt = async ({ chat, userId, prompt }) => {
    const memoryMessage = await buildConversationMemoryMessage({ chat, userId })
    const memoryContext = String(memoryMessage?.content || "")
        .replace(/^Conversation memory:\n/i, "")
        .trim()

    const imagePrompt = buildImagePrompt(prompt)

    if (!memoryContext) {
        return imagePrompt
    }

    return [
        imagePrompt,
        "Relevant conversation memory:",
        memoryContext,
    ].join("\n\n")
}

const replaceEditedUserMessage = ({ chat, editedMessageId, prompt }) => {
    const safeEditedMessageId = String(editedMessageId || "").trim()

    if (!safeEditedMessageId || !isValidObjectId(safeEditedMessageId)) {
        return { wasEdited: false, editedIndex: -1 }
    }

    const editedIndex = chat.messages.findIndex((message) => String(message?._id) === safeEditedMessageId)
    if (editedIndex < 0) {
        return { wasEdited: false, editedIndex: -1 }
    }

    const targetMessage = chat.messages[editedIndex]
    const isEditableMessage =
        targetMessage?.role === "user" &&
        !targetMessage?.isImage &&
        String(targetMessage?.messageType || "text").toLowerCase() !== "file"

    if (!isEditableMessage) {
        return { wasEdited: false, editedIndex: -1 }
    }

    const previousFirstMessageTitle =
        editedIndex === 0 ? getChatNameFromPrompt(targetMessage?.content) : ""

    targetMessage.content = prompt.trim()
    targetMessage.timestamp = Date.now()
    targetMessage.messageType = "text"

    if (editedIndex === 0) {
        const currentChatName = String(chat?.name || "").trim()
        const generatedName = getChatNameFromPrompt(prompt)
        const shouldUpdateChatNameFromFirstMessage =
            shouldAutoGenerateChatName(currentChatName) ||
            (Boolean(previousFirstMessageTitle) &&
                currentChatName.toLowerCase() === previousFirstMessageTitle.toLowerCase())

        if (shouldUpdateChatNameFromFirstMessage && generatedName) {
            chat.name = generatedName
        }
    }

    const nextMessage = chat.messages[editedIndex + 1]
    if (nextMessage?.role === "assistant") {
        chat.messages.splice(editedIndex + 1, 1)
    }

    return { wasEdited: true, editedIndex }
}

const extractAssistantText = (content) => {
    if (typeof content === "string") {
        return content.trim()
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") return part
                if (part?.type === "text" && typeof part?.text === "string") return part.text
                return ""
            })
            .join("")
            .trim()
    }

    return ""
}

const buildSafeAssistantReply = (aiMessage) => {
    const content = extractAssistantText(aiMessage?.content)

    if (!content) {
        throw new ApiError(500, "AI returned an empty response")
    }

    return {
        role: "assistant",
        content,
        isImage: false,
        isPublished: false,
        timestamp: Date.now()
    }
}

const getProviderErrorMessage = (error) => {
    return (
        error?.error?.message ||
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "AI provider request failed"
    )
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getProviderStatusCode = (error) => {
    const candidate = error?.statusCode || error?.status || error?.response?.status || error?.error?.status || null
    const parsed = Number(candidate)
    return Number.isFinite(parsed) ? parsed : null
}

const isRateLimitError = (error) => {
    const status = getProviderStatusCode(error)
    const rawMessage = getProviderErrorMessage(error)
    const message = String(rawMessage || "").toLowerCase()

    return (
        status === 429 ||
        message.includes("too many requests") ||
        message.includes("resource exhausted") ||
        message.includes("quota") ||
        message.includes("rate") ||
        message.includes("throttle")
    )
}

const createTextCompletion = async (openai, promptOrMessages) => {
    const model = "gemini-2.5-flash"
    const maxAttempts = 2
    let lastError = null

    const messages = Array.isArray(promptOrMessages)
        ? promptOrMessages
        : [{
            role: "user",
            content: String(promptOrMessages || "").trim(),
        }]

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await openai.chat.completions.create({
                model,
                messages,
            })

            return result
        } catch (error) {
            lastError = error

            const status = getProviderStatusCode(error)
            const isRateLimited = isRateLimitError(error)
            const isTransientProviderError = status >= 500 && status < 600

            if ((isRateLimited || isTransientProviderError) && attempt < maxAttempts) {
                await sleep(700 * attempt)
                continue
            }

            if (isRateLimited) {
                throw new ApiError(429, "AI is receiving too many requests right now. Please wait a few seconds and try again.")
            }

            throw new ApiError(502, getProviderErrorMessage(error))
        }
    }

    throw new ApiError(502, getProviderErrorMessage(lastError))
}

const createVisionCompletion = async (openai, { prompt, imageUrl }) => {
    const model = "gemini-2.5-flash"
    const maxAttempts = 2
    let lastError = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await openai.chat.completions.create({
                model,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: String(prompt || "Describe this image in detail").trim(),
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageUrl,
                                },
                            },
                        ],
                    },
                ],
            })

            return result
        } catch (error) {
            lastError = error

            const status = getProviderStatusCode(error)
            const isRateLimited = isRateLimitError(error)
            const isTransientProviderError = status >= 500 && status < 600

            if ((isRateLimited || isTransientProviderError) && attempt < maxAttempts) {
                await sleep(700 * attempt)
                continue
            }

            if (isRateLimited) {
                throw new ApiError(429, "AI is receiving too many requests right now. Please wait a few seconds and try again.")
            }

            throw new ApiError(502, getProviderErrorMessage(error))
        }
    }

    throw new ApiError(502, getProviderErrorMessage(lastError))
}

const inferMessageTypeFromMime = (mimeType) => {
    const value = String(mimeType || "").toLowerCase()
    if (value.startsWith("image/")) return "image"
    if (value.startsWith("video/")) return "video"
    if (value.startsWith("audio/")) return "audio"
    return "file"
}

const toUtf8Text = (buffer) => Buffer.from(buffer).toString("utf8")

let cachedPdfParseModule = null

const getPdfParseModule = async () => {
    if (cachedPdfParseModule) return cachedPdfParseModule

    cachedPdfParseModule = await import("pdf-parse")
    return cachedPdfParseModule
}

const extractPdfText = async (buffer) => {
    const pdfModule = await getPdfParseModule()

    // Legacy API support: pdfParse(buffer)
    const legacyParserFn = pdfModule?.default || pdfModule?.pdfParse
    if (typeof legacyParserFn === "function") {
        const parsed = await legacyParserFn(buffer)
        return String(parsed?.text || "").trim()
    }

    // v2 API support: new PDFParse({ data: buffer }).getText()
    const PDFParseClass = pdfModule?.PDFParse
    if (typeof PDFParseClass === "function") {
        const parser = new PDFParseClass({ data: buffer })

        try {
            const parsed = await parser.getText()
            return String(parsed?.text || "").trim()
        } finally {
            if (typeof parser?.destroy === "function") {
                await parser.destroy().catch(() => {})
            }
        }
    }

    throw new ApiError(500, "PDF parser module loaded but no compatible parser API was found")
}

const extractDocumentTextFromBuffer = async (file) => {
    const mime = String(file?.mimetype || "").toLowerCase()
    const buffer = file?.buffer

    if (!buffer) return ""

    if (mime === "application/pdf") {
        return extractPdfText(buffer)
    }

    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const parsed = await mammoth.extractRawText({ buffer })
        return String(parsed?.value || "").trim()
    }

    if (
        mime === "text/plain" ||
        mime === "text/markdown" ||
        mime === "text/csv" ||
        mime === "application/json"
    ) {
        return toUtf8Text(buffer).trim()
    }

    return ""
}

const buildDocumentQaPrompt = ({ question, documentName, documentText }) => {
    return [
        "You are helping a user ask questions about an uploaded document.",
        "Answer strictly from the provided document text.",
        "If data is missing in the document text, clearly say it is not available in the uploaded file.",
        "Keep the answer concise, helpful, and structured.",
        `Document name: ${documentName || "Uploaded file"}`,
        "",
        `User question: ${question}`,
        "",
        "Document text:",
        documentText,
    ].join("\n")
}

const findLatestUploadSourceMessage = (chat) => {
    const messages = Array.isArray(chat?.messages) ? [...chat.messages] : []

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const current = messages[i]
        const hasSourceText = Boolean(String(current?.sourceText || "").trim())
        const hasImageUrl = current?.isImage && Boolean(String(current?.content || "").trim())

        if (hasSourceText || hasImageUrl) {
            return current
        }
    }

    return null
}

const buildImagePrompt = (rawPrompt) => {
    const prompt = String(rawPrompt || "").trim()

    return [
        "Create a high-quality image with a single clearly visible person.",
        "Match the person's identity and attributes exactly as described.",
        "Keep face details sharp and consistent, natural skin texture, realistic lighting.",
        "Do not add extra people, text overlays, logos, or watermarks.",
        "User description:",
        prompt
    ].join(" ")
}

const extractFirstUrlFromText = (text) => {
    const value = String(text || "").trim()
    const match = value.match(URL_REGEX)
    return normalizeWebsiteUrl(match?.[1] || "")
}

const normalizeWebsiteUrl = (value) => {
    let url = String(value || "").trim()

    if (!url) return ""

    url = url.replace(/[),.]+$/g, "")

    if (/^www\./i.test(url)) {
        url = `https://${url}`
    }

    if (!/^https?:\/\//i.test(url) && /^[a-z0-9-]+\.[a-z]{2,}/i.test(url)) {
        url = `https://${url}`
    }

    return url
}

const stripUrlsFromText = (text) => {
    return String(text || "")
        .replace(/https?:\/\/[^\s)]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
}

const decodeHtmlEntities = (input) => {
    return String(input || "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

const extractReadableTextFromHtml = (html) => {
    const withoutScript = String(html || "")
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")

    const withoutTags = withoutScript.replace(/<[^>]+>/g, " ")
    const decoded = decodeHtmlEntities(withoutTags)

    return decoded
        .replace(/\s+/g, " ")
        .trim()
}

const findLatestWebsiteUrlInChat = (chat) => {
    const messages = Array.isArray(chat?.messages) ? [...chat.messages] : []

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const current = messages[i]
        const url = extractFirstUrlFromText(current?.content)
        if (url) return url
    }

    return ""
}

const fetchWebsiteText = async (targetUrl) => {
    const normalizedTargetUrl = normalizeWebsiteUrl(targetUrl)

    let parsedUrl
    try {
        parsedUrl = new URL(normalizedTargetUrl)
    } catch {
        throw new ApiError(400, "Please provide a valid website URL starting with http:// or https://")
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new ApiError(400, "Only http/https website URLs are supported")
    }

    let response
    try {
        response = await axios.get(parsedUrl.toString(), {
            timeout: 15000,
            maxRedirects: 5,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        })
    } catch (error) {
        const status = error?.response?.status
        const message = status
            ? `Could not read website content (status ${status}).`
            : "Could not read website content."

        throw new ApiError(502, message)
    }

    const html = String(response?.data || "")
    const text = extractReadableTextFromHtml(html)

    if (!text || text.length < 120) {
        throw new ApiError(422, "Website content is too short or not readable. Please try another page URL.")
    }

    return text.slice(0, MAX_WEBSITE_TEXT_CHARS)
}

const buildWebsiteQuestion = (prompt, explicitUrl) => {
    const questionWithoutUrl = stripUrlsFromText(prompt)
    if (questionWithoutUrl) return questionWithoutUrl

    if (explicitUrl) {
        return "Please summarize this website in simple points and include the key takeaways."
    }

    return "Please answer the user question based on the website content."
}

const buildWebsiteChatPrompt = ({ websiteUrl, question, websiteText }) => {
    return [
        "You are helping a user chat with a website.",
        "Answer strictly from the provided website content.",
        "If information is not present in the content, clearly say that it is not available on the page.",
        "Keep response concise, clear, and helpful.",
        "The website text may be truncated, so prioritize the most relevant facts.",
        `Website URL: ${websiteUrl}`,
        "",
        `User question: ${question}`,
        "",
        "Website content:",
        websiteText,
    ].join("\n")
}

const isLiveHumanImageRequest = (rawPrompt) => {
    const prompt = String(rawPrompt || "").toLowerCase().trim()

    if (!prompt) return false

    const liveHumanPatterns = [
        /\b(pm|prime minister|president|chief minister|politician)\b/i,
        /\b(celebrity|actor|actress|singer|cricketer|influencer|public figure)\b/i,
        /\b(narendra\s+modi|pm\s+modi|modi)\b/i,
        /\b(real person|real human|living person|live human)\b/i,
    ]

    return liveHumanPatterns.some((pattern) => pattern.test(prompt))
}

const textMessageController = asyncHandler(async (req, res) => {
    const openai = getOpenAIClient()

    // Get authenticated user and payload values
    const userId = req.user._id
    const { chatId, prompt, editedMessageId, receivedKeys } = normalizeMessagePayload(req)

    // Basic payload validation
    if (!chatId || !prompt?.trim()) {
        throw new ApiError(400, "chatId and prompt are required", [
            `Received keys: ${receivedKeys.length ? receivedKeys.join(", ") : "none"}`
        ])
    }

    // Text message costs 1 credit
    if (req.user.credits < 2) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    // Ensure chat belongs to the current user
    const chat = await Chat.findOne({ _id: chatId, userId })

    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }

    // Auto-generate chat title from first prompt when chat is unnamed/default.
    if (shouldAutoGenerateChatName(chat.name)) {
        const generatedName = getChatNameFromPrompt(prompt)
        if (generatedName) {
            chat.name = generatedName
        }
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    const editResult = replaceEditedUserMessage({ chat, editedMessageId, prompt })

    // Store user message in chat history when this is a new prompt (not edit)
    if (!editResult.wasEdited) {
        chat.messages.push({
            isImage: false,
            isPublished: false,
            timestamp: Date.now(),
            role: "user",
            content: prompt.trim()
        })
    }

    try {
        const memoryMessage = await buildConversationMemoryMessage({ chat, userId })
        const completionMessages = [
            {
                role: "system",
                content: [
                    "You are SamVaad AI, a helpful assistant that should remember the ongoing conversation and nearby past chats.",
                    "Use the memory below when it is relevant to the user's request.",
                    "If the latest user message conflicts with memory, trust the latest user message.",
                    "Do not mention the memory block unless the user explicitly asks about remembered context.",
                ].join(" "),
            },
        ]

        if (memoryMessage) {
            completionMessages.push(memoryMessage)
        }

        completionMessages.push({
            role: "user",
            content: prompt.trim(),
        })

        // Send prompt to model and get assistant response
        const { choices } = await createTextCompletion(openai, completionMessages)
        const aiMessage = choices?.[0]?.message

        if (!aiMessage) {
            throw new ApiError(500, "Failed to get response from AI")
        }

        // Normalize assistant response shape for chat storage and avoid leaking provider metadata
        const reply = buildSafeAssistantReply(aiMessage)

        // Persist assistant message and deduct 1 credit
        chat.messages.push(reply)
        await chat.save()
        await User.updateOne({ _id: userId }, { $inc: { credits: -2 } })

        // Return assistant text reply to client
        return res
            .status(200)
            .json(new ApiResponse(200, reply, "Message sent successfully"))
    } catch (error) {
        const statusCode = error?.statusCode || error?.status || error?.response?.status
        const shouldUseRateLimitFallback = statusCode === 429 || isRateLimitError(error)

        if (shouldUseRateLimitFallback) {
            const fallbackReply = {
                role: "assistant",
                content: "I’m receiving too many requests right now. Please try again in a few moments. Your credit was not deducted.",
                isImage: false,
                isPublished: false,
                timestamp: Date.now()
            }

            chat.messages.push(fallbackReply)
            await chat.save()

            return res
                .status(200)
                .json(new ApiResponse(200, fallbackReply, "Rate limited fallback response"))
        }

        throw error
    }

})

//api controller for image generation
const imageMessageController = asyncHandler(async (req, res) => {
    const imagekit = getImageKitClient()
    // Get authenticated user for ownership + credit checks
    const userId = req.user._id

    // Image generation costs 3 credits
    if (req.user.credits < 3) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    const { chatId, prompt, isPublished, editedMessageId, receivedKeys } = normalizeMessagePayload(req)

    // Validate required payload
    if (!chatId || !prompt?.trim()) {
        throw new ApiError(400, "chatId and prompt are required", [
            `Received keys: ${receivedKeys.length ? receivedKeys.join(", ") : "none"}`
        ])
    }

    // Safety policy: block image generation of living humans / public figures
    if (isLiveHumanImageRequest(prompt)) {
        return res
            .status(403)
            .json(
                new ApiResponse(
                    403,
                    null,
                    "Warning: AI is not allowed to create images of live humans. Please try a fictional or non-identifiable description."
                )
            )
    }

    // Ensure chat exists and belongs to requester
    const chat = await Chat.findOne({ _id: chatId, userId })

    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }

    // Auto-generate chat title from first prompt when chat is unnamed/default.
    if (shouldAutoGenerateChatName(chat.name)) {
        const generatedName = getChatNameFromPrompt(prompt)
        if (generatedName) {
            chat.name = generatedName
        }
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    const editResult = replaceEditedUserMessage({ chat, editedMessageId, prompt })

    // Save user's image generation request as a normal message when not editing
    if (!editResult.wasEdited) {
        chat.messages.push({
            isImage: false,
            isPublished: false,
            timestamp: Date.now(),
            role: "user",
            content: prompt.trim()
        })
    }

    // Build a structured prompt for better person-specific outputs, then encode for URL
    const providerPrompt = await buildMemoryAwareImagePrompt({ chat, userId, prompt })
    const encodedPrompt = encodeURIComponent(providerPrompt)

    // Build AI image generation URL (ImageKit transformation route)
    const folderName = encodeURIComponent("Samvaad AI")
    const generatedImageUrl = `${process.env.IMAGEKIT_URL_ENDPOINT}/ik-genimg-prompt-${encodedPrompt}/${folderName}/${Date.now()}.png?tr=w-800,h-800`

    // Fetch generated image as binary buffer
    let aiImageResponse
    try {
        aiImageResponse = await axios.get(generatedImageUrl, { responseType: "arraybuffer" })
    } catch (error) {
        const status = error?.response?.status
        const reason = status ? `Image generation provider responded with ${status}` : "Image generation request failed"
        throw new ApiError(502, reason)
    }

    // Convert binary image to base64 data URI for upload
    const base64Image = `data:image/png;base64,${Buffer.from(aiImageResponse.data, "binary").toString("base64")}`

    // Upload generated image to ImageKit media library
    const uploadFolder = "/samvaad-ai"
    const uploadFileName = `${Date.now()}.png`

    let uploadResponse
    try {
        uploadResponse = await imagekit.upload({
            file: base64Image,
            fileName: uploadFileName,
            folder: uploadFolder
        })
    } catch (error) {
        const providerMessage = error?.message || error?.response?.data?.message || "Image upload failed"
        throw new ApiError(502, providerMessage)
    }

    // Prepare assistant image message
    const reply = {
        messageType: "image",
        isImage: true,
        isPublished,
        timestamp: Date.now(),
        role: "assistant",
        content: uploadResponse.url,
        mediaProviderFileId: String(uploadResponse?.fileId || "").trim(),
        mediaFileName: String(uploadResponse?.name || uploadFileName || "").trim(),
    }

    // Save assistant image message and deduct 3 credits
    chat.messages.push(reply)
    await chat.save()
    await User.updateOne({ _id: userId }, { $inc: { credits: -3 } })

    // Return generated image URL
    return res
        .status(200)
        .json(new ApiResponse(200, reply, "Image generated successfully"))

})

const websiteMessageController = asyncHandler(async (req, res) => {
    const openai = getOpenAIClient()
    const userId = req.user._id
    const { chatId, prompt, editedMessageId, receivedKeys } = normalizeMessagePayload(req)
    const explicitUrl = extractFirstUrlFromText(req.body?.websiteUrl || "") || extractFirstUrlFromText(prompt)

    if (!chatId || !prompt?.trim()) {
        throw new ApiError(400, "chatId and prompt are required", [
            `Received keys: ${receivedKeys.length ? receivedKeys.join(", ") : "none"}`
        ])
    }

    // Website mode costs 2 credits.
    if (req.user.credits < 2) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    const chat = await Chat.findOne({ _id: chatId, userId })

    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }

    if (shouldAutoGenerateChatName(chat.name)) {
        const generatedName = getChatNameFromPrompt(prompt)
        if (generatedName) {
            chat.name = generatedName
        }
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    const fallbackUrlFromChat = findLatestWebsiteUrlInChat(chat)
    const websiteUrl = normalizeWebsiteUrl(explicitUrl || fallbackUrlFromChat)

    if (!websiteUrl) {
        throw new ApiError(400, "Please paste a website URL first, then ask your question.")
    }

    const editResult = replaceEditedUserMessage({ chat, editedMessageId, prompt })

    if (!editResult.wasEdited) {
        chat.messages.push({
            isImage: false,
            isPublished: false,
            timestamp: Date.now(),
            role: "user",
            content: prompt.trim(),
        })
    }

    try {
        const memoryMessage = await buildConversationMemoryMessage({ chat, userId })
        const websiteText = await fetchWebsiteText(websiteUrl)
        const question = buildWebsiteQuestion(prompt, explicitUrl)
        const websitePrompt = buildWebsiteChatPrompt({ websiteUrl, question, websiteText })

        const websiteMessages = [
            {
                role: "system",
                content: [
                    "You are helping a user chat with a website.",
                    "Answer strictly from the provided website content.",
                    "If information is not present in the content, clearly say that it is not available on the page.",
                    "Keep response concise, clear, and helpful.",
                    "The website text may be truncated, so prioritize the most relevant facts.",
                ].join(" "),
            },
        ]

        if (memoryMessage) {
            websiteMessages.push(memoryMessage)
        }

        websiteMessages.push({
            role: "user",
            content: websitePrompt,
        })

        const { choices } = await createTextCompletion(openai, websiteMessages)
        const aiMessage = choices?.[0]?.message

        if (!aiMessage) {
            throw new ApiError(500, "Failed to get response from AI")
        }

        const reply = buildSafeAssistantReply(aiMessage)
        reply.content = `${reply.content.trim()}\n\nSource: ${websiteUrl}`

        chat.messages.push(reply)
        await chat.save()
        await User.updateOne({ _id: userId }, { $inc: { credits: -2 } })

        return res
            .status(200)
            .json(new ApiResponse(200, reply, "Website answer generated successfully"))
    } catch (error) {
        const statusCode = error?.statusCode || error?.status || error?.response?.status
        const shouldUseRateLimitFallback = statusCode === 429 || isRateLimitError(error)

        if (shouldUseRateLimitFallback) {
            const fallbackReply = {
                role: "assistant",
                content: "I’m receiving too many requests right now. Please try again in a few moments. Your credit was not deducted.",
                isImage: false,
                isPublished: false,
                timestamp: Date.now()
            }

            chat.messages.push(fallbackReply)
            await chat.save()

            return res
                .status(200)
                .json(new ApiResponse(200, fallbackReply, "Rate limited fallback response"))
        }

        throw error
    }
})

const uploadQaMessageController = asyncHandler(async (req, res) => {
    const openai = getOpenAIClient()

    const userId = req.user._id
    const { chatId, prompt, receivedKeys } = normalizeUploadQaPayload(req)
    const uploadedFile = req.file

    if (!chatId || !prompt?.trim()) {
        throw new ApiError(400, "chatId and prompt are required", [
            `Received keys: ${receivedKeys.length ? receivedKeys.join(", ") : "none"}`
        ])
    }

    // Upload/image document Q&A costs 4 credits
    if (req.user.credits < 4) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    const chat = await Chat.findOne({ _id: chatId, userId })

    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }

    if (shouldAutoGenerateChatName(chat.name)) {
        const generatedName = getChatNameFromPrompt(prompt)
        if (generatedName) {
            chat.name = generatedName
        }
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    let activeSourceMessage = null

    if (uploadedFile) {
        const mimeType = String(uploadedFile?.mimetype || "application/octet-stream")
        const messageType = inferMessageTypeFromMime(mimeType)
        const fileName = String(uploadedFile?.originalname || `${Date.now()}-upload`)
        const fileSize = Number(uploadedFile?.size || 0)

        let sourceText = ""
        let storedContent = ""

        if (messageType === "file") {
            sourceText = await extractDocumentTextFromBuffer(uploadedFile)
            sourceText = String(sourceText || "").replace(/\s+/g, " ").trim().slice(0, 28000)
        }

        if (messageType === "file" && !sourceText) {
            throw new ApiError(422, "Could not extract readable text from the uploaded document. Please upload PDF, DOCX, TXT, CSV, MD, or JSON with readable text.")
        }

        const uploadDataUri = `data:${mimeType};base64,${Buffer.from(uploadedFile.buffer).toString("base64")}`
        let uploaded

        try {
            const imagekit = getImageKitClient()
            uploaded = await imagekit.upload({
                file: uploadDataUri,
                fileName,
                folder: `/samvaad-ai/uploads/${String(userId)}`,
                useUniqueFileName: true,
            })
        } catch (error) {
            const providerMessage = error?.message || error?.response?.data?.message || "Failed to upload file for analysis"
            throw new ApiError(502, providerMessage)
        }

        storedContent = String(uploaded?.url || "").trim()
        if (!storedContent) {
            throw new ApiError(502, "File upload failed. Please try again.")
        }

        const uploadedMessage = {
            role: "user",
            messageType,
            isImage: messageType === "image",
            isPublished: false,
            timestamp: Date.now(),
            content: storedContent,
            mediaMimeType: mimeType,
            mediaFileName: fileName,
            mediaProviderFileId: String(uploaded?.fileId || "").trim(),
            mediaSize: fileSize,
            sourceText,
        }

        chat.messages.push(uploadedMessage)
        activeSourceMessage = uploadedMessage
    } else {
        activeSourceMessage = findLatestUploadSourceMessage(chat)
    }

    if (!activeSourceMessage) {
        throw new ApiError(400, "Please upload an image or document first, then ask your question.")
    }

    chat.messages.push({
        role: "user",
        messageType: "text",
        isImage: false,
        isPublished: false,
        timestamp: Date.now(),
        content: prompt.trim(),
    })

    const sourceIsImage = Boolean(activeSourceMessage?.isImage)
    const sourceText = String(activeSourceMessage?.sourceText || "").trim()
    const sourceUrl = String(activeSourceMessage?.content || "").trim()
    const sourceName = String(activeSourceMessage?.mediaFileName || "Uploaded file")

    if (sourceIsImage && !sourceUrl) {
        throw new ApiError(422, "Uploaded image source is missing. Please upload the image again.")
    }

    const memoryMessage = await buildConversationMemoryMessage({ chat, userId })

    let aiResult
    if (sourceIsImage && sourceUrl) {
        aiResult = await createVisionCompletion(openai, {
            prompt: await buildMemoryAwareImagePrompt({ chat, userId, prompt }),
            imageUrl: sourceUrl,
        })
    } else {
        const qaPrompt = buildDocumentQaPrompt({
            question: prompt,
            documentName: sourceName,
            documentText: sourceText,
        })

        const documentMessages = [
            {
                role: "system",
                content: [
                    "You are helping a user ask questions about an uploaded document.",
                    "Answer strictly from the provided document text.",
                    "If data is missing in the document text, clearly say it is not available in the uploaded file.",
                    "Keep the answer concise, helpful, and structured.",
                ].join(" "),
            },
        ]

        if (memoryMessage) {
            documentMessages.push(memoryMessage)
        }

        documentMessages.push({
            role: "user",
            content: qaPrompt,
        })

        aiResult = await createTextCompletion(openai, documentMessages)
    }

    const aiMessage = aiResult?.choices?.[0]?.message
    if (!aiMessage) {
        throw new ApiError(500, "Failed to get response from AI")
    }

    const reply = buildSafeAssistantReply(aiMessage)
    reply.content = `${reply.content}\n\nSource file: ${sourceName}`

    chat.messages.push(reply)
    await chat.save()
    await User.updateOne({ _id: userId }, { $inc: { credits: -4 } })

    return res
        .status(200)
        .json(new ApiResponse(200, reply, "Upload Q&A completed successfully"))
})

export {
    textMessageController,
    imageMessageController,
    websiteMessageController,
    uploadQaMessageController
}
