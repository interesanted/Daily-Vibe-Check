from google import genai
from google.genai import types
from config import CONFIG
import database

def get_productivity_tip(username):
    """
    Generates a personalized productivity tip using Gemini 3.5 Flash based on 
    the active user's last 5 AAR entries. Uses the modern google-genai SDK.
    """
    # 1. Retrieve the config and verify the API key
    config = CONFIG
    api_key = config.get("gemini_api_key", "").strip()
    model_name = config.get("model_name", "gemini-3.5-flash")

    if not api_key:
        return "⚠️ Gemini API Key not found. Please click the Settings gear icon in the top right to configure your API key."

    # 2. Fetch recent entries for user
    entries = database.get_recent_user_entries(username, limit=5)
    
    if not entries:
        return ("✨ Welcome to DailyAAR! Log your very first After Action Review below, "
                "and your AI Productivity Coach will begin analyzing your patterns to give "
                "you tailored Agile tips.")

    # 3. Construct the prompt
    prompt = f"You are analyzing the recent Daily After Action Reviews (AARs) for team member: {username}.\n\n"
    prompt += "Here are their last 5 AAR logs (from oldest to newest):\n"
    
    for i, entry in enumerate(entries, 1):
        went_right, went_wrong, next_steps, date_str, time_str = entry
        prompt += f"--- Entry {i} ({date_str} {time_str}) ---\n"
        prompt += f"What went right: {went_right}\n"
        prompt += f"What went wrong: {went_wrong}\n"
        prompt += f"What to do differently: {next_steps}\n\n"

    prompt += (
        "Based on these patterns, act as an expert Agile Coach and provide one highly specific, "
        "actionable productivity tip for them. \n"
        "CRITICAL RULES:\n"
        "1. Keep the tip strictly UNDER 50 words.\n"
        "2. Address the user directly (e.g., 'You should...').\n"
        "3. Focus on resolving recurring negative patterns or amplifying positive trends seen in their logs.\n"
        "4. Do not include introductory fluff (like 'Here is your tip:'). Get straight to the point."
    )

    # 4. Invoke the Gemini API using the modern google-genai client
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=150
            )
        )
        tip_text = response.text.strip()
        
        # Clean up any potential markdown formatting
        if tip_text.startswith('"') and tip_text.endswith('"'):
            tip_text = tip_text[1:-1].strip()
            
        return tip_text

    except Exception as e:
        error_msg = str(e)
        # Avoid direct console print of emojis to prevent CP1252 terminal UnicodeEncodeErrors on Windows
        print(f"Gemini API error occurred during processing.")
        if "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg:
            return "⚠️ The provided Gemini API Key appears to be invalid. Please check your settings."
        elif "quota" in error_msg.lower() or "limit" in error_msg.lower():
            return "⚠️ Gemini API quota exceeded. Please check your billing/usage limits in Google AI Studio."
        else:
            return f"⚠️ Unable to reach your AI Coach right now (Error: {error_msg[:100]}...). Your AAR has been saved successfully!"
