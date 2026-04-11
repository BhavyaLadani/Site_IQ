"""
Authentication & Database Module
=================================
PostgreSQL-backed auth with JWT tokens, contact storage, and analysis history.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
import bcrypt
import psycopg2
import psycopg2.extras
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT Config
SECRET_KEY = os.getenv("JWT_SECRET", "geoanalyst-ai-secret-key-2026-changeme")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer(auto_error=False)

# PostgreSQL Connection String Configured from User Specifications
DB_CONNECTION_STRING = "postgresql://postgres:bhavya#1266@localhost:5432/Site_IQ"

# ─────────────────────────────────────────────
# Database Init
# ─────────────────────────────────────────────
def get_db():
    conn = psycopg2.connect(DB_CONNECTION_STRING)
    return conn

def init_db():
    """Create tables if they don't exist."""
    print("[Database] Connecting to PostgreSQL...")
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS analysis_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                location_name TEXT,
                composite_score INTEGER,
                grade TEXT,
                layer_scores TEXT,
                recommendation TEXT,
                use_case TEXT DEFAULT 'retail',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS login_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        conn.close()
        print("[Database] Tables verified in PostgreSQL.")
    except Exception as e:
        print(f"[Database Error] Could not connect to PostgreSQL. Is 'Site_IQ' created and running? Error: {e}")


# ─────────────────────────────────────────────
# Password & Token Helpers
# ─────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: int, email: str, name: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "email": email, "name": name, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ─────────────────────────────────────────────
# Auth Dependency
# ─────────────────────────────────────────────
async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Extract user from JWT. Returns None if no token (for optional auth)."""
    if creds is None:
        return None
    payload = decode_token(creds.credentials)
    return {"id": int(payload["sub"]), "email": payload["email"], "name": payload["name"]}


async def require_auth(creds: HTTPAuthorizationCredentials = Depends(security)):
    """Require valid JWT. Raises 401 if missing or invalid."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return decode_token(creds.credentials)


# ─────────────────────────────────────────────
# User CRUD
# ─────────────────────────────────────────────
def create_user(name: str, email: str, password: str) -> dict:
    try:
        conn = get_db()
        c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    except psycopg2.OperationalError as e:
        raise HTTPException(status_code=503, detail="Database is offline. Please start PostgreSQL in pgAdmin.")
        
    try:
        c.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING *",
            (name, email.lower(), hash_password(password))
        )
        user = c.fetchone()
        conn.commit()
        return dict(user)
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


def authenticate_user(email: str, password: str) -> dict:
    try:
        conn = get_db()
        c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    except psycopg2.OperationalError:
        raise HTTPException(status_code=503, detail="Database is offline. Please start PostgreSQL in pgAdmin.")

    c.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
    user = c.fetchone()
    
    if not user or not verify_password(password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Store login history logic per user request
    user_id = user["id"]
    c.execute("INSERT INTO login_history (user_id) VALUES (%s)", (user_id,))
    conn.commit()
    conn.close()
    
    return dict(user)


# ─────────────────────────────────────────────
# Contact CRUD
# ─────────────────────────────────────────────
def save_contact(name: str, email: str, message: str):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO contacts (name, email, message) VALUES (%s, %s, %s)",
        (name, email, message)
    )
    conn.commit()
    conn.close()


# ─────────────────────────────────────────────
# Analysis History
# ─────────────────────────────────────────────
def save_analysis(user_id: int, lat: float, lon: float, location_name: str,
                  result: dict, use_case: str = "retail"):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """INSERT INTO analysis_history 
           (user_id, lat, lon, location_name, composite_score, grade, layer_scores, recommendation, use_case)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (user_id, lat, lon, location_name,
         result.get("composite_score", 0), result.get("grade", "N/A"),
         json.dumps(result.get("layer_scores", {})),
         result.get("recommendation", ""), use_case)
    )
    conn.commit()
    conn.close()


def get_user_history(user_id: int, limit: int = 20) -> list:
    conn = get_db()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(
        "SELECT * FROM analysis_history WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
        (user_id, limit)
    )
    rows = c.fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["layer_scores"] = json.loads(d.get("layer_scores", "{}"))
        # PostgreSQL datetime to ISO string
        d["created_at"] = str(d["created_at"])
        results.append(d)
    return results

