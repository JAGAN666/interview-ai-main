import sqlite3
import json

class KnowledgeDB:
    def __init__(self, db_path="server/interview_knowledge.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create Tables
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS patterns (
            id INTEGER PRIMARY KEY,
            category TEXT,
            topic TEXT,
            content TEXT,
            keywords TEXT
        )
        ''')
        
        # Check if empty, then seed
        cursor.execute('SELECT count(*) FROM patterns')
        if cursor.fetchone()[0] == 0:
            self._seed_data(cursor)
            
        conn.commit()
        conn.close()

    def _seed_data(self, cursor):
        print("Seeding Knowledge DB...")
        data = [
            # System Design (Patterns)
            ("System Design", "Rate Limiter", "Pattern: Use Token Bucket algorithm for standard limiting. Leaky Bucket for smoothing bursts. Distributed: use consistent hashing for worker balancing.", "rate limiter, throttling, api gateway"),
            ("System Design", "TinyURL", "Pattern: Base62 encoding. ID generation using Ticket Server or Snowflake approach. K-V Store for metadata storage.", "url shortener, unique id, collision"),
            ("System Design", "Twitter/Newsfeed", "Pattern: Fan-out on write (Push) for celebrities. Fan-out on read (Pull) for normal users. Hybrid approach. Use efficient caching for timeline views.", "feed, social network, fanout"),
            
            # CodeAlpaca / Logical Reasoning (OpenOrca style)
            ("Algorithm", "LRU Cache", "Implementation: Doubly Linked List + Hash Map. get/put: O(1). Complexity: Space O(N) to store keys. Edge case: thread safety, eviction on limit.", "lru, cache, complexity, doubly linked list"),
            ("Logic", "Chain of Thought", "Strategy: Break problem into sub-tasks. Identify constraints early. Deduce step-by-step before concluding. Verify edge cases after initial solution.", "logic, reasoning, cot, steps"),
            ("Logic", "N-Queens", "Backtracking approach. Complexity: O(N!). Pruning: check rows, columns, and both diagonals. Proactive Tip: Discuss recursion depth and bitmask optimization.", "backtracking, n-queens, optimization"),
            
            # Behavioral Patterns (Conversational Style)
            ("Behavioral", "Weakness", "CONVERSATIONAL: Be honest and vulnerable. Share a REAL weakness (not fake humility). Example: 'I used to overcommit — said yes to everything. Learned the hard way to protect my bandwidth.' Show specific growth.", "weakness, failure, growth"),
            ("Behavioral", "Conflict", "CONVERSATIONAL: Don't sound rehearsed. Example: 'Honestly, we butted heads at first. But I asked to grab coffee, we talked it out, and realized we were both just stressed about the deadline.' Focus on resolution.", "conflict, disagreement, communication"),
            ("Behavioral", "Leadership", "CONVERSATIONAL: Leadership isn't about titles. Example: 'Nobody was owning the data pipeline mess, so I just stepped up and started fixing it. Sometimes you just gotta take the wheel.'", "leadership, ownership, mentor"),
            ("Behavioral", "Tell me about yourself", "CONVERSATIONAL: Don't recite your resume. Example: 'So I'm currently at the Center for Community Resilience building data pipelines. But honestly, what I'm most excited about is the robotics/AI space...'", "introduction, pitch, self"),
            ("Behavioral", "Failure", "CONVERSATIONAL: Own the failure fully. Example: 'Yeah, I totally messed that up. I underestimated the scope, we missed the deadline. But here's what I learned and changed...' No blame-shifting.", "failure, mistake, learning"),
            ("Behavioral", "Why this company", "CONVERSATIONAL: Be specific and genuine. Example: 'Look, I could give you the corporate answer, but honestly? I've been following your work on VLA models and I genuinely think this is the ImageNet moment for robotics.'", "why, company, interest"),

            # Methodology
            ("Methodology", "Scalability", "Vertical vs Horizontal. Database sharding strategies (Range based, Hash based, Directory based). Proactive Tip: Discuss Single Point of Failure and load balancing (L4 vs L7).", "scale, shard, horizontal, vertical"),
            ("Methodology", "Latent Bugs", "Discuss race conditions, memory leaks (heap vs stack), and deadlocks (Dining Philosophers). Detection: Profiling, Valgrind, or Thread Sanitizer.", "bug, memory, thread, deadlock"),
            
            # Human Archive / Robotics / VLA Patterns
            ("Robotics", "VLA Models", "Vision-Language-Action models for humanoid robotics. Requires diverse multimodal data (video, proprioception, text). Talk about data quality obsession and how your ETL experience translates.", "vla, robotics, multimodal, embodied"),
            ("Robotics", "Data Quality", "Pattern: Anonymization, precision in annotation, handling noisy sensor data. Example: 'At my job, I built automated validation that caught 95% of data quality issues before they hit production.'", "labeling, annotation, sensor, quality"),
            ("Startup", "Zero-to-One", "CONVERSATIONAL: Show you thrive in ambiguity. Example: 'I love building from scratch — there's no playbook, you just figure it out. At CCR I basically built our whole analytics stack from nothing.'", "startup, zero-to-one, iteration, ambiguity"),
            ("Startup", "Bias for Action", "CONVERSATIONAL: Show you ship fast. Example: 'I'd rather ship something imperfect and iterate than wait for perfection. At the Hackathon, we had 48 hours — we just built and fixed as we went.'", "startup, action, ship, iterate"),
            ("Startup", "Ownership", "CONVERSATIONAL: End-to-end thinking. Example: 'I don't just write the model and throw it over the wall. I think about deployment, monitoring, what happens when it breaks at 3am.'", "ownership, end-to-end, full-stack")
        ]
        
        cursor.executemany('INSERT INTO patterns (category, topic, content, keywords) VALUES (?, ?, ?, ?)', data)

    def search(self, query: str) -> str:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Simple keyword match
        # In production, use FTS5 (Full Text Search)
        query_parts = query.lower().split()
        results = []
        
        # Broader search
        cursor.execute('SELECT category, topic, content FROM patterns')
        rows = cursor.fetchall()
        
        for cat, topic, content in rows:
            score = 0
            text = (cat + " " + topic + " " + content).lower()
            for part in query_parts:
                if part in text:
                    score += 1
            
            if score > 0:
                results.append((score, f"[{cat}] {topic}: {content}"))
                
        # Sort by relevance
        results.sort(key=lambda x: x[0], reverse=True)
        
        conn.close()
        
        return "\n\n".join([r[1] for r in results[:3]])

# Singleton
knowledge_db = KnowledgeDB()
