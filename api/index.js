import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- SUPABASE SETUP ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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

// --- ENDPOINTS ---

app.get('/api/leads', async (req, res) => {
  try {
    const niche = req.query.niche || 'cars';
    const settings = await getSettings();
    
    const { data: existingLeads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (fetchError) throw fetchError;

    const subreddits = settings.niches?.[niche]?.subreddits || [];
    const newLeadsFromReddit = [];
    
    for (const sub of subreddits) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=5`, {
          headers: { 'User-Agent': 'ApexWholesale/1.0' }
        });
        
        const posts = response.data.data.children;
        for (const post of posts) {
          const data = post.data;
          if (data.stickied) continue;

          const spamKeywords = settings.blacklist || [];
          const combinedText = (data.title + ' ' + data.selftext).toLowerCase();
          if (spamKeywords.some(kw => combinedText.includes(kw.toLowerCase()))) continue;
          
          if (existingLeads.find(l => l.id === data.id)) continue;

          newLeadsFromReddit.push({
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
          });
        }
      } catch (err) {
        console.error(`Failed to fetch r/${sub}:`, err.message);
      }
    }

    if (newLeadsFromReddit.length > 0) {
      await supabase.from('leads').insert(newLeadsFromReddit);
    }

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
    const { error } = await supabase.from('leads').upsert(updatedLead);
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
    const { error } = await supabase.from('inventory').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saved-leads', async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads').select('*').eq('is_saved', true);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/saved-leads', async (req, res) => {
  try {
    const { id, is_saved } = req.body;
    const { error } = await supabase.from('leads').update({ is_saved: !is_saved }).eq('id', id);
    if (error) throw error;
    res.json({ success: true, isSaved: !is_saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  res.json(await getSettings());
});

app.post('/api/settings', async (req, res) => {
  if (await saveSettings(req.body)) {
    res.json({ success: true, settings: req.body });
  } else {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.post('/api/analyze-gemini', async (req, res) => {
  try {
    const { lead, niche } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = niche === 'houses' 
      ? `Analyze this real estate lead: ${lead.title} ${lead.content}. Return ONLY JSON: {"intentLayer": "blue/yellow/orange", "budget": "string", "propertyType": "string", "bedsBaths": "string"}`
      : `Analyze this car lead: ${lead.title} ${lead.content}. Return ONLY JSON: {"intentLayer": "blue/yellow/orange", "budget": "string", "makeModel": ["string"]}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.match(/\{.*\}/s)[0];
    const analysis = JSON.parse(jsonStr);

    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(3002, () => console.log('Server running on http://localhost:3002'));
}

export default app;
