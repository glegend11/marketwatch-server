const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Map frontend timeframe labels to Yahoo Finance params
const TIMEFRAMES = {
  '1D':  { interval: '5m',  range: '1d'  },
  '5D':  { interval: '30m', range: '5d'  },
  '1M':  { interval: '1d',  range: '1mo' },
  '6M':  { interval: '1wk', range: '6mo' },
  '1Y':  { interval: '1wk', range: '1y'  },
  '5Y':  { interval: '1mo', range: '5y'  },
  'ALL': { interval: '1mo', range: 'max' },
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
      currency: meta.currency,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /spark/:symbol?tf=1D  (timeframe)
app.get('/spark/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const tf     = (req.query.tf || '1M').toUpperCase();
  const params = TIMEFRAMES[tf] || TIMEFRAMES['1M'];
  try {
    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;
    const r    = await fetch(url, { headers: YF_HEADERS });
    const data = await r.json();
    const result    = data?.chart?.result?.[0];
    const closes    = result?.indicators?.quote?.[0]?.close || [];
    const timestamps = result?.timestamp || [];
    const points = closes.map((c, i) => ({ t: timestamps[i], v: c })).filter(p => p.v != null);
    res.json({ points });
  } catch (e) {
    res.json({ points: [] });
  }
});

// GET /news/:symbol  — 1 month of news sorted latest first
app.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=50&quotesCount=0`;
    const r    = await fetch(url, { headers: YF_HEADERS });
    const data = await r.json();
    const oneMonthAgo = Date.now()/1000 - 30*86400;
    const news = (data?.news || [])
      .filter(n => n.providerPublishTime >= oneMonthAgo)
      .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
      .map(n => ({
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
