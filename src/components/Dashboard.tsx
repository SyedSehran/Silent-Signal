import { FormEvent, useEffect, useMemo, useState } from "react";
import { Contact, Note, SosLog, User } from "../types";
import { Plus, Search, Trash2, Shield, Settings as SettingsIcon, StickyNote, AlertCircle, History, MapPin, Mic, Menu, ChevronRight, Clock, CheckCircle2, RefreshCw, Copy, Sparkles, Wifi, WifiOff, Watch, Heart, Check, Info, Radio, Zap, Volume2, Key, Activity, MessageCircle, Navigation, Compass, PhoneCall } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { apiJson } from "../lib/api";
import SafeHavenMap from "./SafeHavenMap";
import FakeCallModal from "./FakeCallModal";

interface DashboardProps {
  user: User;
  isSOSActive: boolean;
  onStopSOS: () => void;
  safeWord: string;
  onSafeWordChange: (value: string) => void;
  aiEnabled: boolean;
  onAiEnabledChange: (value: boolean) => void;
  isOnline: boolean;
  latestLocation: { lat: number; lng: number } | null;
  micError?: string | null;
  watchConnected: "NONE" | "APPLE" | "SAMSUNG";
  onConnectWatch: (type: "NONE" | "APPLE" | "SAMSUNG") => void;
  onSimulateWatchStress: () => void;
}

interface AlertStatus { sms: boolean; email: boolean; }
interface ToastNotice { message: string; type: "success" | "error" | "info"; id: number; }

export default function Dashboard({
  user,
  isSOSActive,
  onStopSOS,
  safeWord,
  onSafeWordChange,
  aiEnabled,
  onAiEnabledChange,
  isOnline,
  latestLocation,
  micError,
  watchConnected,
  onConnectWatch,
  onSimulateWatchStress,
}: DashboardProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sosLogs, setSosLogs] = useState<SosLog[]>([]);
  const [activeTab, setActiveTab] = useState<"notes" | "safehavens" | "settings" | "logs">("notes");
  const [showFakeCall, setShowFakeCall] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showTriggersGuide, setShowTriggersGuide] = useState(false);
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const addToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  useEffect(() => { void Promise.all([fetchNotes(), fetchContacts(), fetchAlertStatus(), fetchLogs()]); }, [user.id]);
  useEffect(() => {
    if (activeTab !== "logs") return;
    void fetchLogs();
    if (isSOSActive) {
      const interval = setInterval(() => {
        void fetchLogs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, isSOSActive, user.id]);

  const fetchNotes = async () => setNotes(await apiJson<Note[]>("/api/notes").catch(() => []));
  const fetchContacts = async () => setContacts(await apiJson<Contact[]>("/api/contacts").catch(() => []));
  const fetchLogs = async () => setSosLogs(await apiJson<SosLog[]>("/api/sos/logs").catch(() => []));
  const fetchAlertStatus = async () => setAlertStatus(await apiJson<AlertStatus>("/api/alerts/status").catch(() => null));

  const filteredNotes = notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const latestShare = useMemo(() => sosLogs.find((log) => Boolean(log.share_token)), [sosLogs]);

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;
    setLoading(true);
    await apiJson("/api/notes", { method: "POST", body: JSON.stringify({ title: newNoteTitle, content: newNoteContent }) }).catch(console.error);
    setNewNoteTitle(""); setNewNoteContent(""); setLoading(false);
    addToast("Note saved to decoy workspace", "success");
    await fetchNotes();
  };

  const addContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    setLoading(true);
    try {
      await apiJson("/api/contacts", { method: "POST", body: JSON.stringify({ name: newContactName, phone: newContactPhone, email: newContactEmail || null }) });
      setNewContactName(""); setNewContactPhone(""); setNewContactEmail(""); 
      addToast(`Added ${newContactName} to trusted contacts`, "success");
      await fetchContacts();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to add contact", "error");
    } finally { setLoading(false); }
  };

  const deleteNote = async (id: number) => { 
    if (!window.confirm("Delete this note?")) return; 
    await apiJson(`/api/notes/${id}`, { method: "DELETE" }).catch(console.error); 
    addToast("Note deleted", "info");
    await fetchNotes(); 
  };
  
  const deleteContact = async (id: number) => { 
    if (!window.confirm("Delete this contact?")) return; 
    await apiJson(`/api/contacts/${id}`, { method: "DELETE" }).catch(console.error); 
    addToast("Contact removed", "info");
    await fetchContacts(); 
  };
  
  const copyEvidenceLink = async () => {
    if (!latestShare?.share_token) return;
    await navigator.clipboard.writeText(`${window.location.origin}/evidence/${latestShare.share_token}`);
    addToast("Evidence link copied to clipboard!", "success");
  };

  const generateIncidentReport = async () => {
    setReportLoading(true);
    const tokenParam = latestShare?.share_token || "latest";
    try {
      const data = await apiJson<{ report: string }>(`/api/ai/incident-report/${tokenParam}`);
      if (data?.report) {
        setReport(data.report);
        addToast("Factual incident summary generated!", "success");
      } else {
        addToast("Unable to generate incident report", "error");
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to generate report", "error");
    } finally {
      setReportLoading(false);
    }
  };

  const getNoteCategory = (title: string, index: number) => {
    const categories = [
      { name: "Work", color: "bg-blue-50 text-blue-700 border-blue-200" },
      { name: "Personal", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      { name: "Ideas", color: "bg-purple-50 text-purple-700 border-purple-200" },
      { name: "Errands", color: "bg-amber-50 text-amber-700 border-amber-200" },
    ];
    if (title.toLowerCase().includes("work") || title.toLowerCase().includes("deck")) return categories[0];
    if (title.toLowerCase().includes("errand") || title.toLowerCase().includes("grocer")) return categories[3];
    return categories[index % categories.length];
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-zinc-50 font-sans">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md text-sm font-semibold ${
                t.type === "success" ? "bg-zinc-900/95 text-white border-emerald-500/30 ring-1 ring-emerald-500/20" :
                t.type === "error" ? "bg-red-950/95 text-white border-red-500/30" :
                "bg-zinc-900/95 text-white border-zinc-700"
              }`}
            >
              {t.type === "success" && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              {t.type === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {t.type === "info" && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sidebar */}
      <motion.aside initial={false} animate={{ width: isSidebarOpen ? 280 : 80 }} className="bg-white border-r border-zinc-200 flex flex-col z-20 shadow-sm">
        <div className="p-4 flex items-center justify-between">
          {isSidebarOpen && <span className="font-bold text-zinc-400 text-[10px] uppercase tracking-widest">Workspace</span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors">{isSidebarOpen ? <Menu size={20} /> : <ChevronRight size={20} />}</button>
        </div>
        <nav className="flex-1 px-3 space-y-1.5">
          <SidebarItem icon={<StickyNote size={20} />} label="All Notes" active={activeTab === "notes"} onClick={() => setActiveTab("notes")} isOpen={isSidebarOpen} />
          <SidebarItem icon={<Compass size={20} />} label="Safe Havens" active={activeTab === "safehavens"} onClick={() => setActiveTab("safehavens")} isOpen={isSidebarOpen} />
          <SidebarItem icon={<SettingsIcon size={20} />} label="Vault Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} isOpen={isSidebarOpen} />
          <SidebarItem icon={<History size={20} />} label="Security Logs" active={activeTab === "logs"} onClick={() => setActiveTab("logs")} isOpen={isSidebarOpen} count={sosLogs.length || undefined} />
        </nav>
        <div className="p-4 border-t border-zinc-100">
          <div className={`flex items-center gap-3 ${isSidebarOpen ? "" : "justify-center"}`}>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-xs shadow-sm">{user.username[0].toUpperCase()}</div>
            {isSidebarOpen && (
              <div>
                <p className="text-sm font-bold text-zinc-900">{user.username}</p>
                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                  {isOnline ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-amber-500" />}
                  {isOnline ? "Realtime Sync" : "Offline Queue"}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Workspace Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          {activeTab === "safehavens" && (
            <button
              onClick={() => setShowFakeCall(true)}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-[11px] font-bold tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95 border border-zinc-800"
              title="Trigger believable incoming phone call distraction"
            >
              <PhoneCall size={13} className="text-emerald-400 animate-pulse" /> Fake Call
            </button>
          )}
          {isSOSActive && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full shadow-sm backdrop-blur-md">
              <RefreshCw size={12} className="text-emerald-600 animate-spin" />
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">{isOnline ? "Auto-saving notes" : "Saved locally"}</span>
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto p-8">
          <AnimatePresence mode="wait">
            {/* Notes Tab */}
            {activeTab === "notes" && (
              <motion.div key="notes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-serif font-bold text-zinc-900">My Notes</h2>
                    <p className="text-zinc-500 mt-1 text-sm">Organize your daily tasks, thoughts, and quick reminders.</p>
                  </div>
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-emerald-600 transition-colors" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search notes..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-full md:w-72 shadow-sm text-sm" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.4fr,0.8fr] gap-6">
                  <form onSubmit={addNote} className="glass-card rounded-[28px] border border-zinc-200/90 shadow-sm hover-lift overflow-hidden">
                    <div className="p-6 space-y-3">
                      <input 
                        type="text" 
                        value={newNoteTitle} 
                        onChange={(e) => setNewNoteTitle(e.target.value)} 
                        placeholder="Wednesday errand list" 
                        className="w-full text-2xl font-serif font-bold bg-transparent border-none outline-none placeholder:text-zinc-400 text-zinc-900 tracking-tight" 
                      />
                      <textarea 
                        value={newNoteContent} 
                        onChange={(e) => setNewNoteContent(e.target.value)} 
                        placeholder="Pick up dry cleaning at 6, confirm dinner reservation, send revised slide deck." 
                        className="w-full min-h-[100px] bg-transparent border-none outline-none resize-none placeholder:text-zinc-400 text-zinc-600 leading-relaxed text-sm" 
                      />
                    </div>
                    <div className="px-6 py-3.5 bg-zinc-50/80 border-t border-zinc-100 flex justify-between items-center">
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <button type="submit" disabled={loading} className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-xs active:scale-95">
                        <Plus size={16} />Save Note
                      </button>
                    </div>
                  </form>

                  <div className="bg-white rounded-[24px] p-6 border border-zinc-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-400">Workspace Summary</p>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <h3 className="text-2xl font-serif font-bold text-zinc-900">Personal Space</h3>
                      <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                        Keep your daily errands, meeting action items, and project drafts organized across all your devices.
                      </p>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3 text-sm pt-4 border-t border-zinc-100">
                      <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Notes</p>
                        <p className="text-lg font-bold text-zinc-900 mt-0.5">{notes.length}</p>
                      </div>
                      <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cloud Sync</p>
                        <p className="text-lg font-bold text-emerald-600 mt-0.5">{isOnline ? "Active" : "Local"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredNotes.map((note, index) => {
                    const category = getNoteCategory(note.title, index);
                    return (
                      <motion.div layout key={note.id} className="bg-white p-6 rounded-[24px] border border-zinc-200/90 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div>
                          <div className="flex justify-between items-start mb-3 gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${category.color}`}>
                                {category.name}
                              </span>
                            </div>
                            <button onClick={() => deleteNote(note.id)} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <h3 className="font-serif font-bold text-lg text-zinc-900 mb-2">{note.title}</h3>
                          <p className="text-zinc-500 text-sm line-clamp-4 leading-relaxed mb-6">{note.content}</p>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            <Clock size={12} />
                            {new Date(note.created_at).toLocaleDateString()}
                          </div>
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Safe Haven Radar Tab */}
            {activeTab === "safehavens" && (
              <motion.div key="safehavens" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <SafeHavenMap latestLocation={latestLocation} onTriggerFakeCall={() => setShowFakeCall(true)} />
              </motion.div>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-4xl font-serif font-bold text-zinc-900">Vault Settings</h2>
                    <p className="text-zinc-500 mt-1 text-sm">Manage emergency contacts, whispered trigger phrases, and security triggers.</p>
                  </div>
                  <button
                    onClick={() => setShowTriggersGuide(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <Info size={16} />
                    Covert Triggers Guide
                  </button>
                </div>

                {/* Covert Triggers Reference Modal */}
                <AnimatePresence>
                  {showTriggersGuide && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white p-6 rounded-[28px] max-w-lg w-full shadow-2xl border border-zinc-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-600" /> Active Covert Safety Triggers
                          </h3>
                          <button onClick={() => setShowTriggersGuide(false)} className="text-zinc-400 hover:text-zinc-700 text-sm font-bold p-1">✕</button>
                        </div>
                        <div className="space-y-3 pt-2 text-sm">
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-start gap-3">
                            <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-zinc-900">Duress PIN Login</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Logging in with your special Duress PIN opens the decoy workspace while immediately broadcasting live location and audio in stealth mode.</p>
                            </div>
                          </div>
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-start gap-3">
                            <Volume2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-zinc-900">Whispered Safe Word</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Speaking your configured safe word triggers local browser speech recognition and starts a disguised countdown.</p>
                            </div>
                          </div>
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-start gap-3">
                            <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-zinc-900">Rapid Shake Motion</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Shaking your device rapidly activates emergency protocol automatically via mobile motion sensors.</p>
                            </div>
                          </div>
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-start gap-3">
                            <Watch className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-zinc-900">Smartwatch Anxiety/Stress Spike</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Apple Watch or Galaxy Watch heart-rate spikes automatically initiate emergency confirmation.</p>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setShowTriggersGuide(false)} className="w-full py-2.5 bg-zinc-900 text-white font-bold rounded-xl text-sm mt-4">Close Guide</button>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Contacts Column */}
                  <div className="bg-white rounded-[24px] border border-zinc-200 p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-xl text-zinc-900">Trusted Contacts</h3>
                    <form onSubmit={addContact} className="space-y-3">
                      <input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Contact name" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" required />
                      <input value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} placeholder="Phone number" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" required />
                      <input value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="Email address" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" />
                      <button type="submit" disabled={loading} className="w-full bg-zinc-900 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all disabled:opacity-50 shadow-sm active:scale-98">Add Contact</button>
                    </form>
                    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-100 overflow-hidden">
                      {contacts.length === 0 ? <div className="p-8 text-center text-zinc-400 italic text-sm">No trusted contacts added yet.</div> : contacts.map((contact) => (
                        <div key={contact.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">{contact.name}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{contact.phone}{contact.email ? ` • ${contact.email}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const cleanPhone = contact.phone.replace(/[^0-9]/g, "");
                              const waText = encodeURIComponent(
                                `🚨 EMERGENCY ALERT — ${user.username} has set you as a trusted emergency contact on Silent Signal.\n\n` +
                                `In an emergency, live location and recorded evidence links will be shared with you automatically.\n` +
                                (latestLocation ? `📍 Current Location: https://maps.google.com/?q=${latestLocation.lat},${latestLocation.lng}` : "")
                              );
                              return (
                                <a
                                  href={`https://wa.me/${cleanPhone}?text=${waText}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border border-emerald-200 shadow-sm"
                                  title="Send WhatsApp emergency link"
                                >
                                  <MessageCircle size={14} /> WhatsApp
                                </a>
                              );
                            })()}
                            <button onClick={() => deleteContact(contact.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trigger Controls & Status */}
                  <div className="space-y-6">
                    <div className="bg-white rounded-[24px] border border-zinc-200 p-6 shadow-sm space-y-4">
                      <h3 className="font-bold text-xl text-zinc-900">Trigger Controls</h3>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Whispered safe word</label>
                        <input value={safeWord} onChange={(e) => onSafeWordChange(e.target.value)} placeholder="Example: help me now" className="mt-2 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" />
                        <p className="text-xs text-zinc-500 mt-2">Exact-match speech detection stays local and starts the disguised countdown.</p>
                      </div>
                      <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4 bg-zinc-50">
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">Precision-first AI suggestions</p>
                          <p className="text-xs text-zinc-500 mt-0.5">Only suggests countdowns after multiple signals agree. Never auto-fires SOS.</p>
                        </div>
                        <button type="button" onClick={() => onAiEnabledChange(!aiEnabled)} className={`w-14 h-8 rounded-full transition-colors ${aiEnabled ? "bg-emerald-500" : "bg-zinc-300"}`}>
                          <span className={`block w-6 h-6 bg-white rounded-full transition-transform ${aiEnabled ? "translate-x-7" : "translate-x-1"}`} />
                        </button>
                      </label>
                    </div>

                    <div className="bg-white rounded-[24px] border border-zinc-200 p-6 shadow-sm space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-700">
                          <Watch size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-zinc-900">Wearable Integration</h3>
                          <p className="text-xs text-zinc-500">Apple Watch / Samsung Galaxy Watch stress spike auto-SOS.</p>
                        </div>
                      </div>

                      {watchConnected === "NONE" ? (
                        <div className="space-y-3 pt-2">
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            Connect your smartwatch to automatically trigger a 5-second countdown when high stress or anxiety is detected.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => onConnectWatch("APPLE")} className="flex items-center justify-center gap-2 py-2.5 border border-zinc-200 hover:border-zinc-900 rounded-xl text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition-all">
                              Apple Watch
                            </button>
                            <button type="button" onClick={() => onConnectWatch("SAMSUNG")} className="flex items-center justify-center gap-2 py-2.5 border border-zinc-200 hover:border-zinc-900 rounded-xl text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition-all">
                              Samsung Watch
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                            <div>
                              <p className="font-bold text-sm text-zinc-900">{watchConnected === "APPLE" ? "Apple Watch Series 9" : "Galaxy Watch 6"}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs text-zinc-500 font-medium">Monitoring Stress Level</span>
                              </div>
                            </div>
                            <button type="button" onClick={() => onConnectWatch("NONE")} className="text-xs text-red-600 hover:underline font-semibold">
                              Disconnect
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-zinc-50/50 p-3 rounded-xl border border-zinc-100 text-center">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Heart Rate</p>
                              <p className="text-lg font-bold text-zinc-900 mt-1 flex items-center justify-center gap-1">
                                <Heart className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
                                74 bpm
                              </p>
                            </div>
                            <div className="bg-zinc-50/50 p-3 rounded-xl border border-zinc-100 text-center">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Stress Level</p>
                              <p className="text-lg font-bold text-zinc-900 mt-1">Low (18%)</p>
                            </div>
                          </div>

                          <button type="button" onClick={onSimulateWatchStress} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-3 rounded-xl font-bold text-xs transition-all">
                            Simulate Stress/Anxiety Spike
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-900 p-6 rounded-[24px] text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2">
                          <Radio className="w-4 h-4 animate-pulse" /> Delivery Channels
                        </h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Active
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                        <StatusPill label="SMS Alert" value={alertStatus?.sms ? "Ready" : "Off"} active={Boolean(alertStatus?.sms)} />
                        <StatusPill label="Email Alert" value={alertStatus?.email ? "Ready" : "Off"} active={Boolean(alertStatus?.email)} />
                        <StatusPill label="Network" value={isOnline ? "Online" : "Queued"} active={isOnline} />
                        <StatusPill label="GPS Mode" value={latestLocation ? "Tracking" : "Waiting"} active={Boolean(latestLocation)} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Security Logs Tab */}
            {activeTab === "logs" && (
              <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                {micError && (
                  <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-3xl flex items-start gap-4 shadow-sm">
                    <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-base text-red-950">Audio Recording Blocked</h4>
                      <p className="text-sm mt-1 text-red-800">{micError}</p>
                      <p className="text-xs mt-2 text-red-600 font-medium">To enable audio evidence: Ensure you have allowed microphone permissions, and are accessing the app over a secure connection (like localhost or https://).</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-serif font-bold text-zinc-900">Security Logs</h2>
                    <p className="text-zinc-500 mt-1 text-sm">Encrypted evidence sessions, offline-replayed GPS points, and rolling audio chunks.</p>
                  </div>
                  {isSOSActive && (
                    <button onClick={() => setShowStopConfirm(true)} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2 text-sm shadow-md active:scale-95">
                      <Shield size={18} />Stop SOS Protocol
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {showStopConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white p-8 rounded-[32px] max-w-md w-full shadow-2xl border border-zinc-200">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6">
                          <AlertCircle size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-zinc-900 mb-2">Deactivate SOS?</h3>
                        <p className="text-zinc-500 mb-8 leading-relaxed text-sm">This stops live tracking, chunked audio recording, and queued sync retries.</p>
                        <div className="flex gap-3">
                          <button onClick={() => setShowStopConfirm(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold text-sm">Cancel</button>
                          <button onClick={() => { onStopSOS(); setShowStopConfirm(false); }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm">Stop Protocol</button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-6">
                  <div className="space-y-4">
                    {sosLogs.length === 0 ? (
                      <div className="bg-white p-20 rounded-[32px] border border-zinc-200 text-center space-y-4 shadow-sm">
                        <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                          <History size={32} />
                        </div>
                        <p className="text-zinc-400 italic text-sm">No security logs recorded yet.</p>
                      </div>
                    ) : (
                      sosLogs.map((log) => (
                        <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="bg-white p-6 rounded-[24px] border border-zinc-200 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                          <div className="flex items-center gap-4">
                            {log.status === "AUDIO_CHUNK" ? (
                              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-red-50 text-red-600 border border-red-100 shrink-0">
                                <Mic size={24} />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
                                <MapPin size={24} />
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-zinc-900 text-lg flex items-center gap-2">
                                {log.status === "AUDIO_CHUNK" ? "Voice Evidence Captured" : "Location Ping Recorded"}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <div className="flex items-center gap-1 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                  <Clock size={12} />
                                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.created_at))}
                                </div>
                                {log.trigger_method && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200">
                                    {log.trigger_method.replaceAll("_", " ")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 min-w-0">
                            {log.status === "AUDIO_CHUNK" && log.audio_url ? (
                              <div className="bg-zinc-900 p-3 rounded-2xl border border-zinc-800 min-w-[240px] max-w-[360px] shadow-sm flex items-center gap-3">
                                <audio controls src={log.audio_url} className="w-full accent-emerald-500 h-9" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-200/80">
                                <MapPin size={14} className="text-blue-500" />
                                <span className="text-sm font-mono font-bold text-zinc-700">
                                  {log.latitude != null && log.longitude != null ? `${log.latitude.toFixed(5)}, ${log.longitude.toFixed(5)}` : "Location unavailable"}
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white rounded-[24px] border border-zinc-200 p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Trusted Contact Link</p>
                          <h3 className="text-xl font-bold text-zinc-900 mt-1">Auto-expiring Evidence</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {latestShare?.share_token && (() => {
                            const shareUrl = window.location.origin + "/evidence/" + latestShare.share_token;
                            const waUrl = "https://wa.me/?text=" + encodeURIComponent(
                              "🚨 EMERGENCY ALERT — SILENT SIGNAL\n\n" +
                              user.username + " triggered a silent emergency alert.\n\n" +
                              "🎙️ Access Live Evidence & Audio: " + shareUrl + "\n\n" +
                              "Please check on them or contact emergency services immediately."
                            );
                            return (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                                title="Share evidence directly via WhatsApp"
                              >
                                <MessageCircle size={16} /> WhatsApp
                              </a>
                            );
                          })()}
                          <button onClick={copyEvidenceLink} disabled={!latestShare?.share_token} className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white disabled:bg-zinc-200 transition-colors shadow-sm">
                            <Copy size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 px-4 py-3 text-sm font-mono text-zinc-600 break-all select-all">
                        {latestShare?.share_token ? window.location.origin + "/evidence/" + latestShare.share_token : "No active evidence session yet."}
                      </div>
                      {latestShare?.share_expires_at && <p className="text-xs text-zinc-500">Expires {new Date(latestShare.share_expires_at).toLocaleString()}</p>}
                    </div>

                    <div className="bg-white rounded-[24px] border border-zinc-200 p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">AI Report</p>
                          <h3 className="text-xl font-bold text-zinc-900 mt-1">Incident Summary Draft</h3>
                        </div>
                        <button onClick={generateIncidentReport} disabled={reportLoading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-sm">
                          <Sparkles size={16} />
                          {reportLoading ? "Generating..." : "Generate"}
                        </button>
                      </div>
                      <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 p-4 text-sm text-zinc-600 whitespace-pre-wrap min-h-40 leading-relaxed font-sans">
                        {report || "Generate a factual plain-English incident summary from the evidence timeline."}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Fake Call Audio Distraction Modal */}
      <FakeCallModal
        isOpen={showFakeCall}
        onClose={() => setShowFakeCall(false)}
        onEscalateSOS={() => {
          setShowFakeCall(false);
          setShowStopConfirm(false);
          addToast("Covert SOS Triggered from Fake Call!", "error");
        }}
      />
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, isOpen, count }: any) {
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all relative group ${
        active ? "bg-emerald-500/10 text-emerald-700 font-bold" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      <div className={`${active ? "text-emerald-600" : "text-zinc-400 group-hover:text-zinc-600"} transition-colors`}>{icon}</div>
      {isOpen && <span className="text-sm flex-1 text-left">{label}</span>}
      {isOpen && count !== undefined && <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{count}</span>}
      {active && <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full" />}
    </button>
  );
}

function StatusPill({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-zinc-400 text-xs font-medium">{label}</p>
        <span className={`w-2 h-2 rounded-full ${active ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
      </div>
      <p className="text-base font-bold mt-1 text-emerald-300">{value}</p>
    </div>
  );
}
