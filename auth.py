"""
Authentication & Database Module
=================================
PostgreSQL-backed auth with JWT tokens, contact storage, and analysis history.
Tracks user sign-up info and every login with date and time.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
import bcrypt
import psycopg2
import psycopg2.extras
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT Config
SECRET_KEY = os.getenv("JWT_SECRET", "geoanalyst-ai-secret-key-2026-changeme")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer(auto_error=False)

# PostgreSQL Connection String Configured from User Specifications
DB_CONNECTION_STRING = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/Site_IQ")

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

        # ── Users table with signup date & time columns ──
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                signup_date DATE DEFAULT CURRENT_DATE,
                signup_time TIME DEFAULT CURRENT_TIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # ── Login history: user_id, user_name, login_date, login_time ──
        c.execute("""
            CREATE TABLE IF NOT EXISTS login_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_name TEXT NOT NULL,
                user_mail TEXT NOT NULL,
                login_date DATE DEFAULT CURRENT_DATE,
                login_time TIME DEFAULT CURRENT_TIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)

        # ── Contacts table ──
        c.execute("""
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # ── Analysis history ──
        c.execute("""
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
        """)

        # ── Safe migration: add missing columns to existing tables ──
        for col, col_type, default in [
            ("signup_date", "DATE", "CURRENT_DATE"),
            ("signup_time", "TIME", "CURRENT_TIME"),
        ]:
            try:
                c.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {col_type} DEFAULT {default};")
            except Exception:
                pass

        for col, col_type, default in [
            ("user_name", "TEXT", "'unknown'"),
            ("user_mail", "TEXT", "'unknown'"),
            ("login_date", "DATE", "CURRENT_DATE"),
            ("login_time", "TIME", "CURRENT_TIME"),
        ]:
            try:
                c.execute(f"ALTER TABLE login_history ADD COLUMN IF NOT EXISTS {col} {col_type} DEFAULT {default};")
            except Exception:
                pass

        conn.commit()
        conn.close()
        print("[Database] All tables verified in PostgreSQL (Site_IQ).")
        print("[Database]    - users (id, name, email, signup_date, signup_time)")
        print("[Database]    - login_history (user_id, user_name, user_mail, login_date, login_time)")
        print("[Database]    - contacts")
        print("[Database]    - analysis_history")
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
    conn = None
    try:
        conn = get_db()
        c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        c.execute(
            """INSERT INTO users (name, email, password_hash, signup_date, signup_time)
               VALUES (%s, %s, %s, CURRENT_DATE, CURRENT_TIME) RETURNING *""",
            (name, email.lower(), hash_password(password))
        )
        user = c.fetchone()
        conn.commit()
        return dict(user)
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    except psycopg2.OperationalError:
        raise HTTPException(status_code=503, detail="Database is offline. Please start PostgreSQL in pgAdmin.")
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error inserting/fetching data from database: {str(e)}")
    finally:
        if conn:
            conn.close()


def authenticate_user(email: str, password: str) -> dict:
    conn = None
    try:
        conn = get_db()
        c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        c.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
        user = c.fetchone()
        
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Record login with user_id, user_name, user_mail, login_date, login_time
        user_id = user["id"]
        user_name = user["name"]
        user_mail = user["email"]
        c.execute(
            """INSERT INTO login_history (user_id, user_name, user_mail, login_date, login_time)
               VALUES (%s, %s, %s, CURRENT_DATE, CURRENT_TIME)""",
            (user_id, user_name, user_mail)
        )
        conn.commit()
        return dict(user)
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except psycopg2.OperationalError:
        raise HTTPException(status_code=503, detail="Database is offline. Please start PostgreSQL in pgAdmin.")
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error fetching data from database for sign in: {str(e)}")
    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────
# Login History Retrieval
# ─────────────────────────────────────────────
def get_login_history(user_id: int, limit: int = 50) -> list:
    """Get login history for a specific user."""
    conn = get_db()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(
        """SELECT id, user_id, user_name, user_mail,
                  TO_CHAR(login_date, 'YYYY-MM-DD') as login_date,
                  TO_CHAR(login_time, 'HH24:MI:SS') as login_time
           FROM login_history 
           WHERE user_id = %s 
           ORDER BY id DESC 
           LIMIT %s""",
        (user_id, limit)
    )
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_users() -> list:
    """Get all registered users with their signup info (admin use)."""
    conn = get_db()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(
        """SELECT id, name, email,
                  TO_CHAR(signup_date, 'YYYY-MM-DD') as signup_date,
                  TO_CHAR(signup_time, 'HH24:MI:SS') as signup_time,
                  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
                  (SELECT COUNT(*) FROM login_history lh WHERE lh.user_id = u.id) as total_logins,
                  (SELECT TO_CHAR(MAX(login_date), 'YYYY-MM-DD')
                   FROM login_history lh WHERE lh.user_id = u.id) as last_login_date
           FROM users u
           ORDER BY u.created_at DESC"""
    )
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_login_history(limit: int = 100) -> list:
    """Get all login records across all users (admin use)."""
    conn = get_db()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(
        """SELECT lh.id, lh.user_id, lh.user_name, lh.user_mail,
                  TO_CHAR(lh.login_date, 'YYYY-MM-DD') as login_date,
                  TO_CHAR(lh.login_time, 'HH24:MI:SS') as login_time
           FROM login_history lh
           ORDER BY lh.id DESC
           LIMIT %s""",
        (limit,)
    )
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


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
        d["layer_scores"] = json.loads(d.get("layer_scores") or "{}")
        # PostgreSQL datetime to ISO string
        d["created_at"] = str(d["created_at"])
        results.append(d)
    return results
