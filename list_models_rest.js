import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log("Fetching models from:", url.replace(apiKey, "HIDDEN_KEY"));

fetch(url)
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error("API Error:", JSON.stringify(data.error, null, 2));
        } else {
            console.log("Available Models:");
            if (data.models) {
                data.models.forEach(model => {
                    console.log(`- ${model.name} (${model.supportedGenerationMethods.join(', ')})`);
                });
            } else {
                console.log("No models returned in list:", data);
            }
        }
    })
    .catch(err => {
        console.error("Network Error:", err);
    });
