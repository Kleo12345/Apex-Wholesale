import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

// --- REDDIT ACCESS ---
// Reddit blocks unauthenticated requests from cloud/datacenter IPs (Vercel included)
// on both /new.json and /new/.rss. Reddit is also currently refusing to issue new API
// app credentials to most accounts ("Responsible Builder Policy" rollout), so OAuth
// isn't reliably available either. PROXY_URL routes requests through a non-datacenter
// IP (e.g. a residential proxy) to sidestep the IP block directly; OAuth is tried first
// in case REDDIT_CLIENT_ID/SECRET are ever set from an existing app.
const REDDIT_USER_AGENT = `web:apex-wholesale:v2.0.0 (by /u/${process.env.REDDIT_USERNAME || 'apex_wholesale_bot'})`;

const proxyAgent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined;

let redditToken = null;
let redditTokenExpiry = 0;

const getRedditToken = async () => {
  if (redditToken && Date.now() < redditTokenExpiry) return redditToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT
      },
      httpsAgent: proxyAgent,
      timeout: 5000
    }
  );

  redditToken = response.data.access_token;
  redditTokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return redditToken;
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);

const fetchSubredditPosts = async (sub) => {
  try {
    const token = await getRedditToken();
    if (token) {
      const response = await axios.get(`https://oauth.reddit.com/r/${sub}/new`, {
        params: { limit: 15 },
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': REDDIT_USER_AGENT },
        httpsAgent: proxyAgent,
        timeout: 6000
      });
      return response.data.data.children.map(p => ({
        id: p.data.id,
        title: p.data.title,
        content: p.data.selftext,
        url: `https://reddit.com${p.data.permalink}`,
        created_utc: p.data.created_utc
      }));
    }
  } catch (err) {
    console.error(`Reddit OAuth fetch failed for r/${sub}:`, err.message);
  }

  // Fallback: public endpoints (unreliable from cloud IPs, kept as a last resort
  // for when REDDIT_CLIENT_ID/SECRET aren't configured yet)
  try {
    const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=15&t=${Date.now()}`, {
      headers: { 'User-Agent': REDDIT_USER_AGENT, Accept: 'application/json' },
      httpsAgent: proxyAgent,
      timeout: 4000
    });
    return response.data.data.children.map(p => ({
      id: p.data.id,
      title: p.data.title,
      content: p.data.selftext,
      url: `https://reddit.com${p.data.permalink}`,
      created_utc: p.data.created_utc
    }));
  } catch (jsonErr) {
    try {
      const xml = await withTimeout(
        axios.get(`https://www.reddit.com/r/${sub}/new/.rss?t=${Date.now()}`, {
          headers: { 'User-Agent': REDDIT_USER_AGENT },
          httpsAgent: proxyAgent,
          timeout: 4000
        }),
        5000
      );
      const feed = await parser.parseString(xml.data);
      return feed.items.map(item => ({
        id: item.id?.split('_')?.pop() || item.guid || Math.random().toString(36),
        title: item.title,
        content: item.contentSnippet || item.content || '',
        url: item.link,
        created_utc: item.isoDate ? new Date(item.isoDate).getTime() / 1000 : Date.now() / 1000
      }));
    } catch (rssErr) {
      console.error(`Reddit fetch (all paths) failed for r/${sub}:`, rssErr.message);
      return [];
    }
  }
};

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
      subreddits.map(async (sub) => ({ sub, posts: await fetchSubredditPosts(sub) }))
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
      await supabase.from('leads').insert(newLeadsFromReddit);
    }

    const { data: finalLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('niche', niche)
      .order('created_at', { ascending: false })
      .limit(100);

    res.json({ leads: finalLeads || [] });
  } catch (error) {
    console.error('API Error:', error.message);
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
