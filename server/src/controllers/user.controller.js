import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import jwt from "jsonwebtoken";
import { Chat } from "../models/chat.model.js";
import { getImageKitClient } from "../config/imagekit.config.js";
import mongoose from "mongoose";

const PASSWORD_REGEX = /^[A-Za-z0-9_]{8,}$/;


const generateAccessRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        if (!user) {
            throw new ApiError(404, "User not found")
        }

        const accessToken = await user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        user.refreshToken = refreshToken;  //update userschema regreshtoken from null to real refreshtoken in memeory not in db
        await user.save({ validateBeforeSave: false }) //save refreshtoken in db permanent validateBeforeSave--> understand that we are not validating other fields except refreshtoken

        return { accessToken, refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}
const registerUser = asyncHandler(async (req, res) => {

    const { username, email, password } = req.body || {}
    const normalizedUsername = username?.toLowerCase()?.trim()
    const normalizedEmail = email?.toLowerCase()?.trim()

    if (!normalizedUsername || !normalizedEmail || !password?.trim()) {
        throw new ApiError(400, "All fields are required")
    }

    if (!PASSWORD_REGEX.test(String(password))) {
        throw new ApiError(
            400,
            "Password must be at least 8 characters and contain only letters, numbers, and underscore (_)"
        )
    }


    const existedUser = await User.findOne({
        $or: [{ username: normalizedUsername }, { email: normalizedEmail }]

    })

    if (existedUser) {
        throw new ApiError(409, "User already exists with this username or email")
    }

    const user = await User.create({
        username: normalizedUsername,
        email: normalizedEmail,
        password
    })
    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if (!createdUser) {
        throw new ApiError(500, "Failed to create user")
    }

    return res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully"))

})

const loginUser = asyncHandler(async (req, res) => {
    //get data-->req.body
    //validation based on username or email
    //find user in database
    //password checking
    //access and refresh token
    //send cookie

    const { username, email, password } = req.body || {}
    const normalizedUsername = username?.toLowerCase()?.trim()
    const normalizedEmail = email?.toLowerCase()?.trim()

    if ((!normalizedUsername && !normalizedEmail) || !password?.trim()) {
        throw new ApiError(400, "username or email and password are required")
    }

    const loginFilter = normalizedUsername
        ? { username: normalizedUsername }
        : { email: normalizedEmail }

    const user = await User.findOne(loginFilter)
    if (!user) {
        throw new ApiError(400, "User does not exist")
    }

    const isPasswordValid = await user.isCorrectPassword(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const { accessToken, refreshToken } = await generateAccessRefreshToken(user._id)



    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken
                },
                "User Logged In Successfully"
            )
        )

})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken:1
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    }
    return res
        .status(200)
        .clearCookie("accessToken", { ...options })
        .clearCookie("refreshToken", { ...options })
        .json(
            new ApiResponse(200, null, "User Logged Out Successfully")
        )
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request ")
    }

    try {
        const decodeToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodeToken?.userId);

        if (!user) {
            throw new ApiError(401, "Invalid Refresh Token ")
        }
        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh Token Mismatch ")
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
        }

        const accessToken = user.generateAccessToken();
        const newRefreshToken = user.generateRefreshToken();
        
        user.refreshToken = newRefreshToken;
        await user.save({ validateBeforeSave: false });

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(200,

                    { accessToken, refreshToken: newRefreshToken },

                    "Access Token Generated Successfully"
                )
            )

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token ")
    }
})

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?._id).select("-password -refreshToken")

    if (!user) {
        throw new ApiError(404, "User not found")
    }

    return res.status(200).json(
        new ApiResponse(200, user, "Current user fetched successfully")
    )
})

const updateUserBookingApproval = asyncHandler(async (req, res) => {
    if (String(req.user?.role || "") !== "admin") {
        throw new ApiError(403, "Only admin can approve bookings")
    }

    const userId = String(req.params?.userId || "").trim()
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "A valid userId is required")
    }

    const approved = Boolean(req.body?.approved)

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { isBookingApproved: approved } },
        { new: true }
    ).select("-password -refreshToken")

    if (!updatedUser) {
        throw new ApiError(404, "User not found")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, approved ? "Booking approved successfully" : "Booking approval revoked"))
})

//api to get published images by pipeline and by user can be implemented here in future

const getPublishedImages = asyncHandler(async (req, res) => {

    const publishedImageMessages = await Chat.aggregate([
        {$unwind: "$messages"},

        {$match: {
            "messages.isImage": true,
            "messages.isPublished": true,
        }
       },
       {
        $sort: {
            "messages.timestamp": -1,
        },
       },
       {
        $project: {
            _id: 0,
            messageId: "$messages._id",
            chatId: "$_id",
            imageUrl: "$messages.content",
            username: "$username",
            ownerId: "$userId",

        }   
       }
    ])

    const currentUserId = String(req.user?._id || "")

    const normalizedImages = publishedImageMessages.map((item) => ({
        messageId: String(item?.messageId || ""),
        chatId: String(item?.chatId || ""),
        imageUrl: item?.imageUrl,
        username: item?.username,
        canDelete: String(item?.ownerId || "") === currentUserId,
    }))

    return res
    .status(200)
    .json(
        new ApiResponse(200, normalizedImages, "Published images fetched successfully")
    )   
})

const deletePublishedImage = asyncHandler(async (req, res) => {
    const userId = req.user?._id
    const messageId = String(req.params?.messageId || "").trim()

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(400, "A valid messageId is required")
    }

    const chat = await Chat.findOne({
        userId,
        "messages._id": messageId,
    })

    if (!chat) {
        throw new ApiError(404, "Image not found or you are not allowed to delete it")
    }

    const imageMessageIndex = chat.messages.findIndex((message) => String(message?._id) === messageId)
    if (imageMessageIndex < 0) {
        throw new ApiError(404, "Image not found")
    }

    const targetMessage = chat.messages[imageMessageIndex]
    if (!targetMessage?.isImage || !targetMessage?.isPublished) {
        throw new ApiError(400, "Only published community images can be deleted")
    }

    const imageKitFileId = String(targetMessage?.mediaProviderFileId || "").trim()
    let imageKitDeleted = false
    let deleteNote = ""

    if (imageKitFileId) {
        try {
            const imagekit = getImageKitClient()
            await imagekit.deleteFile(imageKitFileId)
            imageKitDeleted = true
        } catch {
            deleteNote = "Image removed from community, but storage cleanup on ImageKit could not be completed."
        }
    } else {
        deleteNote = "Image removed from community. This older image has no stored ImageKit file ID for storage cleanup."
    }

    chat.messages.splice(imageMessageIndex, 1)
    await chat.save()

    const responseMessage = deleteNote || "Published image deleted successfully"

    return res
        .status(200)
        .json(new ApiResponse(200, { messageId, imageKitDeleted }, responseMessage))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    updateUserBookingApproval,
    getPublishedImages,
    deletePublishedImage
}

