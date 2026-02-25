const express = require('express');
const cors    = require('cors');
const yf      = require('yahoo-finance2').default;

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Helper ────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n || isNaN(n)) return null;
  if (n >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n/1e6).toFixed(1)  + 'M';
  return n.toLocaleString();
}

// ── GET /quote/:symbol ────────────────────────────────────────────────
// symbol examples: BHP.AX, CBA.AX, AAPL (but frontend uses Finnhub for US)
app.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const q = await yf.quote(symbol);
    res.json({
      price:   q.regularMarketPrice,
      change:  q.regularMarketChange,
      pct:     q.regularMarketChangePercent,
      high:    q.regularMarketDayHigh,
      low:     q.regularMarketDayLow,
      open:    q.regularMarketOpen,
      prevClose: q.regularMarketPreviousClose,
      name:    q.longName || q.shortName || symbol,
      mktcap:  fmt(q.marketCap),
      volume:  fmt(q.regularMarketVolume),
      currency: q.currency,
    });
  } catch (e) {
    console.error(`[quote] ${symbol}:`, e.message);
    res.status(404).json({ error: `Could not fetch quote for ${symbol}: ${e.message}` });
  }
});

// ── GET /spark/:symbol ────────────────────────────────────────────────
// Returns last 30 daily closing prices for sparkline
app.get('/spark/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const result = await yf.historical(symbol, {
      period1: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      period2: new Date().toISOString().split('T')[0],
      interval: '1d',
    });
    const closes = result.map(d => d.close).filter(Boolean);
    res.json({ closes });
  } catch (e) {
    res.json({ closes: [] });
  }
});

// ── GET /news/:symbol ─────────────────────────────────────────────────
app.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const result = await yf.search(symbol, { newsCount: 8, quotesCount: 0 });
    const news = (result.news || []).map(n => ({
      headline: n.title,
      source:   n.publisher,
      url:      n.link,
      time:     timeAgo(n.providerPublishTime),
      sentiment: 'neutral',
    }));
    res.json({ news });
  } catch (e) {
    res.json({ news: [] });
  }
});

function timeAgo(ts) {
  const d = Math.floor((Date.now()/1000 - ts) / 60);
  if (d < 60)   return d + 'm ago';
  if (d < 1440) return Math.floor(d/60) + 'h ago';
  return Math.floor(d/1440) + 'd ago';
}

// ── Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'MarketWatch server running' }));

app.listen(PORT, () => console.log(`MarketWatch server running on port ${PORT}`));
