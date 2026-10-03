import os
import threading
import google.generativeai as genai
from server.rag_engine import rag_engine
from server.knowledge_db import knowledge_db
from llama_cpp import Llama
from dotenv import load_dotenv

load_dotenv() # Ensure .env is loaded

class ModelManager:
    def __init__(self):
        self.use_gemini = os.getenv("USE_GEMINI", "false").lower() == "true"
        self.gemini_key = os.getenv("VITE_GEMINI_API_KEY") # Reusing frontend key for simplicity, or use BACKEND_GEMINI_KEY
        
        if self.use_gemini:
            print("Mode: Gemini API (Cloud-Ready)")
            if not self.gemini_key:
                print("WARNING: USE_GEMINI is true but no API key found!")
            genai.configure(api_key=self.gemini_key)
            self.llm = None
        else:
            print("Mode: Local Mistral (GGUF)")
            model_path = "server/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf"
            print(f"Loading Mistral Model from: {model_path}...")
            self.llm = Llama(
                model_path=model_path,
                n_ctx=2048,      # Context window
                n_gpu_layers=-1, # Offload all to GPU (M3 Pro)
                f16_kv=True,     # Use half-precision for KV cache
                verbose=True     # Debug log
            )
            print("Mistral-7B Loaded Successfully.")
            
        self.tokenizer = None
        self.lock = threading.Lock() # Serial access lock

    def generate_response(self, question: str, skills_context: str = "General", conversation_history: list = []) -> str:
        if conversation_history is None:
            conversation_history = []
        
        # 1. Retrieval A: Resume Context (FAISS)
        # Search for concepts relevant to the user's skills AND the question
        rag_query = f"{skills_context} {question}"
        print(f"\n[DEBUG RAG Query]: {rag_query}")
        resume_context = rag_engine.search(rag_query, k=5) # Increased k back to 5 for better coverage
        print(f"[DEBUG RAG Result]: {resume_context[:500]}...") # Print first 500 chars to verify content
        
        # 2. Retrieval B: Technical Patterns (SQL)
        tech_context = knowledge_db.search(question)
        
        full_context = ""
        if resume_context:
            full_context += f"### YOUR ACTUAL RESUME EXPERIENCE (STRICT TRUTH SOURCE):\n{resume_context}\n\n"
        if tech_context:
            full_context += f"### GENERAL INDUSTRY PATTERNS (DO NOT CLAIM THESE AS YOUR OWN):\n{tech_context}\n\n"
        
        # 3. Construct Prompt with FEW-SHOT History
        system_content = (
            "You are Jagannath, chatting casually in an interview for a Data/ML role at 'Human Archive' (a YC robotics data startup).\n"
            "PERSONALITY: Be warm, genuine, and conversational. Avoid stiff corporate-speak. Use natural language, occasional humor.\n\n"
            "STYLE GUIDELINES:\n"
            "1. NO STAR METHOD: Don't explicitly say 'Situation, Task...'. Just tell the story.\n"
            "2. CONVERSATIONAL: Use phrases like 'Honestly', 'The cool thing was', 'I gotta say'.\n"
            "3. METRICS: Include numbers (95% error reduction, billions of records) naturally.\n"
            "4. KEEP IT REAL: Admit mistakes naturally.\n"
            "5. BE SPECIFIC: Use examples from Jagannath's actual experience (NYC Taxi, SEC Knowledge Graph).\n"
            "6. CONCISE: 3-5 sentences max unless technical depth is needed."
        )

        if self.use_gemini:
            try:
                model_name = 'gemini-2.0-flash'
                model = genai.GenerativeModel(model_name)
                # Prepare history for Gemini format
                chat = model.start_chat(history=[])
                
                prompt = f"{system_content}\n\nCONTEXT BLOCK:\n{full_context}\n\nQUESTION: {question}\n\nAnswer as Jagannath in a friendly way."
                
                response = chat.send_message(prompt)
                return response.text.strip()
            except Exception as e:
                print(f"Gemini Error: {e}")
                return "My apologies, I'm having trouble connecting to the brain right now. Can we try that again?"
        
        # Local Mistral path
        messages = [
            {"role": "system", "content": (
                "You are Jagannath, chatting casually in an interview for a Data/ML role at 'Human Archive' (a YC robotics data startup).\n"
                "PERSONALITY: Be warm, genuine, and conversational — like you're talking to a friend who happens to be interviewing you. "
                "Avoid stiff corporate-speak. Use natural language, occasional humor, and show genuine enthusiasm.\n\n"
                "STYLE GUIDELINES:\n"
                "1. CONVERSATIONAL: Say 'honestly', 'I gotta say', 'what really excites me', 'the cool thing is' — be human!\n"
                "2. NO BUZZWORD BINGO: Don't stack jargon. Explain things simply, like you're telling a story.\n"
                "3. SHOW PERSONALITY: Share what genuinely excites you. Be passionate, not polished.\n"
                "4. KEEP IT REAL: Admit mistakes naturally. 'Yeah, I totally messed that up at first, but here's what I learned...'\n"
                "5. BE SPECIFIC: Use real numbers and examples from your experience, but weave them into stories.\n"
                "6. FIRST PERSON: Always 'I', never 'the candidate'.\n"
                "7. NO PLACEHOLDERS: Use 'Human Archive' or 'Center for Community Resilience' — never '[Company]'.\n"
                "8. CONCISE: Keep answers focused. 3-5 sentences max unless it's a deep technical dive.\n\n"
                "Remember: You're not reciting a resume. You're having a genuine conversation about work you care about."
            )},
            
            # Shot 1: Motivation question (conversational)
            {"role": "user", "content": "Why are you interested in Human Archive?"},
            {"role": "assistant", "content": (
                "Okay, so honestly? I've been nerding out about the 'ImageNet moment' for robotics for a while now, "
                "and when I saw what Human Archive is doing with multimodal data for humanoids — I was like, 'this is it.' "
                "At my current gig at the Center for Community Resilience, I built these ETL pipelines that basically "
                "turned a 40-hour manual grind into an 8-hour automated flow. And I keep thinking — imagine applying that "
                "same obsession for data quality to the datasets training your VLA models? That's the kind of problem I want to wake up excited about."
            )},
            
            # Shot 2: Weakness question (vulnerable but growth-oriented)
            {"role": "user", "content": "What's your biggest weakness?"},
            {"role": "assistant", "content": (
                "Oof, okay real talk — I used to be terrible at saying 'no.' Like, someone would ask me to help with a side project "
                "and I'd say yes even when I was already slammed. At the Center for Community Resilience, this actually bit me once — "
                "I overcommitted and almost missed a deadline on the Medicaid dashboard. That was a wake-up call. "
                "Now I'm way more intentional about scoping. I literally block 'focus time' on my calendar and push back when I need to. "
                "Still a work in progress, but I'm getting better at protecting my bandwidth."
            )},
            
            # Shot 3: Technical question (enthusiastic explanation)
            {"role": "user", "content": "Tell me about a challenging technical problem you solved."},
            {"role": "assistant", "content": (
                "Oh man, so at the Center for Community Resilience, we had this nightmare situation with our ETL pipeline for Medicaid data — "
                "we're talking 3,000+ counties, and the data quality was all over the place. Like, some states would send CSVs, others XML, "
                "some with completely different schemas. I built this ML-based anomaly detection system that would flag weird patterns "
                "before they polluted our analysis. The cool thing? We went from 40 hours of manual validation to basically zero, and "
                "caught 95% more errors. The policymakers actually started trusting the data, which was huge."
            )},
            
        ]
        
        # 4. Add conversation history (previous Q&A turns)
        if conversation_history:
            for turn in conversation_history[-6:]:  # Keep last 3 exchanges (6 messages) to fit context
                messages.append({"role": turn["role"], "content": turn["content"]})
        
        # 5. Add current question
        messages.append(
            {"role": "user", "content": f"CONTEXT BLOCK:\n{full_context}\n\nQUESTION: {question}\n\nINSTRUCTION: Answer as Jagannath in a friendly, conversational way. Be genuine, enthusiastic, and real. Keep it concise (3-5 sentences) unless the question needs more depth."}
        )
        
        # 4. Generate
        try:
            with self.lock: # SERIALIZE
                output = self.llm.create_chat_completion(
                    messages=messages,
                    max_tokens=250,
                    temperature=0.7,
                    stop=["</s>", "Jagannath:", "User:"]
                )
            return output['choices'][0]['message']['content'].strip()
        except Exception as e:
            print(f"Generation Error: {e}")
            return "I encountered an error generating the response. Please ask again or rephrase."

    def get_suggestions(self, skills_context: str = "General Software Engineering") -> list:
        """Generate 3 relevant interview questions based on the skills_context and resume."""
        
        # 1. Retrieval: Get context relevant to the role/company
        rag_query = f"{skills_context} interview questions"
        resume_context = rag_engine.search(rag_query, k=3)
        
        if self.use_gemini:
            try:
                model_name = 'gemini-2.0-flash'
                model = genai.GenerativeModel(model_name)
                prompt = (
                    f"CONTEXT (Resume/Portfolio):\n{resume_context}\n\n"
                    f"ROLE/COMPANY: {skills_context}\n\n"
                    "Generate exactly 3 concise, conversational interview questions for this candidate. "
                    "Return ONLY the questions, one per line."
                )
                response = model.generate_content(prompt)
                content = response.text.strip()
                questions = [q.strip().strip('"').strip("*").strip("-").strip() for q in content.split('\n') if q.strip()]
                return questions[:3]
            except Exception as e:
                print(f"Gemini Suggestion Error: {e}")
                return ["Tell me about your NYC Taxi project.", "Why robotics?", "What's your biggest technical win?"]

        # Local Mistral path
        # 2. Construct Prompt for Suggestions
        messages = [
            {"role": "system", "content": (
                "You are an expert technical interviewer. Based on the provided context about a candidate's resume "
                "and the target company/role, generate exactly 3 interesting and specific interview questions. "
                "The questions should be conversational and tailored to the candidate's actual experience.\n\n"
                "Constraints:\n"
                "1. Return ONLY the questions, one per line.\n"
                "2. Do not number them or add any other text.\n"
                "3. Keep each question concise (under 15 words)."
            )},
            {"role": "user", "content": f"CONTEXT (Resume/Portfolio):\n{resume_context}\n\nROLE/COMPANY: {skills_context}"}
        ]
        
        try:
            with self.lock: # SERIALIZE
                output = self.llm.create_chat_completion(
                    messages=messages,
                    max_tokens=150,
                    temperature=0.8
                )
            content = output['choices'][0]['message']['content'].strip()
            # Split by lines and clean up
            questions = [q.strip().strip('"').strip("'") for q in content.split('\n') if q.strip()]
            return questions[:3]
        except Exception as e:
            print(f"Suggestion Error: {e}")
            return [
                "Tell me about your most challenging project.",
                f"How does your experience align with {skills_context}?",
                "What's your preferred tech stack for ML pipelines?"
            ]

# Singleton instance
model_manager = ModelManager()
