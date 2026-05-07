# Production Deployment Guide (Vercel + Supabase)

To host Nelsen for free with permanent storage, follow these steps:

## 1. Supabase Setup
1. Create a free account at [Supabase.com](https://supabase.com).
2. Create a new project named `nelsen`.
3. Open the **SQL Editor** in the Supabase dashboard and paste the following script to create your tables:

```sql
-- 1. Leads Table
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  niche TEXT NOT NULL,
  source TEXT,
  layer TEXT DEFAULT 'gray',
  title TEXT,
  content TEXT,
  budget TEXT,
  location TEXT,
  time TEXT,
  matchKeywords JSONB DEFAULT '[]',
  analyzedBy TEXT,
  aiAnalysis JSONB,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Inventory Table
CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  niche TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year TEXT,
  price TEXT,
  mileage TEXT,
  location TEXT,
  image TEXT,
  type TEXT,
  beds TEXT,
  baths TEXT,
  sqft TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Settings Table
CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL
);

-- Initialize default settings
INSERT INTO settings (id, data) VALUES (1, '{
  "activeNiche": "cars",
  "niches": {
    "cars": { "subreddits": ["whatcarshouldIbuy", "usedcars", "carsales"] },
    "houses": { "subreddits": ["realestate", "househunting", "RealEstateWholesaling", "REI"] }
  },
  "blacklist": [
    "hire", "hiring", "va", "virtual assistant", "service", "promo", "discount", 
    "founding member", "sign up", "newsletter", "consulting", "click here",
    "limited offer", "special offer", "join now", "dm for details"
  ]
}'::jsonb) ON CONFLICT (id) DO NOTHING;
```

## 2. Vercel Environment Variables
When deploying to Vercel, add the following **Environment Variables** in the Vercel dashboard:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase Project URL (from Project Settings > API) |
| `SUPABASE_KEY` | Your Supabase `service_role` key (Required for bypass RLS) |
| `GEMINI_API_KEY` | Your Google Gemini API Key |

## 3. Local Setup
Create a `.env` file in the root directory with these same keys to test locally.
