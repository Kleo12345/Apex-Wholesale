import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3002;

// --- SUPABASE SETUP ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Use service_role key to bypass RLS for simplicity in this private app
const supabase = createClient(supabaseUrl, supabaseKey);

// --- DB HELPERS ---
const getSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 1)
      .single();
    
    if (error) throw error;
    return data.data;
  } catch (error) {
    console.error('Error reading settings from Supabase:', error);
    // Return defaults if not found
    return { 
      activeNiche: 'cars',
      niches: {
        cars: { subreddits: ['whatcarshouldIbuy', 'usedcars', 'carsales'] },
        houses: { subreddits: ['realestate', 'househunting', 'RealEstateWholesaling', 'REI'] }
      },
      blacklist: []
    };
  }
};

const saveSettings = async (settings) => {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 1, data: settings });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving settings to Supabase:', error);
    return false;
  }
};

const DB_PATH = path.join(__dirname, 'db.json');

// --- DB HELPERS ---
// --- ENDPOINTS ---

app.get('/api/leads', async (req, res) => {
  try {
    const niche = req.query.niche || 'cars';
    const settings = await getSettings();
    
    // 1. Fetch current leads from Supabase for this niche
    const { data: existingLeads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (fetchError) throw fetchError;

    // 2. Fetch new leads from Reddit
    const subreddits = settings.niches?.[niche]?.subreddits || [];
    const newLeadsFromReddit = [];
    
    for (const sub of subreddits) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=5`, {
          headers: { 'User-Agent': 'Nelsen/1.0' }
        });
        
        const posts = response.data.data.children;
        for (const post of posts) {
          const data = post.data;
          if (data.stickied) continue;

          const spamKeywords = settings.blacklist || [];
          const combinedText = (data.title + ' ' + data.selftext).toLowerCase();
          if (spamKeywords.some(kw => combinedText.includes(kw.toLowerCase()))) continue;
          
          if (existingLeads.find(l => l.id === data.id)) continue;

          const newLead = {
            id: data.id,
            niche: niche,
            source: 'reddit',
            layer: 'gray',
            title: `[r/${sub}] ${data.title}`,
            content: data.selftext.substring(0, 500) + (data.selftext.length > 500 ? '...' : ''),
            budget: 'Unknown',
            location: 'Remote/Unknown',
            time: new Date(data.created_utc * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            matchKeywords: [],
            url: `https://reddit.com${data.permalink}`
          };

          newLeadsFromReddit.push(newLead);
        }
      } catch (err) {
        console.error(`Failed to fetch r/${sub}:`, err.message);
      }
    }

    // 3. Save new leads to Supabase
    if (newLeadsFromReddit.length > 0) {
      await supabase.from('leads').insert(newLeadsFromReddit);
    }

    // 4. Return combined results
    const { data: finalLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json(finalLeads || []);
  } catch (error) {
    console.error('Error fetching live leads:', error.message);
    res.json([]);
  }
});

app.post('/api/leads/update', async (req, res) => {
  try {
    const updatedLead = req.body;
    const { error } = await supabase
      .from('leads')
      .upsert(updatedLead);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/supply', async (req, res) => {
  try {
    const niche = req.query.niche || 'cars';
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const newItem = req.body;
    const { data, error } = await supabase
      .from('inventory')
      .insert([newItem])
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saved-leads', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('is_saved', true);
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/saved-leads', async (req, res) => {
  try {
    const { id, is_saved } = req.body;
    const { error } = await supabase
      .from('leads')
      .update({ is_saved: !is_saved })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ success: true, isSaved: !is_saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const newSettings = req.body;
  if (await saveSettings(newSettings)) {
    res.json({ success: true, settings: newSettings });
  } else {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

const getAiPrompt = (niche) => {
  if (niche === 'houses') {
    return `You are an AI assistant for a real estate wholesaler. Analyze the following lead. 
Extract: 
1. Intent Layer: blue (Immediate/Transaction ready), yellow (Decision Phase/Asking questions), or orange (Early Stage/Behavioral). 
2. Budget (Number or unknown).
3. Property Type desired (Single Family, Multi-Family, Condo, etc.).
4. Beds/Baths preferred.
Respond ONLY with a JSON object in this format: {"intentLayer": "blue", "budget": "250000", "propertyType": "Single Family", "bedsBaths": "3/2"}`;
  }
  
  return `You are an AI assistant for a car wholesaler. Analyze the following lead. 
Extract: 
1. Intent Layer: blue (Immediate/Transaction ready), yellow (Decision Phase/Asking questions), or orange (Early Stage/Behavioral). 
2. Budget (Number or unknown).
3. Make/Model desired.
Respond ONLY with a JSON object in this format: {"intentLayer": "blue", "budget": "5000", "makeModel": ["Honda Civic"]}`;
};

// --- GEMINI ENDPOINT ---
app.post('/api/analyze/gemini', async (req, res) => {
  try {
    const { text, niche } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Gemini API Key missing' });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `${getAiPrompt(niche)}\n\nLEAD:\n${text}`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean up potential markdown formatting from JSON
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    
    res.json(JSON.parse(cleanJson));
  } catch (error) {
    console.error('Gemini Error:', error);
    res.status(500).json({ error: 'Gemini Analysis Failed' });
  }
});

// --- LOCAL OLLAMA ENDPOINT ---
app.post('/api/analyze/local', async (req, res) => {
  try {
    const { text, niche } = req.body;
    
    const prompt = `${getAiPrompt(niche)}\n\nLEAD:\n${text}`;
    
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3', // Default local model
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    res.json(JSON.parse(response.data.response));
  } catch (error) {
    console.error('Local AI Error:', error.message);
    res.status(500).json({ error: 'Local AI Analysis Failed. Is Ollama running?' });
  }
});

app.post('/api/notify/telegram', async (req, res) => {
  const { title, message, token, chatId } = req.body;

  if (!token || !chatId) {
    console.log('[Mock Telegram] Notifications not configured in UI Settings. Skipping.');
    console.log(`[Mock Message] To: Telegram\nTitle: ${title}\nMessage: ${message}`);
    return res.json({ success: true, mock: true });
  }

  try {
    const text = `🚨 *${title}*\n\n${message}`;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
    console.log('Telegram notification sent successfully.');
    res.json({ success: true });
  } catch (error) {
    console.error('Telegram API Error:', error.message);
    res.status(500).json({ error: 'Failed to send Telegram notification' });
  }
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// Force event loop to stay alive just in case
setInterval(() => {}, 1000 * 60 * 60);
