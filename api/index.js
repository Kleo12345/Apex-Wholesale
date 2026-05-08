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
const validateEnv = () => {
  const required = ['SUPABASE_URL', 'SUPABASE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`CRITICAL: Missing environment variables: ${missing.join(', ')}`);
    return false;
  }
  return true;
};

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
    console.error('Error reading settings from Supabase:', error.message);
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
    console.error('Error saving settings to Supabase:', error.message);
    return false;
  }
};

// --- ENDPOINTS ---

app.get('/api/leads', async (req, res) => {
  if (!validateEnv()) {
    return res.status(500).json({ error: 'Server configuration error (Missing ENV)' });
  }

  try {
    const niche = req.query.niche || 'cars';
    const settings = await getSettings();
    
    // 1. Fetch existing leads to avoid duplicates
    const { data: existingLeads, error: fetchError } = await supabase
      .from('leads')
      .select('id')
      .eq('niche', niche)
      .limit(200);
    
    if (fetchError) {
      console.error('Supabase fetch error:', fetchError.message);
      // Don't crash, just proceed with empty existing list
    }

    const existingIds = new Set((existingLeads || []).map(l => l.id));
    const subreddits = settings.niches?.[niche]?.subreddits || [];
    
    // 2. Fetch from Reddit in parallel
    const redditResults = await Promise.allSettled(
      subreddits.map(async (sub) => {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=10`, {
          headers: { 
            'User-Agent': 'web:apex-wholesale:v1.0.0 (by /u/no_user_yet)',
            'Accept': 'application/json'
          },
          timeout: 5000 // 5s timeout per subreddit
        });
        return { sub, posts: response.data.data.children };
      })
    );

    const newLeadsFromReddit = [];
    const spamKeywords = settings.blacklist || [];

    for (const result of redditResults) {
      if (result.status === 'fulfilled') {
        const { sub, posts } = result.value;
        for (const post of posts) {
          const data = post.data;
          if (data.stickied) continue;
          if (existingIds.has(data.id)) continue;

          const combinedText = (data.title + ' ' + (data.selftext || '')).toLowerCase();
          if (spamKeywords.some(kw => combinedText.includes(kw.toLowerCase()))) continue;
          
          newLeadsFromReddit.push({
            id: data.id,
            niche: niche,
            source: 'reddit',
            layer: 'gray',
            title: `[r/${sub}] ${data.title}`,
            content: (data.selftext || '').substring(0, 1000),
            budget: 'Unknown',
            location: 'Remote/Unknown',
            time: new Date(data.created_utc * 1000).toISOString(),
            matchKeywords: [],
            url: `https://reddit.com${data.permalink}`
          });
        }
      } else {
        console.error(`Failed to fetch from Reddit: ${result.reason.message}`);
      }
    }

    // 3. Batch insert new leads
    if (newLeadsFromReddit.length > 0) {
      const { error: insertError } = await supabase.from('leads').insert(newLeadsFromReddit);
      if (insertError) console.error('Error inserting new leads:', insertError.message);
    }

    // 4. Return the latest leads from DB
    const { data: finalLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json(finalLeads || []);
  } catch (error) {
    console.error('Fatal error in /api/leads:', error.message);
    res.status(500).json({ error: error.message });
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

app.get('/api/debug', async (req, res) => {
  const diagnostics = {
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_KEY: !!process.env.SUPABASE_KEY ? 'Present (Hidden)' : 'Missing',
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY ? 'Present (Hidden)' : 'Missing',
      NODE_ENV: process.env.NODE_ENV
    },
    supabase: null,
    reddit: {}
  };

  // Check Supabase
  try {
    const { count, error } = await supabase.from('settings').select('*', { count: 'exact', head: true });
    if (error) throw error;
    diagnostics.supabase = { status: 'Connected', settingsCount: count };
  } catch (err) {
    diagnostics.supabase = { status: 'Failed', error: err.message };
  }

  // Check Reddit (Sample)
  try {
    const response = await axios.get('https://www.reddit.com/r/cars/new.json?limit=1', {
      headers: { 'User-Agent': 'web:apex-wholesale:v1.0.0 (by /u/no_user_yet)' },
      timeout: 5000
    });
    diagnostics.reddit = { status: 'Connected', statusCode: response.status };
  } catch (err) {
    diagnostics.reddit = { 
      status: 'Blocked', 
      statusCode: err.response?.status,
      message: err.message 
    };
  }

  res.json(diagnostics);
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
