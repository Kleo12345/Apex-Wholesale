import React, { useState, useEffect } from 'react';
import { Search, Flame, Car, Settings, RefreshCw, Zap, Cpu, Sparkles, ExternalLink, Star, Bell, X, Home } from 'lucide-react';
import './App.css';

const Badge = ({ type, children }) => {
  const map = {
    blue: 'badge-blue',
    yellow: 'badge-yellow',
    orange: 'badge-orange',
    green: 'badge-green',
    gray: 'badge-gray'
  };
  return <span className={`badge ${map[type]}`}>{children}</span>;
};

const nicheConfigs = {
  cars: {
    icon: Car,
    label: 'Vehicle',
    plural: 'Vehicles',
    matchTitle: 'Suggested Vehicles',
    addLabel: 'Add Vehicle',
    searchPlaceholder: 'Car model or keyword...',
    imageDefault: '🚗',
    matchFields: ['make', 'model']
  },
  houses: {
    icon: Home,
    label: 'Property',
    plural: 'Properties',
    matchTitle: 'Suggested Properties',
    addLabel: 'Add Property',
    searchPlaceholder: 'Location or property type...',
    imageDefault: '🏠',
    matchFields: ['type', 'location']
  }
};

// Lead Detail Modal Component
const LeadDetailModal = ({ lead, onClose, onMatch }) => {
  if (!lead) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel lead-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Badge type={lead.layer}>{lead.layer.toUpperCase()}</Badge>
            <span className="text-secondary text-sm">{lead.source} • {lead.time}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <h2 className="text-h2 mb-4">{lead.title}</h2>
        <div className="scroll-content custom-scrollbar mb-6 modal-scroll-area">
          <p className="text-body whitespace-pre-wrap">{lead.content}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="glass-panel p-3">
            <p className="text-micro opacity-60">BUDGET</p>
            <p className="text-h3 text-green-400">{lead.budget}</p>
          </div>
          <div className="glass-panel p-3">
            <p className="text-micro opacity-60">LOCATION</p>
            <p className="text-h3">{lead.location}</p>
          </div>
        </div>

        {lead.aiAnalysis && (
          <div className="glass-panel p-4 mb-8 border-accent-purple">
            <h3 className="text-h3 mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-purple-400" />
              AI Insights
            </h3>
            <div className="flex flex-col gap-3">
              {lead.aiAnalysis.makeModel && (
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-secondary">Interested In</span>
                  <span className="text-blue-400 font-semibold">{lead.aiAnalysis.makeModel.join(', ')}</span>
                </div>
              )}
              {lead.aiAnalysis.propertyType && (
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-secondary">Property Type</span>
                  <span className="text-purple-400 font-semibold">{lead.aiAnalysis.propertyType}</span>
                </div>
              )}
              {lead.aiAnalysis.bedsBaths && (
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-secondary">Configuration</span>
                  <span>{lead.aiAnalysis.bedsBaths}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button className="btn btn-secondary flex-1" onClick={onClose}>Close</button>
          <button className="btn btn-primary flex-1 flex items-center justify-center gap-2" onClick={() => onMatch(lead)}>
            <Zap size={16} /> Check Matches
          </button>
        </div>
      </div>
    </div>
  );
};

const DemandCard = ({ lead, onClick, isActive, onAnalyzeLocal, onAnalyzeGemini, isAnalyzing, onToggleSave, isSaved }) => (

  <div 
    className={`glass-panel lead-card ${isActive ? 'active' : ''}`}
    onClick={() => onClick(lead)}
  >
    <button 
      className={`star-btn ${isSaved ? 'active' : ''}`} 
      onClick={(e) => { e.stopPropagation(); onToggleSave(lead); }}
      title={isSaved ? "Remove from Tracked" : "Track this Buyer"}
    >
      <Star size={16} fill={isSaved ? "#f59e0b" : "none"} color={isSaved ? "#f59e0b" : "currentColor"} />
    </button>

    <div className="lead-header">
      <div className="lead-badges">
        {lead.analyzedBy ? (
          <Badge type={lead.layer}>{lead.layer.toUpperCase()} INTENT</Badge>
        ) : (
          <Badge type="gray">UNANALYZED</Badge>
        )}
        <span className="text-micro text-secondary source-label">
          {lead.source === 'craigslist' && '🟢 Craigslist'}
          {lead.source === 'reddit' && '🟠 Reddit'}
          {lead.source === 'facebook' && '🔵 Facebook'}
        </span>
      </div>
      <span className="text-small">{lead.time}</span>
    </div>
    
    <h3 className="text-h3 lead-title">{lead.title}</h3>
    <p className="text-body lead-content">{lead.content}</p>
    
    <div className="lead-details">
      <span className="detail-item text-green-400">💰 {lead.budget}</span>
      <span className="detail-item">📍 {lead.location}</span>
      {lead.aiAnalysis && lead.aiAnalysis.makeModel && (
        <span className="detail-item text-blue-400">🚗 {lead.aiAnalysis.makeModel.join(', ')}</span>
      )}
      {lead.aiAnalysis && lead.aiAnalysis.propertyType && (
        <span className="detail-item text-purple-400">🏠 {lead.aiAnalysis.propertyType} ({lead.aiAnalysis.bedsBaths})</span>
      )}
    </div>

    <div className="lead-actions" onClick={e => e.stopPropagation()}>
      <button 
        className="btn btn-secondary action-btn local-ai" 
        onClick={() => onAnalyzeLocal(lead)}
        disabled={isAnalyzing}
      >
        <Cpu size={14} /> Local AI
      </button>
      <button 
        className="btn btn-secondary action-btn gemini-ai" 
        onClick={() => onAnalyzeGemini(lead)}
        disabled={isAnalyzing}
      >
        <Sparkles size={14} /> Gemini AI
      </button>
      {lead.url && (
        <a 
          href={lead.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn btn-secondary action-btn source-btn"
          title="View Original Post"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
    
    {lead.analyzedBy && (
      <div className="analysis-tag">Analyzed by {lead.analyzedBy}</div>
    )}
  </div>
);

const SupplyCard = ({ item, onTrack, niche }) => {
  const ConfigIcon = nicheConfigs[niche].icon;
  return (
    <div className="glass-panel supply-card animate-fade-in">
      <div className="car-image-placeholder">{item.image}</div>
      <div className="car-details">
        <div className="car-header">
          <h4 className="text-h3">{item.year || ''} {item.make || item.type} {item.model || ''}</h4>
          <span className="text-h3 text-green-400">{item.price}</span>
        </div>
        <div className="car-meta text-small">
          {item.mileage && <span>{item.mileage} miles</span>}
          {item.sqft && <span>{item.sqft} sqft • {item.beds}b/{item.baths}ba</span>}
          <span>•</span>
          <span>📍 {item.location}</span>
        </div>
        <div className="flex gap-2">
          <a 
            href={item.url || '#'} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-secondary flex-1 view-btn text-center"
          >
            View Listing ↗
          </a>
          <button 
            className="btn btn-secondary action-btn" 
            onClick={() => onTrack(item)}
            title={`Save to Tracked ${nicheConfigs[niche].plural}`}
          >
            <ConfigIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [leads, setLeads] = useState([]);
  const [supply, setSupply] = useState([]);
  const [activeLead, setActiveLead] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [selectedIntent, setSelectedIntent] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState('demand'); // 'demand', 'supply', or 'saved'
  const [savedLeads, setSavedLeads] = useState([]);
  const [manualLeadText, setManualLeadText] = useState('');
  const [showAddCarModal, setShowAddCarModal] = useState(false);
  const [showLeadDetailModal, setShowLeadDetailModal] = useState(false);
  const [selectedLeadForModal, setSelectedLeadForModal] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notifiedMatches, setNotifiedMatches] = useState(new Set());
  const [newCarForm, setNewCarForm] = useState({
    make: '', model: '', year: '', price: '', mileage: '', location: '', image: '🚗',
    type: '', beds: '', baths: '', sqft: ''
  });
  const [activeNiche, setActiveNiche] = useState('cars');
  const [monitoredSubreddits, setMonitoredSubreddits] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [newBlacklistKeyword, setNewBlacklistKeyword] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userSettings, setUserSettings] = useState({
    telegramToken: '',
    telegramChatId: '',
    matchAlerts: true
  });

  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const leadsRes = await fetch(`/api/leads?niche=${activeNiche}`);
      const responseData = await leadsRes.json();
      if (responseData.error) throw new Error(responseData.error);
      setLeads(responseData.leads || []);
      
      // Log debug info if present
      if (responseData.debug) {
        console.log('Backend Lead Fetch Report:', responseData.debug);
      }
        
      const supplyRes = await fetch(`/api/supply?niche=${activeNiche}`);
      const supplyData = await supplyRes.json();
      setSupply(supplyData);
  
      const savedRes = await fetch(`/api/saved-leads`);
      const savedData = await savedRes.json();
      setSavedLeads(savedData);
  
      const settingsRes = await fetch('/api/settings');
      const settingsData = await settingsRes.json();
      if (settingsData.niches?.[activeNiche]) setMonitoredSubreddits(settingsData.niches[activeNiche].subreddits);
      if (settingsData.blacklist) setBlacklist(settingsData.blacklist);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5 * 60 * 1000); // Poll every 5 mins
    return () => clearInterval(interval);
  }, [activeNiche]);

  // Unified Matching Logic Helper
  const getMatchesForLead = (lead, supplyList) => {
    const keywords = (lead.aiAnalysis?.makeModel && lead.aiAnalysis.makeModel.length > 0) ? lead.aiAnalysis.makeModel : 
                     (lead.aiAnalysis?.propertyType ? [lead.aiAnalysis.propertyType] : 
                     (lead.matchKeywords || []));
    
    if (keywords.length === 0) return [];

    return supplyList.filter(item => {
      return keywords.some(kw => {
        const lowerKw = kw.toLowerCase();
        return (item.make?.toLowerCase()?.includes(lowerKw)) || 
               (item.model?.toLowerCase()?.includes(lowerKw)) ||
               (item.type?.toLowerCase()?.includes(lowerKw)) ||
               (item.location?.toLowerCase()?.includes(lowerKw));
      });
    });
  };

  // Calculate all matches for the global feed
  const allMatches = leads.flatMap(lead => {
    const leadMatches = getMatchesForLead(lead, supply);
    return leadMatches.map(item => ({ ...item, matchingLead: lead, matchId: `${lead.id}-${item.id}` }));
  });

  const handleGeneratePitch = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 1500);
  };

  // Automated Match Engine (Notifications)
  useEffect(() => {
    if (leads.length === 0 || supply.length === 0) return;

    leads.forEach(lead => {
      const matches = getMatchesForLead(lead, supply);
      
      matches.forEach(item => {
        const matchId = `${lead.id}-${item.id}`;
        if (notifiedMatches.has(matchId)) return;

        // Record that we found this match
        setNotifiedMatches(prev => new Set(prev).add(matchId));

        const config = nicheConfigs[activeNiche];
        // Create notification
        const newNotification = {
          id: Date.now() + Math.random(),
          title: 'Potential Match Found!',
          message: `A new lead might be interested in your ${item.year || ''} ${item.make || item.type} ${item.model || ''}.`,
          leadId: lead.id
        };

        setNotifications(prev => [...prev, newNotification]);

          // Trigger Telegram Notification via Backend
          fetch('/api/notify/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: newNotification.title,
              message: newNotification.message,
              leadId: newNotification.leadId,
              token: userSettings.telegramToken,
              chatId: userSettings.telegramChatId
            })
          }).catch(err => console.error('Failed to trigger Telegram notification:', err));

          // Auto-dismiss after 6 seconds
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
          }, 6000);
      });
    });
  }, [leads, supply, notifiedMatches]);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleAnalyze = async (lead, type) => {
    setAnalyzingId(lead.id);
    const endpoint = type === 'gemini' ? '/api/analyze/gemini' : '/api/analyze/local';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lead.title + '\n' + lead.content, niche: activeNiche })
      });
      
      const aiData = await response.json();
      if (aiData.error) throw new Error(aiData.error);
      
      // Update the lead with AI results
      const updatedLeads = leads.map(l => {
        if (l.id === lead.id) {
          const updatedLead = {
            ...l,
            analyzedBy: type === 'gemini' ? 'Gemini 1.5' : 'Llama 3 (Local)',
            layer: aiData.intentLayer.toLowerCase(),
            budget: aiData.budget ? `$${aiData.budget}` : l.budget,
            aiAnalysis: aiData
          };
          if (activeLead && activeLead.id === lead.id) setActiveLead(updatedLead);
          return updatedLead;
        }
        return l;
      });
      
      setLeads(updatedLeads);
      
      // PERSIST ANALYSIS TO SERVER
      const updatedLead = updatedLeads.find(l => l.id === lead.id);
      fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedLead)
      });
    } catch (err) {
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const filteredLeads = leads.filter(lead => {
    // Keyword search
    const query = searchQuery.toLowerCase();
    const matchesQuery = !searchQuery || 
      lead.title?.toLowerCase()?.includes(query) || 
      lead.content?.toLowerCase()?.includes(query) ||
      (lead.aiAnalysis?.makeModel?.some(m => m?.toLowerCase()?.includes(query)));

    // Location search
    const locQuery = locationQuery.toLowerCase();
    const matchesLocation = !locationQuery || 
      lead.location?.toLowerCase()?.includes(locQuery) ||
      lead.title?.toLowerCase()?.includes(locQuery) ||
      lead.content?.toLowerCase()?.includes(locQuery);

    // Intent filter
    const matchesIntent = selectedIntent === 'all' || lead.layer === selectedIntent;

    // Budget filter (rough parsing)
    const leadBudget = parseInt(lead.budget.replace(/[^0-9]/g, '')) || 0;
    const minB = parseInt(minBudget) || 0;
    const maxB = parseInt(maxBudget) || Infinity;
    const matchesBudget = (!minBudget || leadBudget >= minB) && (!maxBudget || leadBudget <= maxB || leadBudget === 0);

    return matchesQuery && matchesLocation && matchesIntent && matchesBudget;
  });



  const handleTrackItem = async (item) => {
    if (!supply.some(c => c.id === item.id)) {
      setSupply([...supply, item]);
      fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, niche: activeNiche })
      });
      alert(`${item.make || item.type} added to your tracked ${nicheConfigs[activeNiche].plural}!`);
    }
  };

  const handleManualImport = () => {
    if (!manualLeadText.trim()) return;
    
    const newLead = {
      id: `manual-${Date.now()}`,
      source: 'manual',
      layer: 'blue',
      title: 'Manual Import',
      content: manualLeadText,
      budget: 'Unknown',
      location: 'Manual Entry',
      time: 'Just now',
      matchKeywords: [],
      analyzedBy: null,
      aiAnalysis: null
    };

    setLeads([newLead, ...leads]);
    setManualLeadText('');
    setActiveLead(newLead);
  };

  const handleToggleSaveLead = (lead) => {
    const isCurrentlySaved = savedLeads.some(l => l.id === lead.id);
    if (isCurrentlySaved) {
      setSavedLeads(savedLeads.filter(l => l.id !== lead.id));
    } else {
      setSavedLeads([...savedLeads, lead]);
    }

    fetch('/api/saved-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    });
  };

  const handleAddManualItem = (e) => {
    e.preventDefault();
    if (activeNiche === 'cars' && (!newCarForm.make || !newCarForm.model)) return;
    if (activeNiche === 'houses' && !newCarForm.type) return;
    
    const newItem = {
      ...newCarForm,
      niche: activeNiche
    };
    
    fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    })
    .then(res => res.json())
    .then(data => {
      setSupply([data.item, ...supply]);
      setShowAddCarModal(false);
      setNewCarForm({ make: '', model: '', year: '', price: '', mileage: '', location: '', image: nicheConfigs[activeNiche].imageDefault });
    });
  };

  const handleAddSubreddit = async (e) => {
    e.preventDefault();
    if (!newSubreddit.trim()) return;
    
    const sub = newSubreddit.trim().replace(/^r\//, '');
    if (monitoredSubreddits.includes(sub)) {
      setNewSubreddit('');
      return;
    }

    const updatedSubs = [...monitoredSubreddits, sub];
    setMonitoredSubreddits(updatedSubs);
    setNewSubreddit('');
    saveSubreddits(updatedSubs);
  };

  const handleRemoveSubreddit = (sub) => {
    const updatedSubs = monitoredSubreddits.filter(s => s !== sub);
    setMonitoredSubreddits(updatedSubs);
    saveSubreddits(updatedSubs);
  };

  const saveSubreddits = async (subs) => {
    setIsSavingSettings(true);
    try {
      const settingsResponse = await fetch('/api/settings');
      const currentSettings = await settingsResponse.json();
      
      const newSettings = {
        ...currentSettings,
        niches: {
          ...currentSettings.niches,
          [activeNiche]: { subreddits: subs }
        }
      };

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error('Failed to save subreddits:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddBlacklistKeyword = async (e) => {
    e.preventDefault();
    if (!newBlacklistKeyword.trim()) return;
    
    const kw = newBlacklistKeyword.trim().toLowerCase();
    if (blacklist.includes(kw)) {
      setNewBlacklistKeyword('');
      return;
    }

    const updatedBlacklist = [...blacklist, kw];
    setBlacklist(updatedBlacklist);
    setNewBlacklistKeyword('');
    saveBlacklist(updatedBlacklist);
  };

  const handleRemoveBlacklistKeyword = (kw) => {
    const updatedBlacklist = blacklist.filter(k => k !== kw);
    setBlacklist(updatedBlacklist);
    saveBlacklist(updatedBlacklist);
  };

  const saveBlacklist = async (bl) => {
    setIsSavingSettings(true);
    try {
      const settingsResponse = await fetch('/api/settings');
      const currentSettings = await settingsResponse.json();
      
      const newSettings = {
        ...currentSettings,
        blacklist: bl
      };

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error('Failed to save blacklist:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const leadsToShow = filteredLeads;

  return (
    <div className="dashboard-layout">
      
      {/* SIDEBAR */}
      <nav className="sidebar">
          <div className="logo-icon">
            <Flame size={20} color="white" />
          </div>
          <div className="niche-selector">
            <div 
              className={`niche-btn ${activeNiche === 'cars' ? 'active' : ''}`}
              onClick={() => setActiveNiche('cars')}
              title="Automotive Niche"
            >
              <Car size={18} />
            </div>
            <div 
              className={`niche-btn ${activeNiche === 'houses' ? 'active' : ''}`}
              onClick={() => setActiveNiche('houses')}
              title="Real Estate Niche"
            >
              <Home size={18} />
            </div>
          </div>
          <div className="nav-items">
          <div 
            className={`nav-item ${activeTab === 'demand' ? 'active' : ''}`}
            onClick={() => setActiveTab('demand')}
            title="Live Feed"
          >
            <Search size={22} />
          </div>
          <div 
            className={`nav-item ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
            title="Match Engine"
          >
            <Zap size={22} />
          </div>
          <div 
            className={`nav-item ${activeTab === 'supply' ? 'active' : ''}`}
            onClick={() => setActiveTab('supply')}
            title={`Tracked ${nicheConfigs[activeNiche].plural}`}
          >
            {React.createElement(nicheConfigs[activeNiche].icon, { size: 22 })}
          </div>
          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            <Settings size={22} />
          </div>
        </div>
      </nav>

      {activeTab === 'demand' && (
        <div className="flex-1 scroll-content custom-scrollbar p-content">
          <header className="column-header mb-6 flex-col items-stretch gap-4 bg-transparent border-none p-0">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-h2">Live Feed</h1>
                <p className="text-small">
                  {isLoading ? 'Fetching fresh leads...' : `${leadsToShow.length} leads found across monitored subreddits`}
                </p>
                {error && <p className="text-micro text-red-400 mt-1">⚠️ {error}</p>}
              </div>
              <button 
                className={`icon-btn ${isLoading ? 'animate-spin' : ''}`} 
                onClick={fetchAllData}
                disabled={isLoading}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            
            <div className="search-bar">
              <Search size={16} className="text-secondary" />
              <input 
                type="text" 
                placeholder={nicheConfigs[activeNiche].searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="manual-import-box">
              <textarea 
                placeholder="Paste a link or text from FB/Craigslist to analyze it..."
                value={manualLeadText}
                onChange={e => setManualLeadText(e.target.value)}
                className="manual-input"
              />
              <button className="btn btn-primary import-btn" onClick={handleManualImport}>
                Import & Analyze
              </button>
            </div>
          </header>

          <div className="feed-grid">
            {leadsToShow.map(lead => (
              <DemandCard 
                key={lead.id} 
                lead={lead} 
                isActive={activeLead?.id === lead.id}
                onClick={(l) => {
                  setSelectedLeadForModal(l);
                  setShowLeadDetailModal(true);
                }}
                onAnalyzeLocal={(l) => handleAnalyze(l, 'local')}
                onAnalyzeGemini={(l) => handleAnalyze(l, 'gemini')}
                isAnalyzing={analyzingId === lead.id}
                onToggleSave={handleToggleSaveLead}
                isSaved={savedLeads.some(sl => sl.id === lead.id)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'matches' && (
        <div className="flex-1 scroll-content custom-scrollbar p-content">
          <header className="column-header transparent mb-8 p-0">
            <div>
              <h1 className="text-h2">Match Engine</h1>
              <p className="text-small">Found {allMatches.length} deal opportunities for your tracked {nicheConfigs[activeNiche].plural}.</p>
            </div>
          </header>

          {allMatches.length > 0 ? (
            <div className="feed-grid">
              {allMatches.map(match => (
                <div key={match.matchId} className="glass-panel supply-card animate-fade-in flex-col items-stretch" style={{ padding: '16px', gap: '16px' }}>
                  <div className="flex items-center gap-4">
                    <div className="car-image-placeholder">{match.image}</div>
                    <div className="flex-1">
                      <h4 className="text-h3">{match.year || ''} {match.make || match.type} {match.model || ''}</h4>
                      <p className="text-green-400 font-semibold">{match.price}</p>
                    </div>
                  </div>

                  <div className="match-lead-info glass-panel">
                    <p className="text-micro text-accent-blue mb-1">MATCHING BUYER</p>
                    <h5 className="text-body text-sm font-semibold mb-1">{match.matchingLead.title}</h5>
                    <p className="text-small italic truncate">"{match.matchingLead.content}"</p>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      className="btn btn-primary flex-1" 
                      onClick={() => {
                        setSelectedLeadForModal(match.matchingLead);
                        setShowLeadDetailModal(true);
                      }}
                    >
                      View Details
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => {
                        setActiveLead(match.matchingLead);
                        handleGeneratePitch();
                      }}
                      title="Generate Pitch"
                    >
                      <Zap size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: '100px' }}>
              <Zap size={48} opacity={0.2} />
              <p>No matches found yet. Try adding more items to your inventory or analyzing more leads!</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'supply' && (
        <div className="inventory-view flex-1 scroll-content custom-scrollbar p-content">
          <header className="column-header transparent mb-8 p-0">
            <div>
              <h1 className="text-h2">Tracked Items</h1>
              <p className="text-small">Monitoring {savedLeads.length} buyers and {supply.length} listings.</p>
            </div>
          </header>

          <div className="inventory-sections">
            {/* SAVED BUYERS SECTION */}
            <section className="inventory-section mb-12">
              <h3 className="text-h3 mb-4 flex items-center gap-2">
                <Star size={18} fill="#f59e0b" color="#f59e0b" />
                Tracked Buyers ({savedLeads.length})
              </h3>
              {savedLeads.length > 0 ? (
                <div className="feed-grid">
                  {savedLeads.map(lead => (
                    <DemandCard 
                      key={lead.id} 
                      lead={lead} 
                      isActive={false}
                      onClick={setActiveLead}
                      onAnalyzeLocal={(l) => handleAnalyze(l, 'local')}
                      onAnalyzeGemini={(l) => handleAnalyze(l, 'gemini')}
                      isAnalyzing={analyzingId === lead.id}
                      onToggleSave={handleToggleSaveLead}
                      isSaved={true}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-small italic opacity-60">No buyers tracked yet. Star them in the Live Feed!</p>
              )}
            </section>

            {/* TRACKED VEHICLES SECTION */}
            <section className="inventory-section">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-h3 flex items-center gap-2 border-none m-0 p-0">
                  {React.createElement(nicheConfigs[activeNiche].icon, { size: 18, color: "#60a5fa" })}
                  My {nicheConfigs[activeNiche].plural} ({supply.length})
                </h3>
                <button 
                  className="btn btn-primary text-micro" 
                  onClick={() => setShowAddCarModal(true)}
                >
                  {nicheConfigs[activeNiche].addLabel}
                </button>
              </div>
              <div className="border-bottom-light mb-4"></div>
              
              {supply.length > 0 ? (
                <div className="supply-grid">
                  {supply.map(item => (
                    <div key={item.id} className="glass-panel supply-card">
                       <div className="car-image-placeholder">{item.image}</div>
                       <div className="car-details">
                         <div className="car-header">
                           <h4 className="text-h3">{item.year || ''} {item.make || item.type} {item.model || ''}</h4>
                           <span className="text-h3 text-green-400">{item.price}</span>
                         </div>
                         <div className="car-meta text-small">
                           {item.mileage && <span>{item.mileage} miles</span>}
                           {item.sqft && <span>{item.sqft} sqft • {item.beds}b/{item.baths}ba</span>}
                           <span>•</span>
                           <span>📍 {item.location}</span>
                         </div>
                         <div className="flex gap-2">
                           <a 
                             href={item.url || '#'} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="btn btn-secondary flex-1 text-center"
                           >
                             View Original
                           </a>
                           <button 
                             className="btn btn-secondary text-red-400" 
                             onClick={() => {
                               fetch(`/api/inventory/${item.id}`, { method: 'DELETE' });
                               setSupply(supply.filter(c => c.id !== item.id));
                             }}
                           >
                             Remove
                           </button>
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-small italic opacity-60">No {nicheConfigs[activeNiche].plural.toLowerCase()} tracked yet. Click the icon on suggested matches!</p>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {showAddCarModal && (
        <div className="modal-overlay" onClick={() => setShowAddCarModal(false)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-h2">Add {nicheConfigs[activeNiche].label} to Inventory</h2>
              <button className="icon-btn" onClick={() => setShowAddCarModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddManualItem} className="add-car-form">
              {activeNiche === 'cars' ? (
                <>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label className="text-micro">Make *</label>
                      <input type="text" className="filter-input" placeholder="e.g. Toyota" required
                        value={newCarForm.make} onChange={e => setNewCarForm({...newCarForm, make: e.target.value})} />
                    </div>
                    <div className="filter-group">
                      <label className="text-micro">Model *</label>
                      <input type="text" className="filter-input" placeholder="e.g. Camry" required
                        value={newCarForm.model} onChange={e => setNewCarForm({...newCarForm, model: e.target.value})} />
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label className="text-micro">Year</label>
                      <input type="number" className="filter-input" placeholder="e.g. 2015" 
                        value={newCarForm.year} onChange={e => setNewCarForm({...newCarForm, year: e.target.value})} />
                    </div>
                    <div className="filter-group">
                      <label className="text-micro">Mileage</label>
                      <input type="text" className="filter-input" placeholder="e.g. 120k" 
                        value={newCarForm.mileage} onChange={e => setNewCarForm({...newCarForm, mileage: e.target.value})} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label className="text-micro">Property Type *</label>
                      <select className="filter-input" required
                        value={newCarForm.type} onChange={e => setNewCarForm({...newCarForm, type: e.target.value})}>
                        <option value="">Select Type</option>
                        <option value="Single Family">Single Family</option>
                        <option value="Duplex">Duplex</option>
                        <option value="Condo">Condo</option>
                        <option value="Multi-Family">Multi-Family</option>
                      </select>
                    </div>
                    <div className="filter-group">
                      <label className="text-micro">Sq Ft</label>
                      <input type="text" className="filter-input" placeholder="e.g. 1,500" 
                        value={newCarForm.sqft} onChange={e => setNewCarForm({...newCarForm, sqft: e.target.value})} />
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label className="text-micro">Beds</label>
                      <input type="number" className="filter-input" placeholder="3" 
                        value={newCarForm.beds} onChange={e => setNewCarForm({...newCarForm, beds: e.target.value})} />
                    </div>
                    <div className="filter-group">
                      <label className="text-micro">Baths</label>
                      <input type="number" className="filter-input" placeholder="2" 
                        value={newCarForm.baths} onChange={e => setNewCarForm({...newCarForm, baths: e.target.value})} />
                    </div>
                  </div>
                </>
              )}
              <div className="filter-row">
                <div className="filter-group">
                  <label className="text-micro">Price</label>
                  <input type="text" className="filter-input" placeholder="e.g. $250,000" 
                    value={newCarForm.price} onChange={e => setNewCarForm({...newCarForm, price: e.target.value})} />
                </div>
                <div className="filter-group">
                  <label className="text-micro">Location</label>
                  <input type="text" className="filter-input" placeholder="e.g. Austin, TX" 
                    value={newCarForm.location} onChange={e => setNewCarForm({...newCarForm, location: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4 mt-4">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowAddCarModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Add to Inventory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS VIEW */}
      {activeTab === 'settings' && (
        <div className="inventory-view flex-1 scroll-content custom-scrollbar p-content">
          <header className="column-header transparent mb-8 p-0">
            <div>
              <h1 className="text-h2">Settings</h1>
              <p className="text-small">Manage your integrations and personalization.</p>
            </div>
          </header>

          <section className="inventory-section mb-12">
            <h3 className="text-h3 mb-4 flex items-center gap-2">
              <Bell size={18} className="text-accent-blue" />
              Telegram Push Notifications
            </h3>
            <p className="text-small text-secondary mb-4">
              Get instant notifications on your phone when a buyer matches your inventory. 
              Message <strong>@BotFather</strong> on Telegram to create a bot and get your token.
            </p>
            
            <div className="glass-panel settings-card">
              <div className="filter-group">
                <label className="text-micro">Telegram Bot Token</label>
                <input 
                  type="password" 
                  className="filter-input" 
                  placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz" 
                  value={userSettings.telegramToken}
                  onChange={e => setUserSettings({...userSettings, telegramToken: e.target.value})}
                />
              </div>
              <div className="filter-group">
                <label className="text-micro">Your Chat ID</label>
                <input 
                  type="text" 
                  className="filter-input" 
                  placeholder="e.g. 987654321" 
                  value={userSettings.telegramChatId}
                  onChange={e => setUserSettings({...userSettings, telegramChatId: e.target.value})}
                />
              </div>
            </div>
          </section>

          <section className="inventory-section mb-12">
            <h3 className="text-h3 mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-accent-purple" />
              AI Preferences
            </h3>
            <div className="glass-panel settings-card">
              <div className="filter-group">
                <label className="text-micro">Local AI Model Name</label>
                <input 
                  type="text" 
                  className="filter-input" 
                  placeholder="e.g. llama3" 
                  value={userSettings.aiModel}
                  onChange={e => setUserSettings({...userSettings, aiModel: e.target.value})}
                />
                <p className="text-micro text-tertiary mt-1">The Ollama model used for local analysis.</p>
              </div>
            </div>
          </section>

          <section className="inventory-section mb-12">
            <h3 className="text-h3 mb-4 flex items-center gap-2">
              <X size={18} className="text-red-400" />
              Negative Keyword Filter (Blacklist)
            </h3>
            <p className="text-small text-secondary mb-4">
              Add words or phrases to exclude from your feed. Any post containing these words will be hidden.
            </p>

            <div className="glass-panel settings-card">
              <form onSubmit={handleAddBlacklistKeyword} className="subreddit-form mb-6">
                <div className="filter-group flex-1">
                  <input 
                    type="text" 
                    className="filter-input" 
                    placeholder="e.g. promotional, hire, service" 
                    value={newBlacklistKeyword}
                    onChange={e => setNewBlacklistKeyword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary subreddit-add-btn">
                  Add Keyword
                </button>
              </form>

              <div className="subreddit-list">
                {blacklist.length > 0 ? (
                  blacklist.map(kw => (
                    <div key={kw} className="subreddit-item flex justify-between items-center glass-panel">
                      <span className="text-body">{kw}</span>
                      <button 
                        className="icon-btn text-red-400" 
                        onClick={() => handleRemoveBlacklistKeyword(kw)}
                        title="Remove"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-small italic opacity-60">No keywords blacklisted yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="inventory-section mb-12">
            <h3 className="text-h3 mb-4 flex items-center gap-2">
              <ExternalLink size={18} className="text-accent-orange" />
              Monitored Subreddits
            </h3>
            <p className="text-small text-secondary mb-4">
              Add subreddits where people often post cars for sale or ask for buying advice.
            </p>

            <div className="glass-panel settings-card">
              <form onSubmit={handleAddSubreddit} className="subreddit-form mb-6">
                <div className="filter-group flex-1">
                  <input 
                    type="text" 
                    className="filter-input" 
                    placeholder="e.g. whatcarshouldIbuy" 
                    value={newSubreddit}
                    onChange={e => setNewSubreddit(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary subreddit-add-btn">
                  Add Subreddit
                </button>
              </form>

              <div className="subreddit-list">
                {monitoredSubreddits.length > 0 ? (
                  monitoredSubreddits.map(sub => (
                    <div key={sub} className="subreddit-item flex justify-between items-center glass-panel">
                      <span className="text-body">r/{sub}</span>
                      <button 
                        className="icon-btn text-red-400" 
                        onClick={() => handleRemoveSubreddit(sub)}
                        title="Remove"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-small italic opacity-60">No subreddits monitored. Add one above!</p>
                )}
              </div>
              {isSavingSettings && <p className="text-micro text-accent-blue mt-2">Saving changes...</p>}
            </div>
          </section>
        </div>
      )}

      {/* LEAD DETAIL MODAL */}
      {showLeadDetailModal && (
      <LeadDetailModal 
        lead={selectedLeadForModal} 
        onClose={() => setShowLeadDetailModal(false)}
        onMatch={(l) => {
          setActiveLead(l);
          setShowLeadDetailModal(false);
          setActiveTab('matches');
        }}
      />
      )}


      {/* NOTIFICATION CENTER */}
      <div className="notification-container">
        {notifications.map(notif => (
          <div key={notif.id} className="notification-toast glass-panel">
            <div className="notification-icon">
              <Zap size={18} className="text-accent-blue" />
            </div>
            <div className="notification-content">
              <h4>{notif.title}</h4>
              <p>{notif.message}</p>
            </div>
            <button className="notification-close" onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
