import sqlite3, os

db = "geoanalyst.db"
print("DB exists:", os.path.exists(db))
if os.path.exists(db):
    print("Size:", os.path.getsize(db), "bytes")
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print("Tables:", [r[0] for r in c.fetchall()])
    c.execute("SELECT count(*) FROM users")
    print("Users:", c.fetchone()[0])
    c.execute("SELECT id, name, email FROM users")
    for row in c.fetchall():
        print(f"  User #{row[0]}: {row[1]} ({row[2]})")
    conn.close()
else:
    print("Database not found! Creating...")
    from auth import init_db
    init_db()
    print("Created.")
