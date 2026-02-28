import mongoose from "mongoose"
import { DB_NAME }   from "../constants.js"

export const connectDB=async()=>{
    try {
        const mongoUri = process.env.MONGODB_URI

        if (!mongoUri) {
            throw new Error("MONGODB_URI is missing. Check server/.env loading.")
        }

        const connectionInstance=await mongoose.connect(mongoUri, {
            dbName: DB_NAME
        })
        console.log(`Mongodb connected sucessfully!! DB Host:${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("Mongodb connection FAILED!!!!!!", error.message);
        process.exit(1)
    }
}