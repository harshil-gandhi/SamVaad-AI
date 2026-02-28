import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    username: {
        type: String,
        required: true  
    },
    name: {
        type: String,
        required: true
    },
    
    messages: [
        {
            isImage: {
                type: Boolean,
                required: true
            },
            isPublished: {
                type: Boolean,
                required: true
            },
            timestamp: {
                type: Date,
                default: Date.now
            },
            role: {
                type: String,
                required: true
            },
            content: {
                type: String,
                required: true
            }
        }
    ]
}, { timestamps: true })

export const Chat = mongoose.model("Chat", chatSchema)

