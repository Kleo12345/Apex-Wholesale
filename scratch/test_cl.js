import axios from 'axios';

async function testCL() {
  try {
    const res = await axios.get('https://austin.craigslist.org/search/waa?format=rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('SUCCESS:', res.data.substring(0, 500));
  } catch (err) {
    console.log('FAILED:', err.message);
  }
}

testCL();
