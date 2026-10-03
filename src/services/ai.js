export const initializeGemini = (apiKey) => {
  // No-op for now as we use backend
  console.log("Using local Python backend. API Key not needed on frontend.");
};

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const generateAnswer = async (question, company = "general", conversationHistory = []) => {
  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        skills_context: company,
        conversation_history: conversationHistory
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.answer;
  } catch (error) {
    console.error("Error generating answer:", error);
    return `Error connecting to backend: ${error.message}. Is the Python server running?`;
  }
};

export const fetchSuggestions = async (company = "general") => {
  try {
    const response = await fetch(`${API_BASE_URL}/suggestions?skills_context=${company}`);
    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.suggestions;
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return []; // Return empty array on error
  }
};
