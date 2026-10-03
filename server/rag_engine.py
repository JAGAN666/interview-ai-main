import os
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from sentence_transformers import SentenceTransformer
from typing import List

class SentenceTransformerEmbeddings(Embeddings):
    """Custom embeddings wrapper using sentence-transformers directly"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()
    
    def embed_query(self, text: str) -> List[float]:
        embedding = self.model.encode([text], normalize_embeddings=True)[0]
        return embedding.tolist()

class RagEngine:
    def __init__(self, data_folder="server/data", model_name="all-MiniLM-L6-v2"):
        print(f"[LangChain RAG] Initializing with embeddings: {model_name}")
        
        # 1. Initialize Embeddings (using our custom wrapper)
        self.embeddings = SentenceTransformerEmbeddings(model_name)
        
        # 2. Load and index documents
        self.vectorstore = None
        self._ingest_data_folder(data_folder)
    
    def _ingest_data_folder(self, folder_path: str):
        """Load all PDFs and TXT files from the data folder using LangChain loaders"""
        print(f"[LangChain RAG] Scanning {folder_path} for documents...")
        
        all_docs = []
        
        # Add foundational knowledge
        all_docs.append(Document(
            page_content="General Software Engineering: SOLID, CAP Theorem, ACID, Big O, REST vs GraphQL, Microservices, CI/CD.",
            metadata={"source": "Knowledge Base"}
        ))
        
        if os.path.exists(folder_path):
            # Load PDFs and TXT files
            for filename in os.listdir(folder_path):
                file_path = os.path.join(folder_path, filename)
                try:
                    if filename.lower().endswith(".pdf"):
                        loader = PyPDFLoader(file_path)
                        docs = loader.load()
                        for doc in docs:
                            doc.metadata["source"] = filename
                        all_docs.extend(docs)
                        print(f"  Loaded PDF: {filename} ({len(docs)} pages)")
                        
                    elif filename.lower().endswith(".txt"):
                        loader = TextLoader(file_path, encoding='utf-8')
                        docs = loader.load()
                        for doc in docs:
                            doc.metadata["source"] = filename
                        all_docs.extend(docs)
                        print(f"  Loaded TXT: {filename}")
                        
                except Exception as e:
                    print(f"  Error loading {filename}: {e}")
        else:
            print(f"  Warning: Data folder {folder_path} not found.")
        
        if not all_docs:
            print("[LangChain RAG] No documents found. Index is empty.")
            return
        
        # 3. Chunk documents with RecursiveCharacterTextSplitter
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        split_docs = text_splitter.split_documents(all_docs)
        print(f"[LangChain RAG] Split into {len(split_docs)} chunks")
        
        # 4. Create FAISS vectorstore
        self.vectorstore = FAISS.from_documents(split_docs, self.embeddings)
        print(f"[LangChain RAG] FAISS index created with {self.vectorstore.index.ntotal} vectors")
    
    def search(self, query: str, k: int = 5) -> str:
        """Search using MMR for diverse results"""
        if not self.vectorstore:
            return ""
        
        # MMR = Maximal Marginal Relevance (diversity + relevance)
        docs = self.vectorstore.max_marginal_relevance_search(
            query, 
            k=k,
            fetch_k=k * 3,  # Fetch more, then re-rank for diversity
            lambda_mult=0.7  # 0.7 = balance between relevance (1.0) and diversity (0.0)
        )
        
        results = []
        for doc in docs:
            source = doc.metadata.get("source", "Unknown")
            results.append(f"[Source: {source}] {doc.page_content}")
        
        return "\n\n".join(results)
    
    def similarity_search(self, query: str, k: int = 5) -> str:
        """Standard similarity search (faster, but may return redundant chunks)"""
        if not self.vectorstore:
            return ""
        
        docs = self.vectorstore.similarity_search(query, k=k)
        
        results = []
        for doc in docs:
            source = doc.metadata.get("source", "Unknown")
            results.append(f"[Source: {source}] {doc.page_content}")
        
        return "\n\n".join(results)

# Singleton
rag_engine = RagEngine()
