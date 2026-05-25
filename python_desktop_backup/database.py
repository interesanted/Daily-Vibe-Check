import sqlite3
import datetime
from config import CONFIG

def get_connection():
    """Establishes connection to the SQLite database with high timeout for network shares."""
    db_path = CONFIG["db_path"]
    # 30-second timeout helps prevent locking issues when multiple users access the DB on a network share
    conn = sqlite3.connect(db_path, timeout=30.0)
    # Enable autocommit or use standard connection context
    return conn

def initialize_db():
    """Initializes the database and creates the aars table if it does not exist."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS aars (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                date_logged TEXT NOT NULL,
                time_logged TEXT NOT NULL,
                went_right TEXT NOT NULL,
                went_wrong TEXT NOT NULL,
                next_steps TEXT NOT NULL
            )
        """)
        conn.commit()
    except Exception as e:
        print(f"Database initialization error: {e}")
        raise e
    finally:
        conn.close()

def add_aar_entry(username, went_right, went_wrong, next_steps):
    """Inserts a new AAR entry into the database."""
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO aars (username, date_logged, time_logged, went_right, went_wrong, next_steps)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (username, date_str, time_str, went_right.strip(), went_wrong.strip(), next_steps.strip()))
        conn.commit()
        return True
    except Exception as e:
        print(f"Database insert error: {e}")
        return False
    finally:
        conn.close()

def get_recent_user_entries(username, limit=5):
    """Fetches the most recent N entries for a specific user, sorted in chronological order."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Sort by date and time descending first to get the most recent ones, then reverse them
        # to feed them to the AI in chronological order (oldest to newest)
        cursor.execute("""
            SELECT went_right, went_wrong, next_steps, date_logged, time_logged
            FROM aars
            WHERE username = ?
            ORDER BY date_logged DESC, time_logged DESC
            LIMIT ?
        """, (username, limit))
        rows = cursor.fetchall()
        # Reverse to chronological order (oldest to newest)
        rows.reverse()
        return rows
    except Exception as e:
        print(f"Database fetch recent error: {e}")
        return []
    finally:
        conn.close()

def get_all_entries():
    """Fetches all logged entries from the database, newest first, for the history viewer."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username, date_logged, time_logged, went_right, went_wrong, next_steps
            FROM aars
            ORDER BY date_logged DESC, time_logged DESC
        """)
        return cursor.fetchall()
    except Exception as e:
        print(f"Database fetch all error: {e}")
        return []
    finally:
        conn.close()
