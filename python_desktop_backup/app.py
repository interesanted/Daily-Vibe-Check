import os
import getpass
import threading
import time
from datetime import datetime
import customtkinter as ctk

# Import our custom modules
import config
from config import CONFIG
import database
import ai_coach

# Set up CustomTkinter appearance and theme
ctk.set_appearance_mode("Dark")
# "blue" theme uses deep blue and charcoal, perfect for a sleek dashboard
ctk.set_default_color_theme("blue")

class SettingsDialog(ctk.CTkToplevel):
    """
    A premium settings dialog to configure the Gemini API Key and Database Path.
    """
    def __init__(self, parent, on_save_callback):
        super().__init__(parent)
        self.parent = parent
        self.on_save_callback = on_save_callback
        
        self.title("Settings")
        self.geometry("550x420")
        self.resizable(False, False)
        
        # Make modal
        self.transient(parent)
        self.grab_set()
        
        # Center the window relative to parent
        self.update_idletasks()
        x = parent.winfo_x() + (parent.winfo_width() // 2) - (self.winfo_width() // 2)
        y = parent.winfo_y() + (parent.winfo_height() // 2) - (self.winfo_height() // 2)
        self.geometry(f"+{x}+{y}")
        
        # Title Label
        title_label = ctk.CTkLabel(
            self, 
            text="Application Settings", 
            font=ctk.CTkFont(family="Segoe UI", size=20, weight="bold")
        )
        title_label.pack(pady=(20, 15))
        
        # Card Frame for inputs
        card = ctk.CTkFrame(self)
        card.pack(fill="both", expand=True, padx=25, pady=(0, 20))
        
        # Gemini API Key section
        api_label = ctk.CTkLabel(
            card, 
            text="Google Gemini API Key", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold")
        )
        api_label.pack(anchor="w", padx=20, pady=(15, 5))
        
        self.api_entry = ctk.CTkEntry(
            card, 
            width=460, 
            placeholder_text="Enter your AI Studio API key...",
            show="*"  # Mask API key by default
        )
        self.api_entry.pack(padx=20, pady=(0, 5))
        
        # Fill existing API key
        existing_key = CONFIG.get("gemini_api_key", "")
        self.api_entry.insert(0, existing_key)
        
        toggle_btn = ctk.CTkCheckBox(
            card, 
            text="Show API Key", 
            font=ctk.CTkFont(size=11),
            command=self.toggle_api_visibility
        )
        toggle_btn.pack(anchor="w", padx=25, pady=(0, 15))
        
        # Database Path section
        db_label = ctk.CTkLabel(
            card, 
            text="Shared SQLite Database Path", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold")
        )
        db_label.pack(anchor="w", padx=20, pady=(5, 5))
        
        self.db_entry = ctk.CTkEntry(
            card, 
            width=460,
            placeholder_text="e.g. C:/Users/Public/daily_aar.db or N:/Shared/daily_aar.db"
        )
        self.db_entry.pack(padx=20, pady=(0, 5))
        self.db_entry.insert(0, CONFIG.get("db_path", ""))
        
        db_help = ctk.CTkLabel(
            card, 
            text="Place this file on a shared network drive for team-wide collaborative logs.",
            font=ctk.CTkFont(size=11, slant="italic"),
            text_color="gray"
        )
        db_help.pack(anchor="w", padx=22, pady=(0, 20))
        
        # Buttons Frame
        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(fill="x", side="bottom", pady=15, padx=20)
        
        cancel_btn = ctk.CTkButton(
            btn_frame, 
            text="Cancel", 
            width=100,
            fg_color="transparent",
            border_width=1,
            text_color=("black", "white"),
            command=self.destroy
        )
        cancel_btn.pack(side="left")
        
        save_btn = ctk.CTkButton(
            btn_frame, 
            text="Save Settings", 
            width=150,
            command=self.save_settings
        )
        save_btn.pack(side="right")
        
    def toggle_api_visibility(self):
        if self.api_entry.cget("show") == "*":
            self.api_entry.configure(show="")
        else:
            self.api_entry.configure(show="*")
            
    def save_settings(self):
        new_key = self.api_entry.get().strip()
        new_db_path = self.db_entry.get().strip()
        
        # Save config files
        config.save_config(api_key=new_key, db_path=new_db_path)
        
        # Re-load configuration
        config.CONFIG = config.load_config()
        
        # Try to re-initialize DB at new path
        try:
            database.initialize_db()
        except Exception as e:
            # Let the database fail gracefully in app.py if path is invalid
            print(f"Error re-initializing DB at path: {e}")
            
        # Execute callback to refresh GUI components
        self.on_save_callback()
        self.destroy()


class DailyAARApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        # 1. Main Window Parameters
        self.title("Daily After Action Review (AAR)")
        self.geometry("1200x800")
        self.minsize(1050, 700)
        
        # Initialize DB on startup
        database.initialize_db()
        
        # 2. Get Auto-detected Windows Username
        self.username = getpass.getuser()
        
        # Loading states for AI Coach
        self.coach_loading = False
        self.loading_animation_id = None
        self.loading_dots = 0
        
        # Setup Grid Layout (Header, Form on Left, History & Coach on Right)
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=4, minsize=420)  # Left column (Input Form)
        self.grid_columnconfigure(1, weight=5, minsize=550)  # Right column (Coach + History)
        
        # 3. Create GUI Components
        self.create_header()
        self.create_left_form()
        self.create_right_panels()
        
        # 4. Load History initially
        self.refresh_history()
        
        # 5. Fetch starting Coach tip (async)
        self.load_coach_tip()

    def create_header(self):
        """Creates the header top bar containing logo, user badge, and settings."""
        header_frame = ctk.CTkFrame(self, height=60, corner_radius=0)
        header_frame.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=0, pady=0)
        header_frame.grid_columnconfigure(1, weight=1)
        
        # App Title & Subtitle
        title_container = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_container.grid(row=0, column=0, padx=20, pady=10, sticky="w")
        
        app_title = ctk.CTkLabel(
            title_container, 
            text="DAILY AAR JOURNAL", 
            font=ctk.CTkFont(family="Segoe UI", size=20, weight="bold"),
            text_color="#1F6AA5"
        )
        app_title.pack(anchor="w")
        
        # User Badge & Settings Container on the right
        right_container = ctk.CTkFrame(header_frame, fg_color="transparent")
        right_container.grid(row=0, column=2, padx=20, pady=10, sticky="e")
        
        # User Tag Badge
        user_badge = ctk.CTkFrame(right_container, fg_color="#2B2B2B", corner_radius=15, height=30)
        user_badge.pack(side="left", padx=(0, 10))
        
        user_label = ctk.CTkLabel(
            user_badge, 
            text=f"👤 Logged in: {self.username}", 
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            padx=12,
            pady=4
        )
        user_label.pack()
        
        # Settings Button (Gear emoji)
        settings_btn = ctk.CTkButton(
            right_container,
            text="⚙️",
            width=35,
            height=35,
            fg_color="transparent",
            text_color="gray",
            hover_color="#333333",
            font=ctk.CTkFont(size=18),
            command=self.open_settings
        )
        settings_btn.pack(side="left")

    def create_left_form(self):
        """Creates the left panel with input forms for logging AAR."""
        form_container = ctk.CTkFrame(self)
        form_container.grid(row=1, column=0, sticky="nsew", padx=15, pady=(15, 20))
        
        form_container.grid_rowconfigure(0, weight=1)
        form_container.grid_columnconfigure(0, weight=1)
        
        scrollable_form = ctk.CTkScrollableFrame(form_container, fg_color="transparent")
        scrollable_form.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        
        # Title of the Input Form
        form_title = ctk.CTkLabel(
            scrollable_form, 
            text="New Journal Entry", 
            font=ctk.CTkFont(family="Segoe UI", size=18, weight="bold")
        )
        form_title.pack(anchor="w", padx=10, pady=(10, 20))
        
        # Field 1: What went right?
        right_label = ctk.CTkLabel(
            scrollable_form, 
            text="1. What went right today?", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold")
        )
        right_label.pack(anchor="w", padx=10, pady=(0, 5))
        
        self.right_text = ctk.CTkTextbox(
            scrollable_form, 
            height=110, 
            corner_radius=8,
            font=ctk.CTkFont(family="Segoe UI", size=13),
            border_width=1
        )
        self.right_text.pack(fill="x", padx=10, pady=(0, 20))
        
        # Field 2: What went wrong?
        wrong_label = ctk.CTkLabel(
            scrollable_form, 
            text="2. What went wrong / could be improved?", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold")
        )
        wrong_label.pack(anchor="w", padx=10, pady=(0, 5))
        
        self.wrong_text = ctk.CTkTextbox(
            scrollable_form, 
            height=110, 
            corner_radius=8,
            font=ctk.CTkFont(family="Segoe UI", size=13),
            border_width=1
        )
        self.wrong_text.pack(fill="x", padx=10, pady=(0, 20))
        
        # Field 3: What should we do differently?
        next_label = ctk.CTkLabel(
            scrollable_form, 
            text="3. What should we do differently next time?", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold")
        )
        next_label.pack(anchor="w", padx=10, pady=(0, 5))
        
        self.next_text = ctk.CTkTextbox(
            scrollable_form, 
            height=110, 
            corner_radius=8,
            font=ctk.CTkFont(family="Segoe UI", size=13),
            border_width=1
        )
        self.next_text.pack(fill="x", padx=10, pady=(0, 25))
        
        # Submit Button
        self.submit_btn = ctk.CTkButton(
            scrollable_form, 
            text="Save Daily AAR & Ask Coach", 
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            height=45,
            command=self.save_aar
        )
        self.submit_btn.pack(fill="x", padx=10, pady=(0, 10))
        
        # Status Label below form
        self.status_label = ctk.CTkLabel(
            scrollable_form, 
            text="", 
            font=ctk.CTkFont(size=12)
        )
        self.status_label.pack(pady=5)

    def create_right_panels(self):
        """Creates the right-side layout including the AI Coach and Team History."""
        right_container = ctk.CTkFrame(self, fg_color="transparent")
        right_container.grid(row=1, column=1, sticky="nsew", padx=(5, 15), pady=(15, 20))
        
        right_container.grid_rowconfigure(0, weight=3) # Coach Card
        right_container.grid_rowconfigure(1, weight=7) # History
        right_container.grid_columnconfigure(0, weight=1)
        
        # --- 1. AI Coach Panel ---
        self.coach_card = ctk.CTkFrame(right_container, border_color="#1F6AA5", border_width=1)
        self.coach_card.grid(row=0, column=0, sticky="nsew", padx=0, pady=(0, 10))
        self.coach_card.grid_columnconfigure(0, weight=1)
        self.coach_card.grid_rowconfigure(1, weight=1)
        
        coach_header = ctk.CTkLabel(
            self.coach_card, 
            text="🤖 Personalized AI Agile Coach", 
            font=ctk.CTkFont(family="Segoe UI", size=16, weight="bold"),
            text_color="#1F6AA5"
        )
        coach_header.grid(row=0, column=0, sticky="w", padx=20, pady=(15, 5))
        
        # Coach Scrollable Text Frame to handle longer messages gracefully
        coach_text_frame = ctk.CTkScrollableFrame(self.coach_card, fg_color="transparent")
        coach_text_frame.grid(row=1, column=0, sticky="nsew", padx=15, pady=(0, 15))
        
        self.coach_tip_label = ctk.CTkLabel(
            coach_text_frame, 
            text="Welcome! Loading your custom productivity tip...", 
            font=ctk.CTkFont(family="Segoe UI", size=13, slant="italic"),
            justify="left",
            wraplength=480
        )
        self.coach_tip_label.pack(fill="both", expand=True, anchor="nw", padx=10, pady=5)
        
        # --- 2. Team History Viewer Panel ---
        history_frame = ctk.CTkFrame(right_container)
        history_frame.grid(row=1, column=0, sticky="nsew", padx=0, pady=(10, 0))
        
        history_frame.grid_rowconfigure(1, weight=1)
        history_frame.grid_columnconfigure(0, weight=1)
        
        # History Title & Search Bar Layout
        history_top = ctk.CTkFrame(history_frame, fg_color="transparent")
        history_top.grid(row=0, column=0, sticky="ew", padx=15, pady=(15, 10))
        
        history_title = ctk.CTkLabel(
            history_top, 
            text="👥 Team Activity History", 
            font=ctk.CTkFont(family="Segoe UI", size=16, weight="bold")
        )
        history_title.pack(side="left")
        
        # Search Filter Box
        self.search_entry = ctk.CTkEntry(
            history_top, 
            width=200, 
            placeholder_text="Search user or date..."
        )
        self.search_entry.pack(side="right")
        self.search_entry.bind("<KeyRelease>", lambda event: self.filter_history())
        
        # Scrollable Cards View for History
        self.history_scroll = ctk.CTkScrollableFrame(history_frame)
        self.history_scroll.grid(row=1, column=0, sticky="nsew", padx=15, pady=(0, 15))
        
        # Local cache for matching search filter
        self.cached_history = []

    def open_settings(self):
        """Opens the modular configuration settings dialog."""
        SettingsDialog(self, self.on_settings_saved)
        
    def on_settings_saved(self):
        """Callback for when settings are saved."""
        self.show_status("Settings saved successfully!", color="green")
        # Re-fetch history in case DB path changed
        self.refresh_history()
        # Re-fetch coach tip in case API key changed
        self.load_coach_tip()

    def show_status(self, text, color="white"):
        """Displays temporary status in the left column."""
        self.status_label.configure(text=text, text_color=color)
        # Clear status after 4 seconds
        self.after(4000, lambda: self.status_label.configure(text=""))

    def save_aar(self):
        """Saves form entries to the SQLite database and triggers async AI coaching."""
        went_right = self.right_text.get("1.0", "end-1c").strip()
        went_wrong = self.wrong_text.get("1.0", "end-1c").strip()
        next_steps = self.next_text.get("1.0", "end-1c").strip()
        
        # Validation
        if not went_right or not went_wrong or not next_steps:
            self.show_status("⚠️ Please answer all three prompt questions first.", color="#E06C75")
            return
            
        # Log to Database
        success = database.add_aar_entry(self.username, went_right, went_wrong, next_steps)
        
        if success:
            self.show_status("✅ Journal logged successfully!", color="#98C379")
            
            # Clear text fields
            self.right_text.delete("1.0", "end")
            self.wrong_text.delete("1.0", "end")
            self.next_text.delete("1.0", "end")
            
            # Instantly update history list
            self.refresh_history()
            
            # Launch async AI Coach request
            self.load_coach_tip()
        else:
            self.show_status("❌ Database Error. Unable to save your journal entry.", color="#E06C75")

    def animate_loading(self):
        """Updates the thinking text recursively to simulate a loading spinner."""
        if not self.coach_loading:
            return
            
        dots = "." * (self.loading_dots % 4)
        self.coach_tip_label.configure(
            text=f"🤖 Agile Coach is analyzing your recent patterns{dots}",
            font=ctk.CTkFont(family="Segoe UI", size=13, slant="italic")
        )
        self.loading_dots += 1
        self.loading_animation_id = self.after(300, self.animate_loading)

    def load_coach_tip(self):
        """Prepares UI and initiates background thread to call Gemini API."""
        if self.coach_loading:
            return # Don't double call
            
        self.coach_loading = True
        self.animate_loading()
        
        # Thread out the slow network call so that the UI stays perfectly interactive
        thread = threading.Thread(target=self._async_fetch_tip, daemon=True)
        thread.start()

    def _async_fetch_tip(self):
        """Target run in worker thread to request Gemini API."""
        try:
            tip = ai_coach.get_productivity_tip(self.username)
        except Exception as e:
            tip = f"⚠️ Unexpected coaching system error: {str(e)}"
            
        # Return result safely to main UI thread
        self.after(0, self._display_coach_tip, tip)

    def _display_coach_tip(self, tip_text):
        """Safe UI-update callback from worker thread."""
        self.coach_loading = False
        if self.loading_animation_id:
            self.after_cancel(self.loading_animation_id)
            self.loading_animation_id = None
            
        # Update text box with tip
        self.coach_tip_label.configure(
            text=tip_text,
            font=ctk.CTkFont(family="Segoe UI", size=13, slant="normal" if not tip_text.startswith("⚠️") else "italic")
        )

    def refresh_history(self):
        """Refreshes cached logs from database and renders them."""
        try:
            self.cached_history = database.get_all_entries()
            self.filter_history() # Draws filtered results (currently all since search box starts empty)
        except Exception as e:
            # Clear historical list in case database is blocked
            for widget in self.history_scroll.winfo_children():
                widget.destroy()
            err_lbl = ctk.CTkLabel(self.history_scroll, text=f"Unable to read DB history: {e}", text_color="red")
            err_lbl.pack(pady=20)

    def filter_history(self):
        """Filters cached history logs and draws them inside scroll view."""
        search_query = self.search_entry.get().strip().lower()
        
        # Clear existing card widgets
        for widget in self.history_scroll.winfo_children():
            widget.destroy()
            
        matching_count = 0
        
        for item in self.cached_history:
            db_user, date_str, time_str, went_right, went_wrong, next_steps = item
            
            # Perform search matching
            if search_query:
                # Matches if query is inside user or date
                if search_query not in db_user.lower() and search_query not in date_str.lower():
                    continue
                    
            matching_count += 1
            
            # Render a premium, modern card frame for each entry
            card = ctk.CTkFrame(self.history_scroll, border_color="#3E3E3E", border_width=1)
            card.pack(fill="x", padx=5, pady=8)
            card.grid_columnconfigure(0, weight=1)
            
            # Card Header (User Badge + Timestamp)
            card_hdr = ctk.CTkFrame(card, fg_color="transparent")
            card_hdr.pack(fill="x", padx=12, pady=(10, 8))
            
            user_lbl = ctk.CTkLabel(
                card_hdr, 
                text=f"👤 {db_user}", 
                font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
                text_color="#1F6AA5"
            )
            user_lbl.pack(side="left")
            
            # Format date beautifully (e.g. May 25, 2026 at 11:15 AM)
            dt_str = f"{date_str} {time_str}"
            try:
                dt_obj = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                formatted_time = dt_obj.strftime("%b %d, %Y - %I:%M %p")
            except Exception:
                formatted_time = f"{date_str} {time_str}"
                
            time_lbl = ctk.CTkLabel(
                card_hdr, 
                text=formatted_time, 
                font=ctk.CTkFont(family="Segoe UI", size=11),
                text_color="gray"
            )
            time_lbl.pack(side="right")
            
            # Content Body containing answers
            content_box = ctk.CTkFrame(card, fg_color="transparent")
            content_box.pack(fill="x", padx=12, pady=(0, 10))
            
            # Section: Went Right
            sr_title = ctk.CTkLabel(
                content_box, 
                text="What went right:", 
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color="#98C379"
            )
            sr_title.pack(anchor="w", pady=(0, 2))
            
            sr_val = ctk.CTkLabel(
                content_box, 
                text=went_right, 
                font=ctk.CTkFont(family="Segoe UI", size=12),
                justify="left",
                wraplength=480
            )
            sr_val.pack(anchor="w", padx=(10, 0), pady=(0, 8))
            
            # Section: Went Wrong
            sw_title = ctk.CTkLabel(
                content_box, 
                text="What went wrong:", 
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color="#E06C75"
            )
            sw_title.pack(anchor="w", pady=(0, 2))
            
            sw_val = ctk.CTkLabel(
                content_box, 
                text=went_wrong, 
                font=ctk.CTkFont(family="Segoe UI", size=12),
                justify="left",
                wraplength=480
            )
            sw_val.pack(anchor="w", padx=(10, 0), pady=(0, 8))
            
            # Section: Next Steps
            sn_title = ctk.CTkLabel(
                content_box, 
                text="What should we do differently:", 
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color="#D19A66"
            )
            sn_title.pack(anchor="w", pady=(0, 2))
            
            sn_val = ctk.CTkLabel(
                content_box, 
                text=next_steps, 
                font=ctk.CTkFont(family="Segoe UI", size=12),
                justify="left",
                wraplength=480
            )
            sn_val.pack(anchor="w", padx=(10, 0), pady=(0, 2))

        # Handle empty states
        if matching_count == 0:
            empty_lbl = ctk.CTkLabel(
                self.history_scroll, 
                text="No matching logs found." if search_query else "No journal logs yet. Write the first entry on the left!",
                font=ctk.CTkFont(family="Segoe UI", size=13, slant="italic"),
                text_color="gray"
            )
            empty_lbl.pack(pady=40)


if __name__ == "__main__":
    app = DailyAARApp()
    app.mainloop()
