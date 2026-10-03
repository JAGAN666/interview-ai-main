import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // The SDK doesn't have a direct 'listModels' helper easily exposed in the main client in all versions, 
        // but we can try to hit the endpoint or just test a few common ones.

        // Actually, for the Node SDK, we might not have listModels easily accessible without using the REST API directly or a specific manager.
        // Let's try to just run a simple generateContent with a few different model names to see which one succeeds.

        const candidates = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-001",
            "gemini-1.5-pro",
            "gemini-pro",
            "gemini-1.0-pro"
        ];

        console.log("Testing models...");

        for (const modelName of candidates) {
            try {
                console.log(`Trying ${modelName}...`);
                const m = genAI.getGenerativeModel({ model: modelName });
                const result = await m.generateContent("Hello");
                console.log(`✅ SUCCESS: ${modelName} works!`);
                console.log("Response:", result.response.text());
                break; // Stop after finding one that works
            } catch (e) {
                console.log(`❌ FAILED: ${modelName}`);
                console.log(`   Error: ${e.message.split('\n')[0]}`); // Print first line of error
            }
        }

    } catch (error) {
        console.error("Global Error:", error);
    }
}

listModels();
