import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true, 
        minlength: 8,
        match: [/^[A-Za-z0-9_]{8,}$/, "Password can only contain letters, numbers, and underscore (_)"]
    },
    refreshToken: {
        type: String,
        default: null
    },
    credits:{
        type:Number,
        default:50
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    isBookingApproved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true })

//hash password before saving to database

userSchema.pre("save", async function () {
    if(!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, 10)
 
})
userSchema.methods.isCorrectPassword=async function(password){
    return await bcrypt.compare(password,this.password)
}

userSchema.methods.generateAccessToken=function(){
    return jwt.sign(
        {
            userId: this._id,
            username: this.username,
            email: this.email,
            role: this.role
        }
        ,process.env.ACCESS_TOKEN_SECRET,
        {expiresIn:process.env.ACCESS_TOKEN_EXPIRY}
    )
}

userSchema.methods.generateRefreshToken=function(){
    return jwt.sign(
        {
            userId: this._id,
           
        }
        ,process.env.REFRESH_TOKEN_SECRET,
        {expiresIn:process.env.REFRESH_TOKEN_EXPIRY}
    )
}



export const User= mongoose.model("User", userSchema)
