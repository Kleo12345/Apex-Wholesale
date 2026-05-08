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
    
    // 2. Fetch from Reddit in parallel
    const redditResults = await Promise.allSettled(
      subreddits.map(async (sub) => {
        let posts = [];
        try {
          // Try JSON first (more data)
          const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=15`, {
            headers: { 
              'User-Agent': 'web:apex-wholesale:v1.0.0 (by /u/no_user_yet)',
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
          console.warn(`JSON blocked for r/${sub}, trying RSS...`);
          // Fallback to RSS
          try {
            const feed = await parser.parseURL(`https://www.reddit.com/r/${sub}/new/.rss`);
            posts = feed.items.map(item => ({
              id: item.id?.split('_')?.pop() || item.guid || Math.random().toString(36),
              title: item.title,
              content: item.contentSnippet || item.content || '',
              url: item.link,
              created_utc: item.isoDate ? new Date(item.isoDate).getTime() / 1000 : Date.now() / 1000
            }));
            console.log(`Successfully fetched ${posts.length} posts from RSS for r/${sub}`);
          } catch (rssErr) {
            console.error(`RSS also failed for r/${sub}:`, rssErr.message);
            throw rssErr;
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
          if (spamKeywords.some(kw => combinedText.includes(kw.toLowerCase()))) continue;
          
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
            matchKeywords: [],
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
  const niche = req.query.niche || 'cars';
  const diagnostics = {
    requestedNiche: niche,
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
    const { count, error } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: settingsCount } = await supabase.from('settings').select('*', { count: 'exact', head: true });
    if (error) throw error;
    diagnostics.supabase = { 
      status: 'Connected', 
      settingsCount: settingsCount,
      totalLeadsInDb: count,
      insertTest: null
    };

    // Try a test insert
    const testId = `test-${Date.now()}`;
    const { error: testError } = await supabase.from('leads').insert([{
      id: testId,
      niche: 'debug',
      title: 'Debug Test lead',
      content: 'This is a test to verify database writes.',
      time: new Date().toISOString()
    }]);

    if (testError) {
      diagnostics.supabase.insertTest = `Failed: ${testError.message} (${testError.code})`;
    } else {
      diagnostics.supabase.insertTest = 'Success! Database is writable.';
      // Clean up the test lead
      await supabase.from('leads').delete().eq('id', testId);
    }
    
    // Check Settings Detail
    const settings = await getSettings();
    diagnostics.settingsDetail = {
      niche: niche,
      subreddits: settings.niches?.[niche]?.subreddits || [],
      blacklistCount: settings.blacklist?.length || 0
    };

    // --- LIVE FETCH TEST ---
    const testSub = 'cars';
    const fetchTest = { sub: testSub, step: 'Starting' };
    try {
      fetchTest.step = 'Fetching RSS';
      const feed = await parser.parseURL(`https://www.reddit.com/r/${testSub}/new/.rss`);
      fetchTest.postsFound = feed.items.length;
      
      const sample = feed.items[0];
      const leadToSave = {
        id: sample.id?.split('_')?.pop() || sample.guid || `test-${Date.now()}`,
        niche: niche,
        source: 'reddit',
        layer: 'gray',
        title: `[TEST] ${sample.title}`,
        content: (sample.contentSnippet || sample.content || '').substring(0, 500),
        budget: 'Unknown',
        location: 'Remote/Unknown',
        time: new Date().toISOString(),
        url: sample.link
      };
      
      fetchTest.step = 'Saving to DB';
      fetchTest.leadId = leadToSave.id;
      const { error: saveError } = await supabase.from('leads').insert([leadToSave]);
      
      if (saveError) {
        fetchTest.status = 'Failed';
        fetchTest.error = saveError.message;
      } else {
        fetchTest.status = 'Success';
        // Clean up
        await supabase.from('leads').delete().eq('id', leadToSave.id);
      }
    } catch (err) {
      fetchTest.status = 'Error';
      fetchTest.error = err.message;
    }
    diagnostics.liveFetchTest = fetchTest;

  } catch (err) {
    diagnostics.supabase = { status: 'Failed', error: err.message };
  }

  // Check Reddit (Sample)
  try {
    const jsonRes = await axios.get(`https://www.reddit.com/r/cars/new.json?limit=1`, {
      headers: { 'User-Agent': 'web:apex-wholesale:v1.0.0 (by /u/no_user_yet)' },
      timeout: 3000
    });
    diagnostics.reddit.json = { status: 'Connected', statusCode: jsonRes.status };
  } catch (err) {
    diagnostics.reddit.json = { status: 'Blocked', statusCode: err.response?.status, message: err.message };
  }

  try {
    const feed = await parser.parseURL('https://www.reddit.com/r/cars/new/.rss');
    const firstItem = feed.items[0] || {};
    diagnostics.reddit.rss = { 
      status: 'Connected', 
      title: feed.title,
      samplePost: {
        id: firstItem.id?.split('_')?.pop() || firstItem.guid,
        title: firstItem.title,
        date: firstItem.isoDate
      }
    };
  } catch (err) {
    diagnostics.reddit.rss = { status: 'Blocked', message: err.message };
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
