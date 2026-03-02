import mongoose from "mongoose"
import { DB_NAME }   from "../constants.js"


//Because in serverless environments like vercel, your function can run multiple times.You don’t want to reconnect to DB on every request.So you reuse the same connection.this is a common pattern to optimize DB connections in serverless environments. By keeping the connection promise outside of the request handler, you ensure that all requests share the same connection once it's established, rather than creating a new connection for each request.
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