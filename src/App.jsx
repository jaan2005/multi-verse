import { useState, useEffect, useRef } from 'react';
import { Search, Send, ChevronLeft, Loader2, User, Sparkles, MessageSquare, Zap, Menu, X, Plus, Trash2, RotateCcw, Download } from 'lucide-react';

export default function App() {
  // Navigation & UI State
  const [view, setView] = useState('landing'); // 'landing', 'search', or 'chat'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // PWA Install State
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(''); // 🌟 NEW: Track Server Errors
  
  // Session Management State
  // Structure: [{ id: number, character: object, history: array }]
  const [sessions, setSessions] = useState(() => {
    // 🌟 Check for saved chats when the app first loads!
    const savedSessions = localStorage.getItem('otakuverse_sessions');
    return savedSessions ? JSON.parse(savedSessions) : [];
  }); 
  const [activeSessionId, setActiveSessionId] = useState(null);
  
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const MAX_MESSAGES = 30;
  const [messageCount, setMessageCount] = useState(0);
  const isLimitReached = messageCount >= MAX_MESSAGES;
  
  const messagesEndRef = useRef(null);

  // Derived state for the currently active chat
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const chatHistory = activeSession ? activeSession.history : [];
  const selectedCharacter = activeSession ? activeSession.character : null;

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // 🌟 Automatically save chats to the browser whenever a new message is sent
  useEffect(() => {
    localStorage.setItem('otakuverse_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Handle daily message limits persistence
  useEffect(() => {
    const storedUsage = localStorage.getItem('otakuverse_usage');
    const today = new Date().toDateString(); // e.g., "Thu Apr 23 2026"
    
    if (storedUsage) {
      const { count, date } = JSON.parse(storedUsage);
      if (date === today) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessageCount(count);
      } else {
        // It's a new day! Reset the counter.
        setMessageCount(0);
        localStorage.setItem('otakuverse_usage', JSON.stringify({ count: 0, date: today }));
      }
    } else {
      localStorage.setItem('otakuverse_usage', JSON.stringify({ count: 0, date: today }));
    }
  }, []);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile automatically
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show the native install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null); // Clear the prompt once installed
      }
    } else {
      // Fallback for iOS or if the app is already installed / browser doesn't support it
      setShowInstallPrompt(true);
      setTimeout(() => setShowInstallPrompt(false), 7000); // Auto-hide after 7 seconds
    }
  };

  // Auto-Search (Debounced)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim() && view === 'search') {
        // eslint-disable-next-line react-hooks/immutability
        performSearch(searchQuery);
      } else if (!searchQuery.trim()) {
        setSearchResults([]); // Clear results if input is empty
        setSearchError('');
      }
    }, 500); // Waits 500ms after you stop typing before searching

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, view]);

  const performSearch = async (query) => {
    setIsSearching(true);
    setSearchError(''); // Clear previous errors
    try {
      const response = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=15&order_by=favorites&sort=desc`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.data) {
        setSearchResults(data.data);
      }
    } catch (error) {
      console.error("Error fetching characters:", error);
      setSearchError("The Anime Database server is currently offline or overloaded. Please try again in a few minutes!");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) performSearch(searchQuery);
  };

  const selectCharacter = async (character) => {
    setIsSearching(true);
    setSearchError('');
    try {
      // 1. Check if we already have a chat session with this character
      const existingSession = sessions.find(s => s.id === character.mal_id);
      
      if (existingSession) {
        setActiveSessionId(character.mal_id);
        setView('chat');
        setIsSidebarOpen(false);
        setIsSearching(false);
        return;
      }

      // 2. If new, fetch full details to get their personality
      const response = await fetch(`https://api.jikan.moe/v4/characters/${character.mal_id}/full`);
      
      if (!response.ok) {
         throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const fullCharData = data.data || character; 
      
      // 3. Create a new session
      const newSession = {
        id: character.mal_id,
        character: fullCharData,
        history: [
          { 
            role: 'model', 
            text: `*Steps into the light* Who are you? (I am ${fullCharData.name.replace(',', '')}. Feel free to talk to me!)` 
          }
        ]
      };

      setSessions(prev => [newSession, ...prev]); // Add to top of sidebar
      setActiveSessionId(character.mal_id);
      setView('chat');
      setIsSidebarOpen(false);
      
    } catch (error) {
      console.error("Error setting up character:", error);
      // If the database fails when clicking a character, tell the user!
      setSearchError("Failed to load character data from the database server. It might be down!");
    } finally {
      setIsSearching(false);
    }
  };

  const fetchGroqWithBackoff = async (payload, maxRetries = 3) => {
    // 🌟 SECURE API KEY LOAD 🌟
    // FOR YOUR LOCAL PC: Change the line below to use your .env file like this:
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    // const apiKey = ""; 
    
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API_KEY_MISSING");
    }

    const url = `https://api.groq.com/openai/v1/chat/completions`;
    
    let delays = [1000, 2000, 4000];
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          // Grab the exact reason for the 400 error from Groq
          const errorDetails = await response.json();
          console.error("Groq API Error:", errorDetails);
          // Throw the specific Groq message so we can display it in the chat UI
          throw new Error(errorDetails.error?.message || `API returned status ${response.status}`);
        }
        return await response.json();
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isTyping || !activeSession || isLimitReached) return;

    // Increment message count and save it to localStorage
    const newCount = messageCount + 1;
    setMessageCount(newCount);
    localStorage.setItem('otakuverse_usage', JSON.stringify({ count: newCount, date: new Date().toDateString() }));

    const userMsg = { role: 'user', text: inputMessage.trim() };
    
    // Optimistically update the UI immediately
    setSessions(prev => prev.map(s => 
      s.id === activeSessionId ? { ...s, history: [...s.history, userMsg] } : s
    ));
    
    setInputMessage('');
    setIsTyping(true);

    try {
      let cleanAbout = (selectedCharacter.about || "A mysterious character.")
        .replace(/\[spoiler\]/gi, '')
        .replace(/\[\/spoiler\]/gi, '');

      // 🌟 FIX: Truncate massive character bios to prevent 400 Bad Request limits
      // Groq limits tokens heavily on the free tier, so we cap the backstory length!
      if (cleanAbout.length > 2000) {
        cleanAbout = cleanAbout.substring(0, 2000) + "... [Backstory truncated for system stability]";
      }

      const systemPrompt = `You are roleplaying as ${selectedCharacter.name} from anime/manga. 
      Background/Personality: ${cleanAbout}
      
      RULES:
      1. Stay completely in character. Never acknowledge you are an AI.
      2. Match the exact tone, catchphrases, and attitude described.
      3. Keep responses conversational and immersive.
      4. Use asterisks for actions like *smiles* or *draws weapon*.`;

      // Pass the updated history (including the message we just added)
      const currentHistory = [...activeSession.history, userMsg];
      
      const messages = [
        { role: 'system', content: systemPrompt },
        // Inject this hidden user action so the API doesn't throw a format error
        { role: 'user', content: '*Approaches you*' }, 
        ...currentHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text || "*silence*"
        }))
      ];

      const payload = {
        model: "llama-3.1-8b-instant", // 🌟 FIX: Switched to a safer, faster model with higher free-tier limits
        messages: messages,
        temperature: 0.8,
        max_tokens: 1024,
      };

      const result = await fetchGroqWithBackoff(payload);
      const aiResponseText = result.choices?.[0]?.message?.content || "*Remains silent* (Error generating response)";
      
      // Update session with AI response
      setSessions(prev => prev.map(s => 
        s.id === activeSessionId ? { ...s, history: [...s.history, { role: 'model', text: aiResponseText }] } : s
      ));

    } catch (error) {
      console.error("Chat generation error:", error);
      
      // We display the specific Groq error inside the UI now!
      let errorMessage = `⚠️ **API Error:** ${error.message}`;
      if (error.message === "API_KEY_MISSING") {
        errorMessage = "⚠️ **System Error:** You forgot to add your Groq API Key! Make sure your .env file is set up with VITE_GROQ_API_KEY.";
      }

      setSessions(prev => prev.map(s => 
        s.id === activeSessionId ? { ...s, history: [...s.history, { role: 'model', text: errorMessage }] } : s
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const openSearch = () => {
    setView('search');
    setIsSidebarOpen(false);
    setSearchQuery('');
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation(); // Prevents the click from selecting the session
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setView('landing'); // Send user to landing if they delete the currently open chat
    }
  };

  const handleClearChat = () => {
    if (!activeSession) return;
    const initialMessage = {
      role: 'model',
      text: `*Steps into the light* Who are you? (I am ${activeSession.character.name.replace(',', '')}. Feel free to talk to me!)`
    };
    
    // Reset only the history array for the active session
    setSessions(prev => prev.map(s => 
      s.id === activeSessionId ? { ...s, history: [initialMessage] } : s
    ));
  };

  return (
    <div className="h-[100dvh] bg-[#05050a] text-slate-100 flex justify-center items-center font-sans relative overflow-hidden selection:bg-pink-500/30">
      
      {/* Global Background (Always Multiverse) */}
      <div className="absolute inset-0 z-0 bg-[#05050a]">
        {/* ========================================================
          🌟 HOW TO CHANGE YOUR BACKGROUND: 🌟
          Simply replace the /bg.jpg link below with a direct link 
          to any image on the internet, OR use your local public image!
          ========================================================
        */}
        <div 
          className="w-full h-full opacity-50 bg-cover bg-center bg-no-repeat transition-all duration-1000"
          style={{ 
            backgroundImage: `url('/bg.jpg')`,
            filter: 'brightness(0.7) contrast(1.2)' 
          }}
        />
        {/* Dark gradients so text is readable */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#05050a] via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#05050a]/80 via-transparent to-transparent"></div>
      </div>

      {/* --- SIDEBAR DRAWER --- */}
      {/* Backdrop */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar Panel */}
      <div className={`absolute top-0 left-0 h-full w-72 md:w-80 bg-black/80 backdrop-blur-2xl border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
          <button 
            onClick={() => { setView('landing'); setIsSidebarOpen(false); }}
            className="font-bold text-lg bg-gradient-to-r from-blue-400 to-pink-400 text-transparent bg-clip-text hover:opacity-80 transition-opacity"
          >
            Otaku Verse
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <X size={18} className="text-slate-300" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <button 
            onClick={() => { setView('landing'); setIsSidebarOpen(false); }}
            className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-sm border border-white/5 transition-all active:scale-[0.98]"
          >
            Home
          </button>
          <button 
            onClick={openSearch}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-500 hover:to-purple-500 rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-lg border border-white/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} /> Add Character
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 mb-3 mt-2">Active Sessions</h3>
          
          {sessions.length === 0 ? (
            <div className="text-center text-slate-500 text-sm mt-10 px-4">
              No active chats. Enter the multiverse to find someone!
            </div>
          ) : (
            sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => {
                  setActiveSessionId(session.id);
                  setView('chat');
                  setIsSidebarOpen(false);
                }}
                className={`relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border group ${
                  activeSessionId === session.id && view === 'chat'
                    ? 'bg-white/10 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.1)]' 
                    : 'bg-transparent border-transparent hover:bg-white/5'
                }`}
              >
                <img 
                  src={session.character.images?.jpg?.image_url} 
                  alt={session.character.name}
                  className="w-12 h-12 rounded-full object-cover border border-white/10"
                />
                <div className="flex-1 min-w-0 pr-10">
                  <h4 className={`font-bold truncate text-sm ${activeSessionId === session.id && view === 'chat' ? 'text-white' : 'text-slate-300'}`}>
                    {session.character.name.split(',')[0]}
                  </h4>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {session.history[session.history.length - 1]?.text || 'Started chat'}
                  </p>
                </div>
                
                {/* Delete Session Button (Touch-Friendly) */}
                <button 
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 md:p-2 rounded-full bg-red-500/10 text-red-400 active:bg-red-500 active:text-white md:hover:bg-red-500 md:hover:text-white transition-all opacity-80 md:opacity-0 md:group-hover:opacity-100 ${activeSessionId === session.id && view === 'chat' ? 'opacity-100 md:opacity-100' : ''}`}
                  title="Delete Chat"
                >
                  <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main App Container */}
      <div className={`w-full h-full md:h-[95vh] md:w-[95vw] lg:w-[85vw] lg:max-w-6xl md:rounded-3xl flex flex-col relative z-10 transition-colors duration-500 overflow-hidden ${
        view === 'landing' 
          ? 'bg-transparent border-transparent shadow-none' // Transparent on home page!
          : 'bg-black/40 backdrop-blur-xl shadow-2xl border-white/5 md:border' // Frosted glass on search/chat
      }`}>
        
        {/* Navbar */}
        <header className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-md relative z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
            >
              <Menu size={22} />
            </button>
            
            {/* Back button specifically for when in chat */}
            {view === 'chat' && (
              <button 
                onClick={() => setView('search')} 
                className="p-1.5 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all flex items-center gap-1 text-sm font-medium pr-3"
              >
                <ChevronLeft size={18} /> Back
              </button>
            )}
            
            {view !== 'chat' && (
              <button 
                onClick={() => setView('landing')}
                className="font-bold text-lg tracking-wide text-white flex items-center gap-2 ml-1 hover:text-pink-300 transition-colors"
              >
                Otaku Verse
              </button>
            )}
          </div>
          
          {/* Energy/Token counter pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold tracking-wide transition-colors mr-14 md:mr-16 ${
            isLimitReached 
              ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
          }`}>
             <Zap size={14} className={isLimitReached ? "fill-red-500 text-red-500" : "fill-emerald-500 text-emerald-500"} />
             <span>{messageCount}/{MAX_MESSAGES}</span>
          </div>
        </header>

        {/* --- VIEW ROUTER --- */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative custom-scrollbar">
          
          {/* 1. LANDING VIEW */}
          {view === 'landing' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
              <div className="relative mb-6 md:mb-8 md:scale-125 transition-transform">
                <div className="absolute inset-0 bg-pink-500/30 blur-3xl rounded-full scale-150"></div>
                <MessageSquare className="w-20 h-20 text-white relative z-10 opacity-90 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]" />
              </div>
              
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-2 md:mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm">
                  Otaku Verse
                </span>
              </h1>
              <h2 className="text-xl md:text-3xl lg:text-4xl font-bold text-white mb-6 md:mb-10 tracking-wide">
                Universal Edition
              </h2>
              
              <p className="text-slate-300 max-w-md md:max-w-xl lg:max-w-2xl mx-auto text-sm md:text-lg leading-relaxed mb-8 drop-shadow-md font-medium bg-black/30 p-4 rounded-xl backdrop-blur-sm border border-white/5">
                Enter the multiverse. Chat, roleplay, and live your anime dreams with legendary characters powered by JAAN.
              </p>

              <button 
                onClick={openSearch}
                className="group relative px-8 py-4 bg-white text-black font-bold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Enter the Multiverse <Sparkles size={18} />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-300 via-pink-300 to-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              </button>
            </div>
          )}

          {/* 2. SEARCH VIEW */}
          {view === 'search' && (
            <div className="p-5 md:p-8 lg:p-10 h-full flex flex-col animate-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto w-full">
              <div className="mb-6 mt-2 md:mt-4 text-center md:text-left">
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-1 md:mb-2">Find a Character</h2>
                <p className="text-slate-400 text-sm md:text-base">Search across the entire anime multiverse.</p>
              </div>

              <form onSubmit={handleSearch} className="mb-6 md:mb-8 relative group z-10">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-pink-500/20 rounded-2xl blur-xl group-hover:opacity-100 transition-opacity opacity-50"></div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Gojo Satoru, Makima..."
                  className="relative w-full bg-black/40 backdrop-blur-md border border-white/10 text-white px-5 py-4 md:py-5 pl-12 md:pl-14 rounded-2xl focus:outline-none focus:border-pink-500/50 transition-all shadow-xl placeholder:text-slate-500 md:text-lg"
                />
                <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 relative z-10" size={22} />
                <button 
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-2.5 md:p-3 rounded-xl transition-all disabled:opacity-50 relative z-10 backdrop-blur-md border border-white/5"
                >
                  {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </form>

              {/* 🌟 NEW: Server Error Message UI */}
              {searchError && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center backdrop-blur-md animate-in fade-in">
                  <p className="text-red-400 font-medium text-sm md:text-base">
                    ⚠️ {searchError}
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto pb-6 custom-scrollbar pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 content-start">
                {searchResults.length === 0 && !isSearching && !searchError && searchQuery && (
                  <div className="col-span-full text-center text-slate-400 mt-12 bg-white/5 p-6 md:p-10 rounded-2xl border border-white/5 backdrop-blur-md text-lg">
                    No heroes or villains found. Check the spelling!
                  </div>
                )}
                
                {searchResults.map((char) => (
                  <div 
                    key={char.mal_id}
                    onClick={() => selectCharacter(char)}
                    className="bg-black/40 backdrop-blur-md border border-white/10 p-3 md:p-4 rounded-2xl cursor-pointer flex items-center gap-4 transition-all hover:bg-white/10 hover:scale-[1.02] hover:border-white/20 active:scale-[0.98] group"
                  >
                    <div className="relative shrink-0">
                      <img 
                        src={char.images?.jpg?.image_url} 
                        alt={char.name} 
                        className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-white/10"
                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/150/000000/ffffff?text=X'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate text-lg md:text-xl group-hover:text-pink-300 transition-colors">{char.name}</h3>
                      <p className="text-sm md:text-base text-slate-400 truncate mt-0.5">
                        {char.anime?.[0]?.anime?.title || char.manga?.[0]?.manga?.title || 'Unknown Origin'}
                      </p>
                      <div className="text-xs md:text-sm text-blue-400 mt-1.5 flex items-center gap-1.5 font-medium">
                        <User size={14} className="opacity-70"/>
                        {char.favorites.toLocaleString()} fans
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. CHAT VIEW */}
          {view === 'chat' && activeSession && (
            <>
              {/* Character specific background confined to the chat section */}
              {selectedCharacter && (
                <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-30">
                  <img 
                    src={selectedCharacter.images?.jpg?.image_url} 
                    alt="" 
                    className="w-full h-full object-cover scale-110 filter blur-[6px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60"></div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 md:space-y-8 relative z-10 custom-scrollbar flex flex-col items-center">
                <div className="w-full max-w-4xl flex flex-col">
                  {/* Chat Header Info */}
                  <div className="flex flex-col items-center justify-center py-6 md:py-8 mb-4 md:mb-8 border-b border-white/10">
                    <img 
                      src={selectedCharacter?.images?.jpg?.image_url} 
                      alt={selectedCharacter?.name}
                      className="w-20 h-20 md:w-28 md:h-28 rounded-full object-cover border-2 border-pink-500/50 shadow-[0_0_20px_rgba(236,72,153,0.3)] mb-3 md:mb-4"
                    />
                    <h2 className="text-xl md:text-3xl font-bold text-white">{selectedCharacter?.name.replace(',', '')}</h2>
                    
                    <div className="flex items-center gap-2 mt-2 md:mt-3">
                      <span className="text-xs md:text-sm font-medium text-slate-400 bg-white/5 px-3 md:px-4 py-1 md:py-1.5 rounded-full border border-white/5">
                        {selectedCharacter?.anime?.[0]?.anime?.title || 'Multiverse Entity'}
                      </span>
                      
                      {/* Clear Chat Button */}
                      <button 
                        onClick={handleClearChat}
                        className="text-xs md:text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/20 hover:text-white px-3 md:px-4 py-1 md:py-1.5 rounded-full border border-white/5 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                        title="Restart Conversation"
                      >
                        <RotateCcw size={14} /> Clear
                      </button>
                    </div>
                  </div>

                  {chatHistory.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex mb-6 md:mb-8 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
                    >
                      {msg.role === 'model' && selectedCharacter && (
                        <img 
                          src={selectedCharacter.images?.jpg?.image_url} 
                          alt="avatar" 
                          className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover mr-3 self-end mb-1 border border-white/10 shadow-sm"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      
                      <div 
                        className={`max-w-[85%] md:max-w-[70%] lg:max-w-[60%] rounded-3xl px-5 md:px-6 py-3.5 md:py-4 shadow-xl backdrop-blur-md ${
                          msg.role === 'user' 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm border border-indigo-400/30' 
                            : 'bg-white/10 text-slate-100 rounded-bl-sm border border-white/10'
                        }`}
                      >
                        {msg.text.split(/(\*[^*]+\*)/g).map((part, i) => {
                          if (part.startsWith('*') && part.endsWith('*')) {
                            return <em key={i} className={msg.role === 'user' ? 'text-indigo-200' : 'text-pink-300 font-medium'}>{part}</em>;
                          }
                          return <span key={i} className="whitespace-pre-wrap leading-relaxed text-[15px] md:text-base">{part}</span>;
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start items-end animate-in fade-in mb-6">
                      <img 
                        src={selectedCharacter?.images?.jpg?.image_url} 
                        alt="avatar" 
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover mr-3 mb-1 border border-white/10 opacity-50"
                      />
                      <div className="bg-white/5 backdrop-blur-md rounded-3xl rounded-bl-sm px-5 py-4 border border-white/10 flex items-center gap-1.5 w-16 h-11 md:h-12 md:w-20 md:px-6">
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-pink-400 rounded-full animate-bounce"></div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>
            </>
          )}
        </main>

        {/* Chat Input Footer */}
        {view === 'chat' && (
          <footer className="bg-black/40 backdrop-blur-xl border-t border-white/10 p-4 md:p-6 shrink-0 z-20 flex justify-center">
            <form onSubmit={handleSendMessage} className="relative flex items-center group w-full max-w-4xl">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={isLimitReached ? "Daily limit reached. Come back tomorrow!" : `Message ${selectedCharacter?.name.split(',')[0]}...`}
                disabled={isTyping || isLimitReached}
                className="w-full bg-white/5 border border-white/10 text-white pl-5 md:pl-6 pr-14 md:pr-16 py-3.5 md:py-4 rounded-full focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all shadow-inner disabled:opacity-50 placeholder:text-slate-500 md:text-lg disabled:cursor-not-allowed"
              />
              <button 
                type="submit"
                disabled={!inputMessage.trim() || isTyping || isLimitReached}
                className="absolute right-1.5 md:right-2 bg-white text-black hover:bg-slate-200 p-2 md:p-2.5 rounded-full transition-all disabled:opacity-50 disabled:bg-white/20 disabled:text-white flex items-center justify-center h-10 w-10 md:h-12 md:w-12 shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:shadow-none disabled:cursor-not-allowed"
              >
                <Send size={20} className="ml-0.5" />
              </button>
            </form>
          </footer>
        )}
        
        {/* Scoped CSS for Scrollbar */}
        <style dangerouslySetInnerHTML={{__html: `
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        `}} />
      </div>

      {/* --- Floating Install App Button --- */}
      <button
        onClick={handleInstallClick}
        className="fixed top-6 right-6 z-50 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-full p-4 shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all hover:scale-110 active:scale-95 flex items-center justify-center group"
        title="Download / Install App"
      >
        <Download size={24} className="group-hover:-translate-y-1 transition-transform" />
      </button>

      {/* Manual Install Instructions Toast (For iOS/Safari) */}
      {showInstallPrompt && (
        <div className="fixed top-24 right-6 z-50 bg-black/80 backdrop-blur-md border border-white/10 text-white p-4 rounded-2xl shadow-2xl max-w-[280px] animate-in fade-in slide-in-from-top-4">
          <p className="text-sm font-bold mb-2 text-pink-300">Install Otaku Verse</p>
          <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4">
            <li><strong>iPhone/iOS:</strong> Tap the Share icon <span className="inline-block border border-slate-500 rounded px-1 mx-0.5">↑</span> at the bottom of Safari, then select <strong>"Add to Home Screen"</strong>.</li>
            <li><strong>Android/Chrome:</strong> Tap the Menu icon <span className="inline-block border border-slate-500 rounded px-1 mx-0.5">⋮</span> in the top right, then select <strong>"Install App"</strong>.</li>
          </ul>
          <button onClick={() => setShowInstallPrompt(false)} className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}