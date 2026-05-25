import { GoogleGenAI } from "https://esm.sh/@google/genai";

// ==========================================
// ========== 1. GLOBAL STATE & CONFIG ======
// ==========================================

let state = {
    username: "Kyle",
    gemini_api_key: "",
    supabase_url: "",
    supabase_key: "",
    journals: [],
    tasks: [],
    blips: [],
    aars: [],
    categories: [
        { id: "1", name: "Work", active: true },
        { id: "2", name: "Personal", active: false },
        { id: "3", name: "Ideas", active: false }
    ],
    selectedCategory: "Work",
    historyTab: "JOURNAL",
    taskFilterTab: "ALL",
    hideCompletedTasks: false,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    selectedFilterDate: null,
    vibeTab: "DAILY",
    weeklyReport: null,
    isQuickRecording: false,
    quickTranscript: "",
    quickTaskCategory: "Work"
};

let supabaseClient = null;
let speechRecognition = null;
let isRecording = false;
let voiceBaseText = "";
let lastProcessedIndex = -1;

// Default items if completely empty to show a beautiful layout instantly
const DEFAULT_TASKS = [
    { id: "t1", name: "Complete personal reflection journal", category: "Personal", completed: true, timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
    { id: "t2", name: "Review team After Action Review (AAR)", category: "Work", completed: false, timestamp: new Date().toISOString() },
    { id: "t3", name: "Explore voice dictation logging on mobile", category: "Ideas", completed: false, timestamp: new Date().toISOString() }
];

const DEFAULT_AARS = [
    {
        id: "a1",
        username: "Kyle",
        went_right: "Successfully solved the Windows Tkinter layout crash issue.",
        went_wrong: "Spent slightly too much time debugging powershell nested string quotes.",
        next_steps: "Directly use native file-editing tools and robust CDN templates for faster flows.",
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString()
    }
];

// ==========================================
// ========== 2. CONFIGURATION & LIFECYCLE ==
// ==========================================

function loadSettings() {
    try {
        const storedSettings = localStorage.getItem("daily_vibe_settings");
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            state.username = parsed.username || "Kyle";
            state.gemini_api_key = parsed.gemini_api_key || "";
            state.supabase_url = parsed.supabase_url || "";
            state.supabase_key = parsed.supabase_key || "";
        }
        
        // Load data cache
        state.journals = JSON.parse(localStorage.getItem("vibe_journals")) || [];
        state.tasks = JSON.parse(localStorage.getItem("vibe_tasks")) || DEFAULT_TASKS;
        state.blips = JSON.parse(localStorage.getItem("vibe_blips")) || [];
        state.aars = JSON.parse(localStorage.getItem("vibe_aars")) || DEFAULT_AARS;
        state.hideCompletedTasks = JSON.parse(localStorage.getItem("vibe_hide_completed")) || false;
        
        // Save back if was empty
        if (!localStorage.getItem("vibe_tasks")) saveLocalCache("tasks");
        if (!localStorage.getItem("vibe_aars")) saveLocalCache("aars");
    } catch (e) {
        console.error("Error loading settings/cache from localStorage", e);
    }
}

function saveLocalSettings() {
    const settings = {
        username: state.username,
        gemini_api_key: state.gemini_api_key,
        supabase_url: state.supabase_url,
        supabase_key: state.supabase_key
    };
    localStorage.setItem("daily_vibe_settings", JSON.stringify(settings));
    initializeSupabase();
    updateUIElements();
}

function saveLocalCache(type) {
    if (type === "journals") localStorage.setItem("vibe_journals", JSON.stringify(state.journals));
    if (type === "tasks") localStorage.setItem("vibe_tasks", JSON.stringify(state.tasks));
    if (type === "blips") localStorage.setItem("vibe_blips", JSON.stringify(state.blips));
    if (type === "aars") localStorage.setItem("vibe_aars", JSON.stringify(state.aars));
    updateSyncDashboardMetrics();
    updateFlowStreakPanel(); // Update streak panels dynamically!
}

// Initialise Supabase Client if configured
function initializeSupabase() {
    if (state.supabase_url && state.supabase_key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(state.supabase_url, state.supabase_key);
            document.getElementById("footer-sync-status").innerText = "Vault Status: Cloud Connected";
            document.getElementById("footer-sync-status").classList.add("text-emerald-400");
            document.getElementById("footer-sync-light").className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
            document.getElementById("sync-supa-status-text").innerText = "Cloud Connection: Configured & Synchronized";
            document.getElementById("sync-supa-status-text").className = "text-xs text-emerald-400 font-semibold";
        } catch (e) {
            console.error("Supabase config error", e);
            supabaseClient = null;
            setOfflineFooterState();
        }
    } else {
        supabaseClient = null;
        setOfflineFooterState();
    }
}

function setOfflineFooterState() {
    document.getElementById("footer-sync-status").innerText = "Vault Status: Offline Mode";
    document.getElementById("footer-sync-status").classList.remove("text-emerald-400");
    document.getElementById("footer-sync-light").className = "w-2 h-2 rounded-full bg-blue-400 animate-pulse";
    document.getElementById("sync-supa-status-text").innerText = "Cloud Connection: Not Configured (Using Local Storage)";
    document.getElementById("sync-supa-status-text").className = "text-xs text-cozy-700/50 font-light";
}

// Push to Supabase asynchronously
async function pushToCloud(table, payload) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(table).insert([payload]);
        if (error) throw error;
        
        // Show success visual in footer
        const syncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById("footer-sync-time").innerText = `Last Cloud Sync: ${syncTime}`;
    } catch (e) {
        console.warn(`Sync failed for table ${table}:`, e.message || e);
    }
}

// ==========================================
// ========== 3. VIEW ROUTER & NAVIGATION ===
// ==========================================

window.navigate = function(viewName) {
    // Hide voice equalizer if currently recording
    if (isRecording && speechRecognition) {
        speechRecognition.stop();
    }
    
    // Smooth transition between screens
    const allViews = document.querySelectorAll(".page-view");
    allViews.forEach(view => {
        view.classList.remove("active");
    });
    
    let targetId = "view-home";
    let showHomeBtn = true;
    
    if (viewName === "HOME") {
        targetId = "view-home";
        showHomeBtn = false;
    } else if (viewName === "JOURNAL") {
        targetId = "view-journal";
        startJournalClock();
        // Load user preferred paper style and update live metrics
        const preferredStyle = localStorage.getItem("vibe_paper_style") || "LINED";
        window.setPaperStyle(preferredStyle);
        window.updateJournalMetrics();
    } else if (viewName === "TASK") {
        targetId = "view-task";
        renderTaskCategorySelectors();
    } else if (viewName === "BLIP") {
        targetId = "view-blip";
        document.getElementById("blip-input").focus();
    } else if (viewName === "AAR") {
        targetId = "view-aar";
        renderAARGrid();
    } else if (viewName === "REVIEW") {
        targetId = "view-review";
        toggleVibeTab("DAILY"); // Reset to daily on opening review page
    } else if (viewName === "TASK_LIST") {
        targetId = "view-task-list";
        renderTaskChecklist();
    } else if (viewName === "CATEGORY_EXPLORER") {
        targetId = "view-category-explorer";
        renderInteractiveCalendar(); // Dynamic neomorphic calendar render
        renderHistoryFeed();
    }
    
    const targetView = document.getElementById(targetId);
    if (targetView) {
        targetView.classList.add("active");
    }
    
    const homeBtn = document.getElementById("btn-header-home");
    if (homeBtn) {
        if (showHomeBtn) {
            homeBtn.classList.remove("hidden");
        } else {
            homeBtn.classList.add("hidden");
        }
    }
    
    window.scrollTo({ top: 0, behavior: "smooth" });
};

// ==========================================
// ========== 4. DIALOG MODAL CONTROLLERS ===
// ==========================================

window.toggleModal = function(modalId, show) {
    const modal = document.getElementById(modalId);
    if (modal) {
        if (show) {
            modal.classList.remove("hidden");
            if (modalId === "modal-settings") {
                // Populate current settings values
                document.getElementById("settings-user-input").value = state.username;
                document.getElementById("settings-gemini-input").value = state.gemini_api_key;
                document.getElementById("settings-supa-url").value = state.supabase_url;
                document.getElementById("settings-supa-key").value = state.supabase_key;
            } else if (modalId === "modal-sync") {
                updateSyncDashboardMetrics();
            }
        } else {
            modal.classList.add("hidden");
        }
    }
};

window.toggleInputMask = function(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        if (input.type === "password") {
            input.type = "text";
        } else {
            input.type = "password";
        }
    }
};

window.showToast = function(message) {
    let container = document.getElementById("cozy-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "cozy-toast-container";
        container.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col space-y-2 pointer-events-none w-full max-w-xs px-4";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = "bg-white border border-cozy-500/25 text-cozy-700 text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2.5 transition-all duration-300 translate-y-[-12px] opacity-0 pointer-events-auto select-none bg-cozy-50/95 backdrop-blur-md";
    
    let icon = "✨";
    if (message.includes("Journal") || message.includes("journal")) icon = "📝";
    else if (message.includes("Blip") || message.includes("Thought") || message.includes("thought")) icon = "⚡";
    else if (message.includes("Task") || message.includes("task")) icon = "🚀";
    else if (message.includes("settings") || message.includes("Settings") || message.includes("keys")) icon = "⚙️";
    else if (message.includes("AAR")) icon = "👥";
    else if (message.includes("Backup") || message.includes("backup") || message.includes("Export") || message.includes("export")) icon = "💾";
    else if (message.includes("Warning") || message.includes("configure") || message.includes("Please") || message.includes("API Key") || message.includes("unable") || message.includes("Unable")) icon = "⚠️";
    
    toast.innerHTML = `<span class="text-sm">${icon}</span> <span class="leading-normal">${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove("translate-y-[-12px]", "opacity-0");
    }, 20);
    
    setTimeout(() => {
        toast.classList.add("translate-y-[-12px]", "opacity-0");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2800);
};

// ==========================================
// ========== 5. FLOW STREAK & CALENDAR CORES 
// ==========================================

// ==========================================
// ========== 5. FLOW STREAK & CALENDAR CORES 
// ==========================================

let quickSpeechRecognition = null;

function setupQuickDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition API not supported for Quick Dictate.");
        const btn = document.getElementById("btn-quick-mic");
        if (btn) btn.classList.add("hidden");
        return;
    }
    
    quickSpeechRecognition = new SpeechRecognition();
    quickSpeechRecognition.continuous = true;
    quickSpeechRecognition.interimResults = true;
    quickSpeechRecognition.lang = 'en-US';
    
    const transcriptArea = document.getElementById("quick-transcript-area");
    const waveContainer = document.getElementById("quick-wave-container");
    const toggleBtn = document.getElementById("btn-toggle-quick-record");
    
    quickSpeechRecognition.onstart = () => {
        state.isQuickRecording = true;
        state.quickTranscript = "";
        if (transcriptArea) transcriptArea.value = "";
        
        const filingActions = document.getElementById("quick-filing-actions");
        const taskOptions = document.getElementById("quick-task-options");
        if (filingActions) filingActions.classList.add("hidden");
        if (taskOptions) taskOptions.classList.add("hidden");
        
        if (toggleBtn) {
            toggleBtn.className = "w-full py-3 bg-[#E07A5F] hover:bg-[#E07A5F]/90 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center space-x-2";
            toggleBtn.innerHTML = "<span class='animate-pulse'>🛑</span> <span>Stop Recording & File</span>";
        }
        
        if (waveContainer) waveContainer.classList.remove("hidden");
    };
    
    quickSpeechRecognition.onend = () => {
        state.isQuickRecording = false;
        
        const filingActions = document.getElementById("quick-filing-actions");
        if (filingActions) filingActions.classList.remove("hidden");
        
        if (toggleBtn) {
            toggleBtn.className = "w-full py-3 bg-cozy-500 hover:bg-cozy-500/90 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center space-x-2";
            toggleBtn.innerHTML = "<span>🎙️</span> <span>Redictate Thought</span>";
        }
        
        if (waveContainer) waveContainer.classList.add("hidden");
    };
    
    quickSpeechRecognition.onerror = (event) => {
        console.error("Quick speech recognition error:", event.error);
        quickSpeechRecognition.stop();
    };
    
    quickSpeechRecognition.onresult = (event) => {
        let finalConcat = '';
        let interimConcat = '';
        let lastSegment = '';
        
        for (let i = 0; i < event.results.length; ++i) {
            const result = event.results[i];
            if (result.isFinal) {
                let currentSegment = result[0].transcript.trim();
                // Deduplicate Android cumulative speech segments
                if (lastSegment && currentSegment.startsWith(lastSegment) && currentSegment.length > lastSegment.length) {
                    finalConcat = currentSegment + " ";
                } else {
                    finalConcat += currentSegment + " ";
                }
                lastSegment = currentSegment;
            } else {
                interimConcat += result[0].transcript;
            }
        }
        
        if (transcriptArea) {
            transcriptArea.value = finalConcat + interimConcat;
            transcriptArea.scrollTop = transcriptArea.scrollHeight;
        }
    };
}

window.toggleQuickDrawer = function(show) {
    const drawer = document.getElementById("quick-dictate-drawer");
    const overlay = document.getElementById("quick-drawer-overlay");
    
    if (!drawer || !overlay) return;
    
    if (show) {
        drawer.classList.add("active");
        overlay.classList.add("active");
        
        // Auto-start listening on slide-up
        setTimeout(() => {
            if (quickSpeechRecognition && !state.isQuickRecording) {
                quickSpeechRecognition.start();
            }
        }, 300);
    } else {
        drawer.classList.remove("active");
        overlay.classList.remove("active");
        
        if (quickSpeechRecognition && state.isQuickRecording) {
            quickSpeechRecognition.stop();
        }
    }
};

window.toggleQuickRecordState = function() {
    if (!quickSpeechRecognition) return;
    
    if (state.isQuickRecording) {
        quickSpeechRecognition.stop();
    } else {
        quickSpeechRecognition.start();
    }
};

window.setQuickTaskCategory = function(category) {
    state.quickTaskCategory = category;
    
    const workBtn = document.getElementById("btn-quick-task-work");
    const personalBtn = document.getElementById("btn-quick-task-personal");
    const ideasBtn = document.getElementById("btn-quick-task-ideas");
    
    if (!workBtn || !personalBtn || !ideasBtn) return;
    
    const activeStyle = "flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border bg-cozy-500 text-white border-cozy-500 shadow-sm transition-all select-none";
    const inactiveStyle = "flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border bg-white text-cozy-700/80 border-cozy-500/10 hover:bg-cozy-100 transition-all select-none";
    
    workBtn.className = category === "Work" ? activeStyle : inactiveStyle;
    personalBtn.className = category === "Personal" ? activeStyle : inactiveStyle;
    ideasBtn.className = category === "Ideas" ? activeStyle : inactiveStyle;
};

window.routeQuickDictate = async function(type) {
    const transcriptArea = document.getElementById("quick-transcript-area");
    if (!transcriptArea) return;
    
    const text = transcriptArea.value.trim();
    if (!text) {
        window.showToast("Please dictate some text before filing.");
        return;
    }
    
    if (type === "JOURNAL") {
        const newEntry = {
            id: "j-" + Date.now(),
            username: state.username,
            content: text,
            timestamp: new Date().toISOString()
        };
        state.journals.unshift(newEntry);
        saveLocalCache("journals");
        pushToCloud("journals", newEntry);
        window.showToast("Journal logged successfully!");
        window.toggleQuickDrawer(false);
        
    } else if (type === "BLIP") {
        const newBlip = {
            id: "b-" + Date.now(),
            username: state.username,
            content: text,
            timestamp: new Date().toISOString()
        };
        state.blips.unshift(newBlip);
        saveLocalCache("blips");
        pushToCloud("blips", newBlip);
        window.showToast("Blip captured instantly!");
        window.toggleQuickDrawer(false);
        
    } else if (type === "TASK") {
        const newTask = {
            id: "t-" + Date.now(),
            name: text,
            category: state.quickTaskCategory,
            completed: false,
            timestamp: new Date().toISOString()
        };
        state.tasks.unshift(newTask);
        saveLocalCache("tasks");
        localStorage.removeItem("vibe_task_coach_tip"); // Clear cached execution strategy
        pushToCloud("tasks", newTask);
        window.showToast("Task action item filed successfully!");
        window.toggleQuickDrawer(false);
    }
};

function getLocalDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getAllActiveDates() {
    const dates = new Set();
    const addDate = (isoString) => {
        if (!isoString) return;
        try {
            const dt = new Date(isoString);
            dates.add(getLocalDateString(dt));
        } catch (e) {}
    };
    
    state.journals.forEach(j => addDate(j.timestamp));
    state.tasks.forEach(t => addDate(t.timestamp));
    state.blips.forEach(b => addDate(b.timestamp));
    state.aars.forEach(a => addDate(a.timestamp));
    
    return dates;
}

function calculateVibeStreak() {
    const activeDates = getAllActiveDates();
    const todayStr = getLocalDateString(new Date());
    const yesterdayStr = getLocalDateString(new Date(Date.now() - 86400000));
    
    // If no logs today and no logs yesterday, streak is 0
    if (!activeDates.has(todayStr) && !activeDates.has(yesterdayStr)) {
        return 0;
    }
    
    let streak = 0;
    let checkDate = activeDates.has(todayStr) ? new Date() : new Date(Date.now() - 86400000);
    
    while (true) {
        const checkStr = getLocalDateString(checkDate);
        if (activeDates.has(checkStr)) {
            streak++;
            // Move back 1 day safely
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    return streak;
}

function updateFlowStreakPanel() {
    const streakCount = calculateVibeStreak();
    const activeDates = getAllActiveDates();
    
    const countEl = document.getElementById("home-streak-count");
    const messageEl = document.getElementById("home-streak-message");
    
    if (countEl) {
        countEl.innerText = `${streakCount}-Day Vibe Streak`;
    }
    
    if (messageEl) {
        if (streakCount === 0) {
            messageEl.innerText = "Begin your reflection flow today!";
        } else if (streakCount < 3) {
            messageEl.innerText = "A beautiful start. Keep flowing!";
        } else if (streakCount < 7) {
            messageEl.innerText = "Building amazing cognitive momentum!";
        } else {
            messageEl.innerText = "Absolute mastery of daily flow. Incredible!";
        }
    }
    
    // Draw timeline dots
    const timelineContainer = document.getElementById("home-timeline-dots");
    if (timelineContainer) {
        timelineContainer.innerHTML = "";
        
        for (let i = 6; i >= 0; i--) {
            const dt = new Date(Date.now() - i * 86400000);
            const dtStr = getLocalDateString(dt);
            const isActive = activeDates.has(dtStr);
            
            const dot = document.createElement("div");
            dot.className = `timeline-dot ${isActive ? 'active' : 'inactive'}`;
            
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const weekday = dayNames[dt.getDay()];
            dot.title = `${weekday} (${dt.toLocaleDateString()}) - ${isActive ? 'Logged' : 'No entries'}`;
            
            timelineContainer.appendChild(dot);
        }
    }
}

function renderInteractiveCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const activeDates = getAllActiveDates();
    
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    
    const monthYearEl = document.getElementById("calendar-month-year");
    if (monthYearEl) {
        monthYearEl.innerText = `${monthNames[month]} ${year}`;
    }
    
    const daysContainer = document.getElementById("calendar-days-scroll");
    if (!daysContainer) return;
    daysContainer.innerHTML = "";
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // 1. Draw empty padding day squares
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-day empty";
        daysContainer.appendChild(emptyCell);
    }
    
    // 2. Draw actual days of the month
    const todayStr = getLocalDateString(new Date());
    
    for (let day = 1; day <= totalDays; day++) {
        const dayCell = document.createElement("div");
        dayCell.className = "calendar-day";
        
        const mmStr = String(month + 1).padStart(2, '0');
        const ddStr = String(day).padStart(2, '0');
        const currentDayStr = `${year}-${mmStr}-${ddStr}`;
        
        dayCell.innerText = day;
        
        if (currentDayStr === todayStr) {
            dayCell.classList.add("today");
        }
        
        if (state.selectedFilterDate === currentDayStr) {
            dayCell.classList.add("selected");
        }
        
        if (activeDates.has(currentDayStr)) {
            const dot = document.createElement("div");
            dot.className = "calendar-dot";
            dayCell.appendChild(dot);
        }
        
        dayCell.onclick = () => {
            if (state.selectedFilterDate === currentDayStr) {
                clearCalendarFilter();
            } else {
                state.selectedFilterDate = currentDayStr;
                
                const banner = document.getElementById("calendar-filter-status");
                const label = document.getElementById("calendar-filter-date");
                if (banner && label) {
                    banner.classList.remove("hidden");
                    const dt = new Date(year, month, day);
                    label.innerText = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                }
                
                renderInteractiveCalendar();
                renderHistoryFeed();
            }
        };
        
        daysContainer.appendChild(dayCell);
    }
}

function clearCalendarFilter() {
    state.selectedFilterDate = null;
    const banner = document.getElementById("calendar-filter-status");
    if (banner) {
        banner.classList.add("hidden");
    }
    renderInteractiveCalendar();
    renderHistoryFeed();
}

function startJournalClock() {
    const clock = document.getElementById("journal-clock");
    const updateTime = () => {
        const now = new Date();
        clock.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " | " + now.toLocaleDateString();
    };
    updateTime();
    // Refresh interval
    const timer = setInterval(() => {
        if (!document.getElementById("view-journal").classList.contains("active")) {
            clearInterval(timer);
            return;
        }
        updateTime();
    }, 1000);
}

// ==========================================
// ========== 5. VOICE TRANSCRIBER LAYER ====
// ==========================================

function setupVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition API is not supported in this browser.");
        document.getElementById("btn-journal-mic").classList.add("opacity-40");
        return;
    }
    
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';
    
    const journalInput = document.getElementById("journal-input");
    const waveContainer = document.getElementById("voice-status-container");
    
    speechRecognition.onstart = () => {
        isRecording = true;
        voiceBaseText = journalInput.value.trim();
        if (voiceBaseText) voiceBaseText += "\n\n"; // Cozy paragraph break
        document.getElementById("btn-journal-mic").classList.add("border-red-500", "bg-red-950/40");
        document.getElementById("btn-journal-mic").innerHTML = "<span class='text-xl animate-pulse'>🛑</span>";
        waveContainer.classList.remove("hidden");
    };
    
    speechRecognition.onend = () => {
        isRecording = false;
        voiceBaseText = journalInput.value.trim();
        document.getElementById("btn-journal-mic").classList.remove("border-red-500", "bg-red-950/40");
        document.getElementById("btn-journal-mic").innerHTML = "<span class='text-xl'>🎙️</span>";
        waveContainer.classList.add("hidden");
    };
    
    speechRecognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        speechRecognition.stop();
    };
    
    speechRecognition.onresult = (event) => {
        let finalConcat = '';
        let interimConcat = '';
        let lastSegment = '';
        
        for (let i = 0; i < event.results.length; ++i) {
            const result = event.results[i];
            if (result.isFinal) {
                let currentSegment = result[0].transcript.trim();
                // Deduplicate Android cumulative speech segments
                if (lastSegment && currentSegment.startsWith(lastSegment) && currentSegment.length > lastSegment.length) {
                    finalConcat = currentSegment + " ";
                } else {
                    finalConcat += currentSegment + " ";
                }
                lastSegment = currentSegment;
            } else {
                interimConcat += result[0].transcript;
            }
        }
        
        journalInput.value = voiceBaseText + finalConcat + interimConcat;
        journalInput.scrollTop = journalInput.scrollHeight;
    };
}

function toggleVoiceRecording() {
    if (!speechRecognition) {
        window.showToast("Local Web Speech is not fully supported in this browser. Please use Chrome, Edge, or Safari Mobile.");
        return;
    }
    
    if (isRecording) {
        speechRecognition.stop();
    } else {
        speechRecognition.start();
    }
}

// ==========================================
// ========== 6. JOURNAL CORE LAYER =========
// ==========================================

window.setPaperStyle = function(style) {
    const textarea = document.getElementById("journal-input");
    if (!textarea) return;
    
    // Clear all style classes
    textarea.classList.remove("paper-lined", "paper-grid", "paper-linen");
    
    // Reset all swatch buttons
    document.querySelectorAll(".paper-swatch").forEach(btn => {
        btn.classList.remove("bg-cozy-500", "text-white", "border-cozy-500", "shadow-sm");
        btn.classList.add("bg-white", "text-cozy-700", "border-cozy-500/15");
    });
    
    let activeBtnId = "";
    if (style === "LINED") {
        textarea.classList.add("paper-lined");
        activeBtnId = "btn-paper-lined";
    } else if (style === "GRID") {
        textarea.classList.add("paper-grid");
        activeBtnId = "btn-paper-grid";
    } else if (style === "LINEN") {
        textarea.classList.add("paper-linen");
        activeBtnId = "btn-paper-linen";
    }
    
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        activeBtn.classList.remove("bg-white", "text-cozy-700", "border-cozy-500/15");
        activeBtn.classList.add("bg-cozy-500", "text-white", "border-cozy-500", "shadow-sm");
    }
    
    localStorage.setItem("vibe_paper_style", style);
};

window.insertFormatting = function(prefix, suffix = "") {
    const textarea = document.getElementById("journal-input");
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    const selectedText = text.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    
    // Retain editor focus and highlight the inserted region
    textarea.focus();
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selectedText.length;
    
    window.updateJournalMetrics();
};

window.updateJournalMetrics = function() {
    const textarea = document.getElementById("journal-input");
    const wordCountEl = document.getElementById("journal-word-count");
    const charCountEl = document.getElementById("journal-char-count");
    const readTimeEl = document.getElementById("journal-read-time");
    
    if (!textarea) return;
    
    const text = textarea.value;
    const chars = text.length;
    
    // Clean word count extraction
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    
    // Calculate cozy reading time (approx 200 words per minute)
    const readMinutes = Math.ceil(words / 200);
    
    if (wordCountEl) wordCountEl.innerText = `✍️ ${words} words`;
    if (charCountEl) charCountEl.innerText = `🔤 ${chars} chars`;
    if (readTimeEl) {
        readTimeEl.innerText = `⏱️ ${readMinutes} min read`;
    }
};

function handleSaveJournal() {
    const input = document.getElementById("journal-input");
    const content = input.value.trim();
    
    if (!content) {
        window.showToast("Please write down a journal entry first.");
        return;
    }
    
    const newEntry = {
        id: "j-" + Date.now(),
        username: state.username,
        content: content,
        timestamp: new Date().toISOString()
    };
    
    // Save to State & Cache
    state.journals.unshift(newEntry);
    saveLocalCache("journals");
    
    // Clear Input
    input.value = "";
    
    // Trigger optimistic success notice
    window.showToast("Journal logged successfully in local cache!");
    
    // Asynchronously push to cloud Supabase
    pushToCloud("journals", newEntry);
    
    // Return back Home
    window.navigate("HOME");
}

// ==========================================
// ========== 7. TASKS CONFIGURATION LAYER ==
// ==========================================

function renderTaskCategorySelectors() {
    const container = document.getElementById("task-categories-container");
    container.innerHTML = "";
    
    state.categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.innerText = cat.name;
        
        // Setup styling classes
        if (state.selectedCategory === cat.name) {
            btn.className = "px-4 py-2 text-xs font-semibold rounded-xl bg-cozy-500 text-white border border-cozy-500 shadow-sm transition-all";
        } else {
            btn.className = "px-4 py-2 text-xs font-medium rounded-xl bg-white text-cozy-700/80 border border-cozy-500/10 hover:bg-cozy-100 transition-all";
        }
        
        btn.onclick = () => {
            state.selectedCategory = cat.name;
            renderTaskCategorySelectors();
        };
        container.appendChild(btn);
    });
}

function handleSaveTask() {
    const input = document.getElementById("task-input");
    const dueInput = document.getElementById("task-due-input");
    const taskName = input.value.trim();
    const dueDate = dueInput.value ? dueInput.value : null;
    
    if (!taskName) {
        window.showToast("Please type a task action description.");
        return;
    }
    
    const newTask = {
        id: "t-" + Date.now(),
        name: taskName,
        category: state.selectedCategory,
        completed: false,
        due_date: dueDate,
        timestamp: new Date().toISOString()
    };
    
    // Add to state and save
    state.tasks.unshift(newTask);
    saveLocalCache("tasks");
    localStorage.removeItem("vibe_task_coach_tip"); // Clear cached execution strategy
    
    // Reset fields
    input.value = "";
    dueInput.value = "";
    
    window.showToast("Task added successfully!");
    
    // Push to Supabase
    pushToCloud("tasks", newTask);
    
    window.navigate("HOME");
}

window.toggleTaskComplete = function(taskId) {
    // Instant Optimistic Updates
    state.tasks = state.tasks.map(t => {
        if (t.id === taskId) {
            const updatedTask = { ...t, completed: !t.completed };
            
            // Push update asynchronously to Supabase
            if (supabaseClient) {
                supabaseClient.from("tasks").update({ completed: updatedTask.completed }).eq("id", taskId)
                    .then(({ error }) => {
                        if (error) console.error("Cloud task update error:", error);
                    });
            }
            return updatedTask;
        }
        return t;
    });
    
    saveLocalCache("tasks");
    localStorage.removeItem("vibe_task_coach_tip"); // Clear cached execution strategy
    
    // Re-draw current list
    renderTaskChecklist();
};

window.filterTasksTab = function(tabName) {
    state.taskFilterTab = tabName;
    
    // Update active tab styles
    const tabs = ["ALL", "Work", "Personal", "Ideas"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-task-${t.toLowerCase()}`);
        if (btn) {
            if (tabName === t) {
                btn.className = "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all";
            } else {
                btn.className = "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all";
            }
        }
    });
    
    renderTaskChecklist();
};

function renderTaskChecklist() {
    const container = document.getElementById("task-checklist-scroll");
    container.innerHTML = "";
    
    // Sync toggle check status
    const toggleBtn = document.getElementById("chk-hide-completed");
    if (toggleBtn) {
        toggleBtn.checked = state.hideCompletedTasks;
    }
    
    // Update tab bar navigation in header dynamically if needed
    const tabsContainer = document.getElementById("task-list-tabs");
    tabsContainer.innerHTML = "";
    
    // Always render All
    const allBtn = document.createElement("button");
    allBtn.id = "tab-task-all";
    allBtn.onclick = () => filterTasksTab("ALL");
    allBtn.innerText = "All";
    allBtn.className = state.taskFilterTab === "ALL" 
        ? "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all" 
        : "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all";
    tabsContainer.appendChild(allBtn);
    
    // Dynamic categories tabs
    state.categories.forEach(cat => {
        const tabBtn = document.createElement("button");
        tabBtn.id = `tab-task-${cat.name.toLowerCase()}`;
        tabBtn.onclick = () => filterTasksTab(cat.name);
        tabBtn.innerText = cat.name;
        tabBtn.className = state.taskFilterTab === cat.name 
            ? "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all" 
            : "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all";
        tabsContainer.appendChild(tabBtn);
    });
    
    // Filter tasks
    const filteredTasks = state.tasks.filter(t => {
        if (state.taskFilterTab !== "ALL" && t.category !== state.taskFilterTab) return false;
        if (state.hideCompletedTasks && t.completed) return false;
        return true;
    });
    
    let completedCount = 0;
    
    filteredTasks.forEach(task => {
        if (task.completed) completedCount++;
        
        const card = document.createElement("div");
        card.className = `flex items-center justify-between p-4 rounded-xl border border-cozy-500/10 transition-all ${task.completed ? 'bg-cozy-100/60 opacity-60' : 'bg-white hover:bg-cozy-100 shadow-sm'}`;
        
        const leftSide = document.createElement("div");
        leftSide.className = "flex items-center space-x-3";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed;
        checkbox.className = "w-4 h-4 rounded border-cozy-500/25 bg-white text-cozy-500 focus:ring-cozy-500 focus:ring-offset-white cursor-pointer";
        checkbox.onclick = () => toggleTaskComplete(task.id);
        
        const info = document.createElement("div");
        info.className = "space-y-0.5";
        
        const title = document.createElement("span");
        title.className = `text-xs font-semibold ${task.completed ? 'line-through text-cozy-700/40' : 'text-cozy-700'}`;
        title.innerText = task.name;
        
        const categoryBadge = document.createElement("span");
        categoryBadge.className = `inline-block text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ml-2 ${
            task.category === "Work" ? 'bg-sky-100 text-sky-700 border border-sky-200/50' : 
            task.category === "Personal" ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/50' : 'bg-orange-100 text-orange-700 border border-orange-200/50'
        }`;
        categoryBadge.innerText = task.category;
        
        info.appendChild(title);
        info.appendChild(categoryBadge);
        
        // Render Due Date & Overdue Badge if present
        if (task.due_date) {
            const dueDt = new Date(task.due_date);
            const dueText = document.createElement("span");
            const isOverdue = !task.completed && dueDt < new Date();
            dueText.className = `block text-[9px] font-semibold mt-1 ${isOverdue ? 'text-red-500 animate-pulse' : 'text-cozy-700/50'}`;
            dueText.innerHTML = `📅 Due: ${dueDt.toLocaleDateString()} ${dueDt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ${isOverdue ? '⚠️ Overdue' : ''}`;
            info.appendChild(dueText);
        }
        
        leftSide.appendChild(checkbox);
        leftSide.appendChild(info);
        
        // Delete button
        const delBtn = document.createElement("button");
        delBtn.innerHTML = "&times;";
        delBtn.className = "text-cozy-700/40 hover:text-red-500 text-lg px-2 transition-colors";
        delBtn.onclick = () => handleDeleteTask(task.id);
        
        card.appendChild(leftSide);
        card.appendChild(delBtn);
        container.appendChild(card);
    });
    
    // Update counter badge
    const badge = document.getElementById("task-completed-badge");
    if (badge) {
        badge.innerText = `Completed: ${completedCount}/${filteredTasks.length}`;
    }
    
    if (filteredTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-center py-10 text-cozy-700/50 italic text-xs";
        empty.innerText = "No tasks logged in this category. Flow on!";
        container.appendChild(empty);
    }
}

function handleDeleteTask(taskId) {
    if (confirm("Are you sure you want to delete this action item?")) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        saveLocalCache("tasks");
        localStorage.removeItem("vibe_task_coach_tip"); // Clear cached execution strategy
        
        if (supabaseClient) {
            supabaseClient.from("tasks").delete().eq("id", taskId)
                .then(({ error }) => {
                    if (error) console.error("Cloud task delete error:", error);
                });
        }
        
        renderTaskChecklist();
    }
}

window.toggleTaskCoachPanel = function(show) {
    const panel = document.getElementById("task-coach-panel");
    if (!panel) return;
    
    if (show) {
        panel.classList.remove("hidden");
        // Try to load cached tip first to feel super premium
        const cachedTip = localStorage.getItem("vibe_task_coach_tip");
        const responseEl = document.getElementById("task-coach-response");
        if (cachedTip && responseEl) {
            responseEl.innerHTML = cachedTip;
        } else {
            // Trigger fresh run
            window.runTaskCoach();
        }
    } else {
        panel.classList.add("hidden");
    }
};

window.runTaskCoach = async function() {
    const apiKey = state.gemini_api_key;
    const responseEl = document.getElementById("task-coach-response");
    const spinner = document.getElementById("task-coach-spinner");
    
    if (!responseEl || !spinner) return;
    
    if (!apiKey) {
        responseEl.innerHTML = "⚠️ <strong>Gemini API Key not found.</strong><br>Please click the settings gear (⚙️) in the top-right header to configure your key to enable AI Task Coaching!";
        return;
    }
    
    // Extract uncompleted tasks
    const activeTasks = state.tasks.filter(t => !t.completed);
    
    if (activeTasks.length === 0) {
        window.showToast("No active tasks to coach! Add some tasks first.");
        document.getElementById("task-coach-panel").classList.add("hidden");
        return;
    }
    
    // Show spinner and reset message
    spinner.classList.remove("hidden");
    responseEl.innerText = "Coaching your action priority list...";
    
    let prompt = `You are a high-performance Executive Agile Coach analyzing the active task list for: ${state.username}.\n\n`;
    prompt += "Kyle's pending checklist items:\n";
    activeTasks.forEach((t, index) => {
        prompt += `- ${t.name} [Category: ${t.category}${t.due_date ? `, Due: ${new Date(t.due_date).toLocaleDateString()}` : ''}]\n`;
    });
    
    prompt += `\nProvide ONE actionable, high-impact execution strategy for Kyle to build momentum.\n`;
    prompt += "CRITICAL RULES:\n";
    prompt += "1. Keep the tip strictly UNDER 20 words.\n";
    prompt += "2. Address him directly with a strong advice verb (e.g. 'Tackle X first to...', 'Block out 2 hours to...', 'Use Y to...').\n";
    prompt += "3. Focus strictly on energy optimization and focus preservation.\n";
    prompt += "4. Avoid any intro/outro fillers. Return ONLY the strategy text.";
    
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
                maxOutputTokens: 100
            }
        });
        
        let tip = response.text.trim();
        if (tip.startsWith('"') && tip.endsWith('"')) {
            tip = tip.substring(1, tip.length - 1).trim();
        }
        
        responseEl.innerText = tip;
        // Save to cache
        localStorage.setItem("vibe_task_coach_tip", tip);
    } catch (e) {
        console.error("AI Task Coach error:", e);
        responseEl.innerText = `⚠️ Unable to load AI strategy (Error: ${e.message || e}). Your checklist is saved safely!`;
    } finally {
        spinner.classList.add("hidden");
    }
};

// ==========================================
// ========== 8. BLIP CAPTURE LAYER =========
// ==========================================

function handleSaveBlip() {
    const input = document.getElementById("blip-input");
    const text = input.value.trim();
    
    if (!text) {
        window.showToast("Please enter your thought blip.");
        return;
    }
    
    const newBlip = {
        id: "b-" + Date.now(),
        username: state.username,
        content: text,
        timestamp: new Date().toISOString()
    };
    
    state.blips.unshift(newBlip);
    saveLocalCache("blips");
    
    // Reset field
    input.value = "";
    
    window.showToast("Thought captured instantly!");
    
    pushToCloud("blips", newBlip);
    
    window.navigate("HOME");
}

// ==========================================
// ========== 9. AAR LOG LAYER ==============
// ==========================================

function handleSaveAAR() {
    const right = document.getElementById("aar-right-input").value.trim();
    const wrong = document.getElementById("aar-wrong-input").value.trim();
    const next = document.getElementById("aar-next-input").value.trim();
    
    if (!right || !wrong || !next) {
        window.showToast("Please fill out all three After Action Review prompt sections.");
        return;
    }
    
    const newAAR = {
        id: "aar-" + Date.now(),
        username: state.username,
        went_right: right,
        went_wrong: wrong,
        next_steps: next,
        timestamp: new Date().toISOString()
    };
    
    // Save locally
    state.aars.unshift(newAAR);
    saveLocalCache("aars");
    
    // Reset form
    document.getElementById("aar-right-input").value = "";
    document.getElementById("aar-wrong-input").value = "";
    document.getElementById("aar-next-input").value = "";
    
    // Re-draw local History list on the side
    renderAARGrid();
    
    window.showToast("AAR entry logged and sent to coach!");
    
    // Push asynchronously to Supabase
    pushToCloud("aars", newAAR);
    
    // Trigger async AI Agile Coach request
    runAIAgileCoach();
}

function renderAARGrid() {
    // History logs in AAR screen
    // Simply fetch last entries and draw them cleanly
}

async function runAIAgileCoach() {
    const apiKey = state.gemini_api_key;
    const responseBox = document.getElementById("aar-coach-response");
    const spinner = document.getElementById("aar-coach-spinner");
    
    if (!apiKey) {
        responseBox.innerHTML = "⚠️ <strong>Gemini API Key not found.</strong><br>Please click the settings gear (⚙️) in the top-right header to configure your key to enable the AI Agile Coach!";
        return;
    }
    
    // Show loading spinner
    spinner.classList.remove("hidden");
    responseBox.innerText = "Analyzing your recent logs to prepare a custom productivity tip...";
    
    // Get last 5 AARs
    const recentAars = state.aars.slice(0, 5).reverse();
    
    let prompt = `You are an elite Agile Performance Coach analyzing the After Action Reviews (AARs) for team member: ${state.username}.\n\n`;
    prompt += "Recent historical logs (oldest to newest):\n";
    
    recentAars.forEach((h, index) => {
        prompt += `--- Log ${index+1} (${new Date(h.timestamp).toLocaleDateString()}) ---\n`;
        prompt += `What went right: ${h.went_right}\n`;
        prompt += `What went wrong: ${h.went_wrong}\n`;
        prompt += `What to do differently: ${h.next_steps}\n\n`;
    });
    
    prompt += `Based on these patterns, act as a highly pattern-aware Agile Coach and provide one actionable productivity tip for ${state.username}.\n`;
    prompt += "CRITICAL RULES:\n";
    prompt += "1. Keep the tip strictly UNDER 50 words.\n";
    prompt += "2. Address the user directly (e.g. 'You should...').\n";
    prompt += "3. Avoid conversational fillers like 'Here is your tip'. Go straight to the advice.\n";
    prompt += "4. Rely on specific patterns you noticed in their logs.";
    
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
                maxOutputTokens: 150
            }
        });
        
        let textResult = response.text.trim();
        if (textResult.startsWith('"') && textResult.endsWith('"')) {
            textResult = textResult.substring(1, textResult.length - 1).trim();
        }
        
        responseBox.innerText = textResult;
    } catch (e) {
        console.error("AI Coach API Error:", e);
        responseBox.innerText = `⚠️ Unable to reach your AI Agile Coach (Error: ${e.message || e}). Your local entry has been logged securely!`;
    } finally {
        spinner.classList.add("hidden");
    }
}

// ==========================================
// ========== 10. VIBE CHECK SUMMARY LAYER ==
// ==========================================

// ==========================================
// ========== 10. VIBE CHECK SUMMARY LAYER ==
// ==========================================

window.toggleVibeTab = function(tabName) {
    state.vibeTab = tabName;
    
    const dailyBtn = document.getElementById("tab-vibe-daily");
    const weeklyBtn = document.getElementById("tab-vibe-weekly");
    const dailySec = document.getElementById("vibe-daily-section");
    const weeklySec = document.getElementById("vibe-weekly-section");
    
    if (!dailyBtn || !weeklyBtn || !dailySec || !weeklySec) return;
    
    if (tabName === "DAILY") {
        dailyBtn.className = "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all select-none";
        weeklyBtn.className = "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all select-none";
        dailySec.classList.remove("hidden");
        weeklySec.classList.add("hidden");
    } else {
        weeklyBtn.className = "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all select-none";
        dailyBtn.className = "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all select-none";
        dailySec.classList.add("hidden");
        weeklySec.classList.remove("hidden");
        renderCachedWeeklyReport();
    }
};

function getWeeklyLogs() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    const jList = state.journals.filter(j => new Date(j.timestamp).getTime() >= cutoff);
    const tList = state.tasks.filter(t => new Date(t.timestamp).getTime() >= cutoff);
    const bList = state.blips.filter(b => new Date(b.timestamp).getTime() >= cutoff);
    const aList = state.aars.filter(a => new Date(a.timestamp).getTime() >= cutoff);
    
    return {
        journals: jList.map(j => j.content).join("\n- "),
        tasks: tList.map(t => `${t.name} (Category: ${t.category}, Completed: ${t.completed})`).join("\n- "),
        blips: bList.map(b => b.content).join("\n- "),
        aars: aList.map(a => `What went right: ${a.went_right} | What went wrong: ${a.went_wrong} | Next steps: ${a.next_steps}`).join("\n- ")
    };
}

async function compileWeeklyVibeReport() {
    const apiKey = state.gemini_api_key;
    const container = document.getElementById("vibe-weekly-container");
    
    if (!apiKey) {
        window.showToast("Please configure your Gemini API Key in Settings (⚙️) to run the Weekly Vibe Report!");
        return;
    }
    
    container.innerHTML = `
        <div class="bg-white border border-cozy-500/10 rounded-3xl p-8 flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div class="custom-spinner"></div>
            <p class="text-xs text-cozy-700/60 italic">Performing EOD weekly mindset & agile performance synthesis...</p>
        </div>
    `;
    
    const logs = getWeeklyLogs();
    
    let prompt = `You are a high-level performance psychologist, agile team coach, and emotional intelligence researcher doing a comprehensive "Weekly Vibe Report" for: ${state.username}.\n\n`;
    prompt += "Here is the raw context of all entries Kyle logged over the last 7 days:\n\n";
    prompt += `--- DEEP JOURNALS ---\n- ${logs.journals || 'None'}\n\n`;
    prompt += `--- DYNAMIC TASKS CHECKLIST ---\n- ${logs.tasks || 'None'}\n\n`;
    prompt += `--- QUICK IDEATION THOUGHTS (BLIPS) ---\n- ${logs.blips || 'None'}\n\n`;
    prompt += `--- AFTER ACTION REVIEWS (AAR LOGS) ---\n- ${logs.aars || 'None'}\n\n`;
    
    prompt += "Analyze these weekly inputs for emotional frequency, work-life focus balance, and recurring cognitive blockers. Provide a structured response in JSON format containing exactly:\n";
    prompt += "1. 'weekly_vibe_score': A creative state of mind description (e.g. 'HIGH-VIBRATION COGNITIVE FLOW', 'ACTION-HEAVY BURN FRICTION', 'CALM NATURAL BALANCE').\n";
    prompt += "2. 'work_percentage': An integer (0-100) estimating their focus on Work tasks and topics this week.\n";
    prompt += "3. 'personal_percentage': An integer (0-100) estimating their focus on Personal tasks, self-reflection, and mindfulness.\n";
    prompt += "4. 'ideas_percentage': An integer (0-100) estimating their focus on creativity, ideas, and future scaling. (Ensure work, personal, and ideas percentages add up to exactly 100!).\n";
    prompt += "5. 'cognitive_friction': A 2-sentence summary of the main subconscious blockers or bottlenecks they encountered.\n";
    prompt += "6. 'coach_letter': A beautiful, empathy-rich, encouraging narrative letter addressing Kyle directly (under 120 words). Validate his weekly journey, celebrate his specific wins, and give him one key intention adjustment for the coming week.\n";
    
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        weekly_vibe_score: { type: 'STRING' },
                        work_percentage: { type: 'INTEGER' },
                        personal_percentage: { type: 'INTEGER' },
                        ideas_percentage: { type: 'INTEGER' },
                        cognitive_friction: { type: 'STRING' },
                        coach_letter: { type: 'STRING' }
                    },
                    required: ['weekly_vibe_score', 'work_percentage', 'personal_percentage', 'ideas_percentage', 'cognitive_friction', 'coach_letter']
                }
            }
        });
        
        const report = JSON.parse(response.text.trim());
        state.weeklyReport = report;
        localStorage.setItem("vibe_weekly_report", JSON.stringify(report));
        
        renderWeeklyReportUI(report);
    } catch (e) {
        console.error("Weekly Vibe Report API Error:", e);
        container.innerHTML = `
            <div class="bg-white border border-red-500/10 rounded-2xl p-6 text-center space-y-2 shadow-sm">
                <span class="text-2xl">⚠️</span>
                <p class="text-xs text-cozy-700 leading-relaxed font-light">Unable to compile your Weekly Vibe Report. Please check your Gemini API Key in settings. (Error: ${e.message || e})</p>
            </div>
        `;
    }
}

function renderCachedWeeklyReport() {
    const container = document.getElementById("vibe-weekly-container");
    if (!container) return;
    
    const cached = localStorage.getItem("vibe_weekly_report");
    if (cached) {
        const report = JSON.parse(cached);
        state.weeklyReport = report;
        renderWeeklyReportUI(report);
    }
}

function renderWeeklyReportUI(report) {
    const container = document.getElementById("vibe-weekly-container");
    if (!container) return;
    
    container.innerHTML = `
        <!-- 1. Frequency Score Card -->
        <div class="bg-white border border-cozy-500/10 rounded-3xl p-6 text-center space-y-2 relative overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div class="absolute inset-0 bg-gradient-to-br from-cozy-500/[0.03] to-transparent"></div>
            <span class="text-[10px] font-bold text-cozy-500 uppercase tracking-widest block">Weekly Frequency State</span>
            <h4 class="text-xl font-extrabold text-cozy-700 tracking-tight serif-font italic">${report.weekly_vibe_score}</h4>
        </div>
        
        <!-- 2. Energy Distribution Progress bars -->
        <div class="bg-white border border-cozy-500/10 rounded-3xl p-6 space-y-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
            <span class="text-[10px] font-bold text-cozy-500 uppercase tracking-widest block">Weekly Energy Distribution</span>
            
            <div class="space-y-3">
                <!-- Work -->
                <div class="space-y-1">
                    <div class="flex justify-between items-center text-xs font-semibold text-cozy-700">
                        <span class="flex items-center">💼 Work Focus</span>
                        <span>${report.work_percentage}%</span>
                    </div>
                    <div class="w-full bg-cozy-50 h-2 rounded-full overflow-hidden border border-cozy-500/5">
                        <div class="bg-[#5C8CA6] h-full rounded-full transition-all duration-500 animate-pulse" style="width: ${report.work_percentage}%"></div>
                    </div>
                </div>
                
                <!-- Personal -->
                <div class="space-y-1">
                    <div class="flex justify-between items-center text-xs font-semibold text-cozy-700">
                        <span class="flex items-center">🏡 Personal Reflection</span>
                        <span>${report.personal_percentage}%</span>
                    </div>
                    <div class="w-full bg-cozy-50 h-2 rounded-full overflow-hidden border border-cozy-500/5">
                        <div class="bg-[#6C9372] h-full rounded-full transition-all duration-500 animate-pulse" style="width: ${report.personal_percentage}%"></div>
                    </div>
                </div>
                
                <!-- Ideas -->
                <div class="space-y-1">
                    <div class="flex justify-between items-center text-xs font-semibold text-cozy-700">
                        <span class="flex items-center">💡 Idea Generation</span>
                        <span>${report.ideas_percentage}%</span>
                    </div>
                    <div class="w-full bg-cozy-50 h-2 rounded-full overflow-hidden border border-cozy-500/5">
                        <div class="bg-[#E2995D] h-full rounded-full transition-all duration-500 animate-pulse" style="width: ${report.ideas_percentage}%"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 3. Cognitive Friction card -->
        <div class="bg-white border border-[#E07A5F]/15 rounded-3xl p-6 space-y-2 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div class="absolute right-0 top-0 w-16 h-16 bg-[#E07A5F]/5 rounded-full blur-xl"></div>
            <span class="text-[10px] font-bold text-[#E07A5F] uppercase tracking-widest block">Subconscious Friction & Blockers</span>
            <p class="text-xs text-cozy-700 leading-relaxed font-light italic">${report.cognitive_friction}</p>
        </div>
        
        <!-- 4. Premium Envelope Coach Letter -->
        <div class="bg-cozy-50 border border-cozy-500/10 rounded-3xl p-6 space-y-4 shadow-sm relative overflow-hidden text-left animate-in fade-in slide-in-from-bottom-2 duration-350">
            <div class="absolute top-0 right-0 w-24 h-24 bg-cozy-500/[0.02] rounded-full blur-2xl"></div>
            <div class="flex items-center space-x-2 border-b border-cozy-500/10 pb-3">
                <span class="text-xl">✉️</span>
                <div class="space-y-0.5">
                    <span class="block text-[10px] font-bold text-cozy-500 uppercase tracking-widest leading-none">Weekly Intentions Letter</span>
                    <span class="block text-[8px] text-cozy-700/50 uppercase tracking-widest font-semibold leading-none">From: AI Agile Performance Coach</span>
                </div>
            </div>
            <p class="text-xs text-cozy-700 leading-relaxed font-light italic whitespace-pre-line">
                Dear ${state.username},
                
                ${report.coach_letter}
                
                Warmly,
                Your Agile Coach 🤖
            </p>
        </div>
    `;
}

async function compileVibeCheck() {
    const apiKey = state.gemini_api_key;
    const container = document.getElementById("vibe-dashboard-container");
    
    if (!apiKey) {
        window.showToast("Please configure your Gemini API Key in Settings (⚙️) to run the Vibe Check!");
        return;
    }
    
    container.innerHTML = `
        <div class="bg-white border border-cozy-500/10 rounded-2xl p-8 flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div class="custom-spinner"></div>
            <p class="text-xs text-cozy-700/60 italic">Performing EOD emotional intelligence vibe check...</p>
        </div>
    `;
    
    // Compile Journals, Tasks, Blips in the last 24h or current stack
    const jLogs = state.journals.slice(0, 3).map(j => j.content).join("\n- ");
    const tLogs = state.tasks.slice(0, 10).map(t => `${t.name} (${t.completed ? 'Done' : 'Pending'})`).join("\n- ");
    const bLogs = state.blips.slice(0, 5).map(b => b.content).join("\n- ");
    
    let prompt = `You are a performance psychologist and productivity coach doing an end-of-day "Vibe Check" for ${state.username}.\n\n`;
    prompt += "Here is a summary of today's captures:\n";
    prompt += `Deep Journals:\n- ${jLogs || 'None'}\n\n`;
    prompt += `Tasks Status:\n- ${tLogs || 'None'}\n\n`;
    prompt += `Quick Thoughts (Blips):\n- ${bLogs || 'None'}\n\n`;
    
    prompt += "Analyze these inputs for mood dynamics and focus balance. Provide a structured response in JSON format containing exactly:\n";
    prompt += "1. 'mood_summary': A 2-sentence summary of their overall mindset/vibe.\n";
    prompt += "2. 'vibe_score': A creative score representation (e.g. '88% - Flow State', '64% - Action Overload').\n";
    prompt += "3. 'advice': 2 bullet points of balanced, actionable, high-frequency growth advice.";
    
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        mood_summary: { type: 'STRING' },
                        vibe_score: { type: 'STRING' },
                        advice: { type: 'ARRAY', items: { type: 'STRING' } }
                    },
                    required: ['mood_summary', 'vibe_score', 'advice']
                }
            }
        });
        
        const result = JSON.parse(response.text.trim());
        
        // Render beautiful, visual dashboard cards!
        container.innerHTML = `
            <!-- Score Card -->
            <div class="bg-white border border-cozy-500/10 rounded-3xl p-6 text-center space-y-2 relative overflow-hidden shadow-sm">
                <div class="absolute inset-0 bg-gradient-to-br from-cozy-500/[0.03] to-transparent"></div>
                <span class="text-xs font-bold text-cozy-500 uppercase tracking-widest">Calculated Frequency</span>
                <h4 class="text-3xl font-extrabold text-cozy-700 tracking-tight serif-font italic">${result.vibe_score}</h4>
            </div>
            
            <!-- Summary Card -->
            <div class="bg-white border border-cozy-500/10 rounded-3xl p-6 space-y-3 shadow-sm">
                <span class="text-[10px] font-bold text-cozy-500 uppercase tracking-widest block">Mindset Analysis</span>
                <p class="text-xs text-cozy-700 leading-relaxed font-light">${result.mood_summary}</p>
            </div>
            
            <!-- Advice Bullet Cards -->
            <div class="space-y-2">
                <span class="text-[10px] font-bold text-cozy-700/60 uppercase tracking-widest block px-1">Actionable Growth Keys</span>
                ${result.advice.map(adv => `
                    <div class="flex items-start space-x-3 bg-white border border-cozy-500/10 p-4 rounded-2xl shadow-sm">
                        <span class="text-cozy-500 text-sm">✦</span>
                        <p class="text-xs text-cozy-700 font-light leading-relaxed">${adv}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error("Vibe Check API Error:", e);
        container.innerHTML = `
            <div class="bg-white border border-red-500/10 rounded-2xl p-6 text-center space-y-2 shadow-sm">
                <span class="text-2xl">⚠️</span>
                <p class="text-xs text-cozy-700 leading-relaxed font-light">Unable to compile your Vibe Check dashboard. Please double-check your Gemini API Key in settings. (Error: ${e.message || e})</p>
            </div>
        `;
    }
}

// ==========================================
// ========== 11. HISTORY FEED & ACTIVITY ===
// ==========================================

window.filterHistoryTab = function(tabName) {
    state.historyTab = tabName;
    
    // Swap active styles
    const tabs = ["JOURNAL", "BLIP", "AAR"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-history-${t.toLowerCase()}`);
        if (btn) {
            if (tabName === t) {
                btn.className = "px-4 py-2 text-xs font-semibold rounded-lg bg-cozy-500 text-white transition-all";
            } else {
                btn.className = "px-4 py-2 text-xs font-semibold rounded-lg text-cozy-700/60 hover:text-cozy-500 transition-all";
            }
        }
    });
    
    renderHistoryFeed();
};

function renderHistoryFeed() {
    const container = document.getElementById("history-feed-container");
    container.innerHTML = "";
    
    const searchVal = document.getElementById("history-search-input").value.trim().toLowerCase();
    
    let feedItems = [];
    if (state.historyTab === "JOURNAL") {
        feedItems = state.journals.map(j => ({ ...j, type: 'JOURNAL' }));
    } else if (state.historyTab === "BLIP") {
        feedItems = state.blips.map(b => ({ ...b, type: 'BLIP' }));
    } else if (state.historyTab === "AAR") {
        feedItems = state.aars.map(a => ({ ...a, type: 'AAR' }));
    }
    
    // Filter by date if selected in calendar
    if (state.selectedFilterDate) {
        feedItems = feedItems.filter(item => {
            const itemDateStr = getLocalDateString(new Date(item.timestamp));
            return itemDateStr === state.selectedFilterDate;
        });
    }
    
    // Filter by search query
    if (searchVal) {
        feedItems = feedItems.filter(item => {
            const dateStr = new Date(item.timestamp).toLocaleDateString().toLowerCase();
            const textMatch = item.content ? item.content.toLowerCase().includes(searchVal) : false;
            const aarRight = item.went_right ? item.went_right.toLowerCase().includes(searchVal) : false;
            const aarWrong = item.went_wrong ? item.went_wrong.toLowerCase().includes(searchVal) : false;
            const aarNext = item.next_steps ? item.next_steps.toLowerCase().includes(searchVal) : false;
            return textMatch || aarRight || aarWrong || aarNext || dateStr;
        });
    }
    
    feedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "bg-white border border-cozy-500/10 p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-sm text-cozy-700";
        
        // Header
        const cardHdr = document.createElement("div");
        cardHdr.className = "flex justify-between items-center";
        
        const userLbl = document.createElement("span");
        userLbl.className = "text-xs font-bold text-cozy-500";
        userLbl.innerText = `👤 ${item.username}`;
        
        const timeLbl = document.createElement("span");
        timeLbl.className = "text-[10px] text-cozy-700/40 uppercase tracking-widest font-semibold";
        
        try {
            const dt = new Date(item.timestamp);
            timeLbl.innerText = dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            timeLbl.innerText = item.timestamp;
        }
        
        cardHdr.appendChild(userLbl);
        cardHdr.appendChild(timeLbl);
        card.appendChild(cardHdr);
        
        // Body Content
        if (item.type === "JOURNAL" || item.type === "BLIP") {
            const text = document.createElement("p");
            text.className = "text-xs text-cozy-700/80 leading-relaxed font-light";
            text.innerText = item.content;
            card.appendChild(text);
        } else if (item.type === "AAR") {
            const aarBox = document.createElement("div");
            aarBox.className = "space-y-2 pt-1 border-t border-cozy-500/5";
            
            aarBox.innerHTML = `
                <div class="space-y-0.5">
                    <span class="block text-[9px] font-bold uppercase tracking-widest text-cozy-500">What went right</span>
                    <p class="text-xs text-cozy-700/80 font-light leading-relaxed">${item.went_right}</p>
                </div>
                <div class="space-y-0.5">
                    <span class="block text-[9px] font-bold uppercase tracking-widest text-[#E07A5F]">What went wrong</span>
                    <p class="text-xs text-cozy-700/80 font-light leading-relaxed">${item.went_wrong}</p>
                </div>
                <div class="space-y-0.5">
                    <span class="block text-[9px] font-bold uppercase tracking-widest text-cozy-700/60">What should do differently</span>
                    <p class="text-xs text-cozy-700/80 font-light leading-relaxed">${item.next_steps}</p>
                </div>
            `;
            card.appendChild(aarBox);
        }
        
        container.appendChild(card);
    });
    
    if (feedItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-center py-12 text-cozy-700/50 italic text-xs";
        empty.innerText = "No matching history logs found. Flow on!";
        container.appendChild(empty);
    }
}

// Export data into standard JSON format (highly portable)
function handleExportSheets() {
    const data = {
        journals: state.journals,
        tasks: state.tasks,
        blips: state.blips,
        aars: state.aars
    };
    
    try {
        const blob = new Blob([JSON.stringify(data, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `daily_vibe_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        window.showToast("Data backup JSON exported successfully!");
    } catch (e) {
        window.showToast("Error exporting backup file: " + e.message);
    }
}

function updateSyncDashboardMetrics() {
    const j = document.getElementById("sync-count-journal");
    const t = document.getElementById("sync-count-task");
    const b = document.getElementById("sync-count-blip");
    const a = document.getElementById("sync-count-aar");
    
    if (j) j.innerText = state.journals.length;
    if (t) t.innerText = state.tasks.length;
    if (b) b.innerText = state.blips.length;
    if (a) a.innerText = state.aars.length;
}

const COZY_PROMPTS = [
    "What is one beautiful thing you want to focus on today?",
    "What made you smile or feel calm recently?",
    "Is there any tension you want to release in writing?",
    "Name a tiny victory or success you had today.",
    "What was the most peaceful moment of your day?",
    "What are you most grateful for in this exact moment?",
    "How can you make tomorrow 1% more cozy and focused?"
];

function updateUIElements() {
    document.getElementById("header-user-tag").innerText = `👤 User: ${state.username}`;
    
    // Set time-based greeting
    const hour = new Date().getHours();
    let greeting = "Good morning";
    if (hour >= 12 && hour < 17) {
        greeting = "Good afternoon";
    } else if (hour >= 17 || hour < 4) {
        greeting = "Good evening";
    }
    
    const greetingEl = document.getElementById("home-greeting");
    if (greetingEl) {
        greetingEl.innerText = `${greeting}, ${state.username}.`;
    }
    
    // Select random prompt on startup
    const promptEl = document.getElementById("home-reflection-prompt");
    if (promptEl && !promptEl.dataset.promptSet) {
        const randomPrompt = COZY_PROMPTS[Math.floor(Math.random() * COZY_PROMPTS.length)];
        promptEl.innerText = `"${randomPrompt}"`;
        promptEl.dataset.promptSet = "true"; // Keep it consistent during the active SPA session
    }
    
    // Dynamically draw the streak timeline panel on startup
    updateFlowStreakPanel();
}

// ==========================================
// ========== 12. BOOTSTRAPPING & BINDINGS ==
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialise cache & UI settings
    loadSettings();
    updateUIElements();
    initializeSupabase();
    
    // 2. Setup voice capture APIs
    setupVoiceDictation();
    
    // 3. Navigation Bindings
    document.getElementById("logo-home").onclick = () => window.navigate("HOME");
    document.getElementById("btn-header-home").onclick = () => window.navigate("HOME");
    
    // Information Modals
    document.getElementById("btn-info").onclick = () => window.toggleModal("modal-info", true);
    document.getElementById("btn-settings").onclick = () => window.toggleModal("modal-settings", true);
    document.getElementById("btn-sync-dashboard").onclick = () => window.toggleModal("modal-sync", true);
    
    // Inputs & Forms Actions
    document.getElementById("btn-journal-save").onclick = handleSaveJournal;
    document.getElementById("btn-journal-mic").onclick = toggleVoiceRecording;
    
    const journalInput = document.getElementById("journal-input");
    if (journalInput) {
        journalInput.addEventListener("input", window.updateJournalMetrics);
    }
    
    document.getElementById("btn-task-save").onclick = handleSaveTask;
    document.getElementById("btn-blip-save").onclick = handleSaveBlip;
    
    // Hide Completed Bind
    document.getElementById("chk-hide-completed").onchange = (e) => {
        state.hideCompletedTasks = e.target.checked;
        localStorage.setItem("vibe_hide_completed", JSON.stringify(state.hideCompletedTasks));
        renderTaskChecklist();
    };
    
    // Blip Enter to Save
    document.getElementById("blip-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            handleSaveBlip();
        }
    });
    
    document.getElementById("btn-aar-save").onclick = handleSaveAAR;
    document.getElementById("btn-run-vibecheck").onclick = compileVibeCheck;
    document.getElementById("btn-run-weekly-vibe").onclick = compileWeeklyVibeReport;
    document.getElementById("btn-export-sheets").onclick = handleExportSheets;
    
    // Quick-Dictate listeners
    setupQuickDictation();
    
    const btnQuickMic = document.getElementById("btn-quick-mic");
    if (btnQuickMic) {
        btnQuickMic.onclick = () => window.toggleQuickDrawer(true);
    }
    
    document.getElementById("btn-close-quick-drawer").onclick = () => window.toggleQuickDrawer(false);
    document.getElementById("quick-drawer-overlay").onclick = () => window.toggleQuickDrawer(false);
    document.getElementById("btn-toggle-quick-record").onclick = window.toggleQuickRecordState;
    
    const btnTaskCoach = document.getElementById("btn-task-coach");
    if (btnTaskCoach) {
        btnTaskCoach.onclick = () => {
            const panel = document.getElementById("task-coach-panel");
            if (panel) {
                const isHidden = panel.classList.contains("hidden");
                window.toggleTaskCoachPanel(isHidden);
            }
        };
    }
    
    document.getElementById("btn-quick-file-task").onclick = () => {
        const subDrawer = document.getElementById("quick-task-options");
        if (subDrawer) {
            subDrawer.classList.toggle("hidden");
            window.setQuickTaskCategory("Work");
        }
    };
    
    document.getElementById("btn-quick-task-work").onclick = () => window.setQuickTaskCategory("Work");
    document.getElementById("btn-quick-task-personal").onclick = () => window.setQuickTaskCategory("Personal");
    document.getElementById("btn-quick-task-ideas").onclick = () => window.setQuickTaskCategory("Ideas");
    
    // Calendar Month Navigation Buttons
    document.getElementById("btn-cal-prev").onclick = () => {
        state.calendarMonth--;
        if (state.calendarMonth < 0) {
            state.calendarMonth = 11;
            state.calendarYear--;
        }
        renderInteractiveCalendar();
    };
    
    document.getElementById("btn-cal-next").onclick = () => {
        state.calendarMonth++;
        if (state.calendarMonth > 11) {
            state.calendarMonth = 0;
            state.calendarYear++;
        }
        renderInteractiveCalendar();
    };
    
    document.getElementById("btn-clear-cal-filter").onclick = clearCalendarFilter;
    
    // Bind search keypress in explorer
    document.getElementById("history-search-input").addEventListener("input", renderHistoryFeed);
    
    // Settings Save Click
    document.getElementById("btn-settings-save").onclick = () => {
        state.username = document.getElementById("settings-user-input").value.trim() || "Kyle";
        state.gemini_api_key = document.getElementById("settings-gemini-input").value.trim();
        state.supabase_url = document.getElementById("settings-supa-url").value.trim();
        state.supabase_key = document.getElementById("settings-supa-key").value.trim();
        
        saveLocalSettings();
        window.toggleModal("modal-settings", false);
        window.showToast("Application settings and keys updated successfully!");
    };
});
