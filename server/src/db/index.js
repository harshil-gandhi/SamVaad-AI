import mongoose from "mongoose"
import { DB_NAME }   from "../constants.js"

let cachedConnectionPromise = null

export const connectDB=async()=>{
    const mongoUri = process.env.MONGODB_URI

    if (!mongoUri) {
        throw new Error("MONGODB_URI is missing. Check server/.env loading.")
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection
    }

    if (cachedConnectionPromise) {
        return cachedConnectionPromise
    }

    cachedConnectionPromise = mongoose
        .connect(mongoUri, {
            dbName: DB_NAME
        })
        .then((connectionInstance) => {
            console.log(`Mongodb connected sucessfully!! DB Host:${connectionInstance.connection.host}`)
            return connectionInstance.connection
        })
        .catch((error) => {
            cachedConnectionPromise = null
            console.log("Mongodb connection FAILED!!!!!!", error.message)
            throw error
        })

    return cachedConnectionPromise
}