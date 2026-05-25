import os
import json
from pathlib import Path

# Config file paths
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
CONFIG_FILE = BASE_DIR / "config.json"

DEFAULT_DB_NAME = "daily_aar.db"
DEFAULT_MODEL = "gemini-3.5-flash"

def load_config():
    """Loads settings from config.json and .env."""
    config = {
        "gemini_api_key": "",
        "db_path": str(BASE_DIR / DEFAULT_DB_NAME),
        "model_name": DEFAULT_MODEL
    }

    # 1. Try loading from environment variables
    config["gemini_api_key"] = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""

    # 2. Try loading from .env file (standard key=value)
    if ENV_FILE.exists():
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        if k.strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                            config["gemini_api_key"] = v.strip().strip('"').strip("'")
                        elif k.strip() == "AAR_DB_PATH":
                            config["db_path"] = v.strip().strip('"').strip("'")
                        elif k.strip() == "GEMINI_MODEL":
                            config["model_name"] = v.strip().strip('"').strip("'")
        except Exception:
            pass

    # 3. Try loading from config.json (for other settings)
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                config.update(data)
        except Exception:
            pass

    return config

def save_config(api_key=None, db_path=None, model_name=None):
    """Saves settings to config files."""
    current_config = load_config()

    if api_key is not None:
        current_config["gemini_api_key"] = api_key.strip()
        # Save API key to .env
        try:
            lines = []
            key_written = False
            db_written = False
            model_written = False

            if ENV_FILE.exists():
                with open(ENV_FILE, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("GEMINI_API_KEY="):
                            lines.append(f"GEMINI_API_KEY={api_key.strip()}\n")
                            key_written = True
                        elif line.strip().startswith("AAR_DB_PATH="):
                            if db_path is not None:
                                lines.append(f"AAR_DB_PATH={db_path.strip()}\n")
                                db_written = True
                            else:
                                lines.append(line)
                        elif line.strip().startswith("GEMINI_MODEL="):
                            if model_name is not None:
                                lines.append(f"GEMINI_MODEL={model_name.strip()}\n")
                                model_written = True
                            else:
                                lines.append(line)
                        else:
                            lines.append(line)

            if not key_written:
                lines.append(f"GEMINI_API_KEY={api_key.strip()}\n")
            if db_path is not None and not db_written:
                lines.append(f"AAR_DB_PATH={db_path.strip()}\n")
            if model_name is not None and not model_written:
                lines.append(f"GEMINI_MODEL={model_name.strip()}\n")

            with open(ENV_FILE, "w", encoding="utf-8") as f:
                f.writelines(lines)
        except Exception as e:
            print(f"Error saving to .env: {e}")

    # Save to config.json for GUI load/save persistence
    json_config = {}
    if db_path is not None:
        json_config["db_path"] = db_path.strip()
    if model_name is not None:
        json_config["model_name"] = model_name.strip()

    if json_config:
        try:
            if CONFIG_FILE.exists():
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                    existing.update(json_config)
                    json_config = existing

            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(json_config, f, indent=4)
        except Exception as e:
            print(f"Error saving config.json: {e}")

# Load initial config
CONFIG = load_config()
