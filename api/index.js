import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RSS-Reader/1.0',
  }
});

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

    // Force no-cache for Vercel
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 2. Fetch from Reddit in parallel
    const redditResults = await Promise.allSettled(
      subreddits.map(async (sub) => {
        let posts = [];
        try {
          // Try JSON first with cache-buster
          const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=15&t=${Date.now()}`, {
            headers: { 
              'User-Agent': `web:apex-wholesale:v1.0.0-${Date.now()}`,
              'Accept': 'application/json'
            },
            timeout: 4000
          });
          posts = response.data.data.children.map(p => ({
            id: p.data.id,
            title: p.data.title,
            content: p.data.selftext,
            url: `https://reddit.com${p.data.permalink}`,
            created_utc: p.data.created_utc
          }));
        } catch (jsonErr) {
          // Fallback to RSS with cache-buster
          try {
            const feed = await parser.parseURL(`https://www.reddit.com/r/${sub}/new/.rss?t=${Date.now()}`);
            posts = feed.items.map(item => ({
              id: item.id?.split('_')?.pop() || item.guid || Math.random().toString(36),
              title: item.title,
              content: item.contentSnippet || item.content || '',
              url: item.link,
              created_utc: item.isoDate ? new Date(item.isoDate).getTime() / 1000 : Date.now() / 1000
            }));
          } catch (rssErr) {
            console.error(`Reddit fetch failed for r/${sub}:`, rssErr.message);
          }
        }
        return { sub, posts };
      })
    );

    const newLeadsFromReddit = [];
    const spamKeywords = settings.blacklist || [];

    for (const result of redditResults) {
      if (result.status === 'fulfilled') {
        const { sub, posts } = result.value;
        for (const data of posts) {
          if (existingIds.has(data.id)) continue;

          const combinedText = (data.title + ' ' + (data.content || '')).toLowerCase();

          // Smart blacklist: Match whole words only to avoid blocking things like "Valencia" for "va"
          const isSpam = spamKeywords.some(kw => {
            const regex = new RegExp(`\\b${kw.toLowerCase()}\\b`, 'i');
            return regex.test(combinedText);
          });

          if (isSpam) continue;

          newLeadsFromReddit.push({
            id: data.id,
            niche: niche,
            source: 'reddit',
            layer: 'gray',
            title: `[r/${sub}] ${data.title}`,
            content: (data.content || '').substring(0, 1000),
            budget: 'Unknown',
            location: 'Remote/Unknown',
            time: new Date(data.created_utc * 1000).toISOString(),
            matchkeywords: [],
            url: data.url
          });
        }
      }
    }

    // 3. Batch insert new leads
    let insertStatus = "No new leads";
    if (newLeadsFromReddit.length > 0) {
      const { error: insertError } = await supabase.from('leads').insert(newLeadsFromReddit);
      if (insertError) {
        console.error('Error inserting new leads:', insertError.message);
        insertStatus = `Error: ${insertError.message}`;
      } else {
        insertStatus = `Success: Inserted ${newLeadsFromReddit.length} leads`;
      }
    }

    // 4. Return the latest leads from DB
    const { data: finalLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({
      leads: finalLeads || [],
      debug: {
        niche,
        serverTime: new Date().toISOString(),
        subredditsChecked: subreddits,
        foundOnReddit: redditResults.filter(r => r.status === 'fulfilled').reduce((acc, r) => acc + r.value.posts.length, 0),
        newLeadsFound: newLeadsFromReddit.length,
        insertStatus
      }
    });
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
    },
    supabase: { status: 'Checking...' },
    nicheStatus: {}
  };

  try {
    const { count, error } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    diagnostics.supabase = { status: error ? 'Error' : 'Connected', totalLeads: count || 0 };
    
    // Check Columns
    try {
      const { data: cols } = await supabase.rpc('get_column_names', { table_name: 'leads' });
      // If RPC fails, try a sample select
      if (!cols) {
        const { data: sample } = await supabase.from('leads').select('*').limit(1);
        diagnostics.leadsColumns = sample && sample[0] ? Object.keys(sample[0]) : 'Could not detect columns';
      } else {
        diagnostics.leadsColumns = cols;
      }
    } catch (e) {
      diagnostics.leadsColumns = 'Error detecting columns';
    }
    const settings = await getSettings();
    const niches = ['cars', 'houses'];

    for (const niche of niches) {
      const subreddits = settings.niches?.[niche]?.subreddits || [];
      const testSub = subreddits[0];
      const status = { sub: testSub, rss: 'Pending' };

      try {
        const feed = await parser.parseURL(`https://www.reddit.com/r/${testSub}/new/.rss`);
        status.rss = `Connected (${feed.items.length} posts found)`;
        status.sampleTitle = feed.items[0]?.title.substring(0, 40) + '...';
      } catch (e) {
        status.rss = `Blocked: ${e.message}`;
      }
      diagnostics.nicheStatus[niche] = status;
    }
  } catch (err) {
    diagnostics.supabase.status = `Failed: ${err.message}`;
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
