# Apex Wholesale 🚀
### AI-Powered Multi-Niche Wholesaling Dashboard

Apex Wholesale is a high-performance, production-ready dashboard designed for wholesalers in the **Automotive** and **Real Estate** niches. It uses AI to bridge the gap between live market leads and your inventory, providing a unified "Match Engine" that identifies deal opportunities in real-time.

![Apex Dashboard](https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=1200)

## 🌟 Key Features

- **Dual-Niche Intelligence**: Seamlessly switch between Car and House wholesaling modes with custom AI models for each.
- **Unified Match Engine**: A centralized feed that automatically pairs your inventory with incoming buyers based on budget, location, and intent.
- **AI-Driven Insights**: Deep analysis of Reddit leads using Google Gemini to extract budget, location, and intent layers (Blue/Yellow/Orange).
- **Traffic Quality Control**: Advanced negative keyword filtering (Blacklist) to eliminate ads, promotional spam, and irrelevant noise.
- **Mobile-Native Experience**: Optimized for on-the-go wholesaling with a responsive, glass-morphism UI and touch-target optimizations.
- **Persistence Layer**: Cloud-stored settings and data using Supabase, ensuring your inventory and filters are safe across restarts.

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Lucide Icons
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Generative AI (Gemini)
- **Styling**: Vanilla CSS (Custom Design System)

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- A [Supabase](https://supabase.com) project (Free tier)
- A [Google AI](https://aistudio.google.com/) API Key

### Installation

1. **Clone the repo**
   ```bash
   git clone <your-repo-url>
   cd apex-wholesale
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Initialize Database**
   Run the SQL script provided in `migration_guide.md` in your Supabase SQL Editor.

5. **Start Developing**
   ```bash
   npm run start
   ```

## 🌐 Deployment

This project is optimized for **Vercel** + **Supabase**. 
Simply connect your GitHub repo to Vercel, add the Environment Variables, and your professional wholesaling engine will be live in minutes.

---
*Built for performance. Built for profit.*
