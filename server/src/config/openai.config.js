import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.warn("[openai] OPENAI_API_KEY is missing. AI endpoints may fail until it is set in .env.");
}

const openai = new OpenAI({
    apiKey: apiKey || "MISSING_OPENAI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export default openai