# 🎭 The Daily Vibe - Premium Personal Reflection Space

The **Daily Vibe PWA** is a personal journal, category checklist, micro-blip tracker, and team Agile After Action Review (AAR) compiler. 

Re-engineered to be **zero-install, zero-latency, and 100% free**, this Progressive Web App (PWA) relies on modern standard web technologies (HTML5, ES6 JS, Tailwind CSS CDN) and communicates directly with **Google Gemini 3.5 Flash** for Agile coaching and psychological wellness analyses ("Vibe Checks").

---

## 🚀 How to Run Locally

You do not need to install Node.js, npm, or run complex setup installers!

1. Open your Windows **File Explorer** and go to this project's folder:
   📁 `C:\Users\Kyle\Documents\DailyAAR App`
2. Double-click the file named **`run_app.bat`** (or just `run_app` with a gear icon).
3. The launcher will automatically start Python's built-in lightweight web server and pop open the dashboard instantly at:
   🌐 **`http://localhost:8000`**

---

## ⚙️ Initial Application Setup

1. Once the application opens in your browser, click the **Settings Gear (⚙️)** in the top right.
2. Enter your preferred **Author Username** (this tags your entries).
3. Paste your free **Google Gemini API Key** (you can get one in 30 seconds for free from [Google AI Studio](https://aistudio.google.com/)).
4. Click **Save Application Settings**.
5. You're ready to log journals, tasks, blips, AAR reviews, and request AI coaching tips! All keys are saved securely in your browser's private local storage.

---

## 🌩️ Setup Cloud Synchronization (Supabase) - 100% Free

If you want your data synced in real-time to a secure cloud database (protecting against browser cache clears and allowing you to access it from anywhere), you can set up a free **Supabase** cloud project in 2 minutes:

1. Go to **[Supabase](https://supabase.com/)** and sign in for free with your GitHub or Email account.
2. Click **New Project** and name it (e.g. `DailyVibe`). Set a database password.
3. Once your project is created (takes about 1 minute), go to **Project Settings ➔ API**.
4. Copy your **Project URL** and your **anon (public) Key**.
5. Open the Daily Vibe app settings (⚙️), paste these two values in, and hit **Save Settings**.
6. **Create Database Tables:** Under your Supabase Project dashboard, go to the **SQL Editor** tab and execute this simple SQL query to generate your database tables automatically:

```sql
-- Create Journals Table
create table journals (
  id text primary key,
  username text not null,
  content text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Tasks Table
create table tasks (
  id text primary key,
  name text not null,
  category text not null,
  completed boolean default false,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Blips Table
create table blips (
  id text primary key,
  username text not null,
  content text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create AARs Table
create table aars (
  id text primary key,
  username text not null,
  went_right text not null,
  went_wrong text not null,
  next_steps text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);
```

Once tables are created, your app will automatically start backing up all logs and checklists in real-time with zero lag!

---

## 📱 Mobile App Installation (iOS & Android)

This Progressive Web App (PWA) is designed to run perfectly on mobile screens with **zero browser borders** (just like a native App Store app):

*   **iOS (iPhone/iPad):** Open the local/hosted URL in **Safari**. Tap the **Share icon** (square with an up arrow) and select **"Add to Home Screen"**.
*   **Android:** Open the URL in **Google Chrome**. Tap the **three dots** (top right) and select **"Install App"** or **"Add to Home Screen"**.

A beautiful icon will appear on your phone's home screen, giving you a full-screen, native-grade experience!
