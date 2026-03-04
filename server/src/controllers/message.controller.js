//text based AI chat Message  controller           
import { Chat } from "../models/chat.model.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { ApiResponse } from "../../utils/apiResponse.js"
import { ApiError } from "../../utils/apiError.js"
import axios from "axios"
import { User } from "../models/user.model.js"
import { getOpenAIClient } from "../config/openai.config.js"
import { getImageKitClient } from "../config/imagekit.config.js"

const normalizeMessagePayload = (req) => {
    const body = req.body || {}

    const chatId = String(
        body.chatId ?? req.params?.chatId ?? req.query?.chatId ?? ""
    ).trim()

    const promptSource = body.prompt ?? body.message ?? body.text ?? ""
    const prompt = String(promptSource).trim()

    const isPublishedRaw = body.isPublished
    const isPublished = String(isPublishedRaw).toLowerCase() === "true"

    return { chatId, prompt, isPublished, receivedKeys: Object.keys(body) }
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

const createTextCompletion = async (openai, prompt) => {
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
                        content: prompt.trim(),
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
    const { chatId, prompt, receivedKeys } = normalizeMessagePayload(req)

    // Basic payload validation
    if (!chatId || !prompt?.trim()) {
        throw new ApiError(400, "chatId and prompt are required", [
            `Received keys: ${receivedKeys.length ? receivedKeys.join(", ") : "none"}`
        ])
    }

    // Text message costs 1 credit
    if (req.user.credits <= 0) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    // Ensure chat belongs to the current user
    const chat = await Chat.findOne({ _id: chatId, userId })

    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }

    // Backfill legacy chats created before required fields existed
    if (!chat.name?.trim()) {
        chat.name = prompt.trim().slice(0, 40) || "New Chat"
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    // Store user message in chat history
    chat.messages.push({
        isImage: false,
        isPublished: false,
        timestamp: Date.now(),
        role: "user",
        content: prompt.trim()
    })

    try {
        // Send prompt to model and get assistant response
        const { choices } = await createTextCompletion(openai, prompt)
        const aiMessage = choices?.[0]?.message

        if (!aiMessage) {
            throw new ApiError(500, "Failed to get response from AI")
        }

        // Normalize assistant response shape for chat storage and avoid leaking provider metadata
        const reply = buildSafeAssistantReply(aiMessage)

        // Persist assistant message and deduct 1 credit
        chat.messages.push(reply)
        await chat.save()
        await User.updateOne({ _id: userId }, { $inc: { credits: -1 } })

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

    // Image generation costs 2 credits
    if (req.user.credits < 2) {
        return res
            .status(403)
            .json(new ApiResponse(403, null, "Not enough credits"))
    }

    const { chatId, prompt, isPublished, receivedKeys } = normalizeMessagePayload(req)

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

    // Backfill legacy chats created before required fields existed
    if (!chat.name?.trim()) {
        chat.name = prompt.trim().slice(0, 40) || "New Chat"
    }
    if (!chat.username?.trim()) {
        chat.username = req.user?.username || "User"
    }

    // Save user's image generation request as a normal message
    chat.messages.push({
        isImage: false,
        isPublished: false,
        timestamp: Date.now(),
        role: "user",
        content: prompt.trim()
    })

    // Build a structured prompt for better person-specific outputs, then encode for URL
    const providerPrompt = buildImagePrompt(prompt)
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
        isImage: true,
        isPublished,
        timestamp: Date.now(),
        role: "assistant",
            content: uploadResponse.url
    }

    // Save assistant image message and deduct 2 credits
    chat.messages.push(reply)
    await chat.save()
    await User.updateOne({ _id: userId }, { $inc: { credits: -2 } })

    // Return generated image URL
    return res
        .status(200)
        .json(new ApiResponse(200, reply, "Image generated successfully"))

})

export {
    textMessageController,
    imageMessageController
}
