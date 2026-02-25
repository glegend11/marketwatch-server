const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function fmtNum(n) {
  if (!n || isNaN(n)) return null;
  if (n >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n/1e6).toFixed(1)  + 'M';
  return n.toLocaleString();
}

function timeAgo(ts) {
  const d = Math.floor((Date.now()/1000 - ts) / 60);
  if (d < 60)   return d + 'm ago';
  if (d < 1440) return Math.floor(d/60) + 'h ago';
  return Math.floor(d/1440) + 'd ago';
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// GET /quote/:symbol
app.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const r    = await fetch(url, { headers: YF_HEADERS });
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) {
      return res.status(404).json({ error: `No data for ${symbol}` });
    }
    const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
    const change    = meta.regularMarketPrice - prevClose;
    const pct       = (change / prevClose) * 100;
    res.json({
      price:    meta.regularMarketPrice,
      change:   parseFloat(change.toFixed(4)),
      pct:      parseFloat(pct.toFixed(4)),
      high:     meta.regularMarketDayHigh,
      low:      meta.regularMarketDayLow,
      prevClose,
      name:     meta.longName || meta.shortName || symbol,
      mktcap:   null,
      currency: meta.currency,
    });
  } catch (e) {
    console.error(`[quote] ${symbol}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /spark/:symbol
app.get('/spark/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
    const r    = await fetch(url, { headers: YF_HEADERS });
    const data = await r.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    res.json({ closes: closes.filter(Boolean) });
  } catch (e) {
    res.json({ closes: [] });
  }
});

// GET /news/:symbol
app.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0`;
    const r    = await fetch(url, { headers: YF_HEADERS });
    const data = await r.json();
    const news = (data?.news || []).map(n => ({
      headline:  n.title,
      source:    n.publisher,
      url:       n.link,
      time:      timeAgo(n.providerPublishTime),
      sentiment: 'neutral',
    }));
    res.json({ news });
  } catch (e) {
    res.json({ news: [] });
  }
});

app.get('/', (req, res) => res.json({ status: 'MarketWatch server running OK' }));

app.listen(PORT, () => console.log(`MarketWatch server on port ${PORT}`));
