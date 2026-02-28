import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import jwt from "jsonwebtoken";


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

    const user = await User.findOne({
        $or: [{ username: normalizedUsername }, { email: normalizedEmail }]
    })
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
                    user: loggedInUser, accessToken, refreshToken
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

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser
}

