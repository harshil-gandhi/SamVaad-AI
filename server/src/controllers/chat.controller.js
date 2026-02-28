// api controller for chat
import { ApiError } from "../../utils/apiError.js"
import { Chat } from "../models/chat.model.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { ApiResponse } from "../../utils/apiResponse.js"
import mongoose from "mongoose"

const createChat = asyncHandler(async (req, res) => {

    const userId = req.user._id
    const username = req.user.username

    if (!userId) {
        throw new ApiError(400, "User not found")
    }

    if (!username) {
        throw new ApiError(400, "Username not found")
    }

    const chatData = {
        userId,
        username,
        name: "New Chat",
        messages: [],
    }

    const chat = await Chat.create(chatData)
    if (!chat) {
        throw new ApiError(500, "Chat creation failed")
    }
    return res
        .status(201)
        .json(new ApiResponse(201, chat, "Chat created successfully"))
})

//api controller for get all chats of a user
const getChats = asyncHandler(async (req, res) => {
    const userId = req.user._id
    if (!userId) {
        throw new ApiError(400, "User not found")
    }
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 })


    return res
        .status(200)
        .json(new ApiResponse(200, chats, "Chats fetched successfully"))


})

//api controller for get a single chat by id
const getChatById = asyncHandler(async (req, res) => {
    const chatId = req.params.id
    const userId = req.user._id
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ApiError(400, "Invalid chat ID")
}
    const chat = await Chat.findOne({ _id: chatId, userId })
    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }
    return res
        .status(200)
        .json(new ApiResponse(200, chat, "Chat fetched successfully"))
})

//api controller for delete a chat by id
const deleteChatById = asyncHandler(async (req, res) => {
    const chatId = req.params.id
    const userId = req.user._id
    const chat = await Chat.findOneAndDelete({ _id: chatId, userId })
    if (!chat) {
        throw new ApiError(404, "Chat not found")
    }
    return res
        .status(200)
        .json(new ApiResponse(200, null, "Chat deleted successfully"))
})

export {
    createChat,
    getChats,
    getChatById,
    deleteChatById
}







