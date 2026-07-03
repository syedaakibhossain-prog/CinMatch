# CineMatch — AI-Powered Movie Recommender

CineMatch is a full-stack movie recommendation web app. Enter any movie title and instantly receive five personalised recommendations, complete with posters fetched live from The Movie Database (TMDB).

**Live Frontend:** [cin-match-six.vercel.app](https://cin-match-six.vercel.app)  


---

## Features

- **Smart search** with real-time autocomplete
- **Content-based ML recommendations** using cosine similarity on movie metadata
- **Live movie posters** fetched concurrently from the TMDB API
- **Redis-backed sliding-window rate limiting** to prevent abuse
- **Fully responsive** dark-mode UI with smooth animations
- **Modal detail view** with a direct TMDB link and "Similar Movies" chain search

---

## Project Structure

```
movie_recomender/
├── frontend/          # Vanilla HTML / CSS / JS client
│   ├── index.html
│   ├── style.css
│   └── app.js
└── backend/           # FastAPI Python server
    ├── main.py
    ├── src/
    │   ├── recomender.py      # ML inference + TMDB poster fetch
    │   ├── validators.py      # Pydantic input sanitisation
    │   ├── config.py          # Settings (TMDB key, Redis URL, rate limits)
    │   ├── movies.pkl         # Pre-trained movie DataFrame
    │   ├── vectorizer.pkl     # Fitted CountVectorizer
    │   └── movie_vectors.npz  # Sparse tag matrix
    ├── middleware/
    │   └── rate_limiter.py    # Sliding-window FastAPI dependency
    └── shared/
        ├── redis_client.py
        └── sliding_window.lua # Atomic Lua script for Redis
```

---

## How the Recommendation Model Works

CineMatch uses a **content-based filtering** approach — no user history or ratings required.

### 1. Data & Feature Engineering

The model is trained on the [TMDB 5000 Movies Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata), which contains metadata for ~5,000 movies across two CSV files (movies + credits). The two tables are merged on `title` and trimmed to the columns that carry semantic meaning:

```
movie_id · title · overview · genres · keywords · cast (top 3) · crew (director only)
```

### 2. Tag Construction

Each movie is reduced to a single **tag string** by concatenating all five content fields:

```
tags = overview_words + genres + keywords + top_3_cast + director
```

Multi-word names (e.g. *"Sam Worthington"*) are compressed to one token (`SamWorthington`) to prevent partial matches. All tags are lowercased.

### 3. Stemming

Every word in the tag string is passed through a **Porter Stemmer** (nltk) so that morphological variants (`loving`, `loved`, `loves` → `love`) are treated as the same feature, improving recall.

### 4. Vectorisation (Bag-of-Words)

A `CountVectorizer` (scikit-learn) converts each movie's stemmed tag string into a **sparse vector** with a vocabulary capped at **5,000 features**, English stop-words removed. This produces the `movie_vectors.npz` sparse matrix.

### 5. Similarity & Ranking

At query time:

1. The input title is looked up in the pre-loaded DataFrame (case-insensitive).
2. **Cosine similarity** is computed between the query movie's vector and every other movie's vector.
3. The top-5 highest-scoring movies (excluding the query itself) are returned as recommendations.

```
similarity(A, B) = (A · B) / (‖A‖ × ‖B‖)
```

Cosine similarity is ideal here because it is **magnitude-independent** — a short overview and a long one are compared fairly by direction, not length.

### 6. Pre-trained Artefacts

Training produces three files that are bundled with the backend and loaded **once at server startup**:

| File | Purpose |
|---|---|
| `movies.pkl` | DataFrame with `movie_id`, `title`, `tags` |
| `vectorizer.pkl` | Fitted `CountVectorizer` (vocabulary map) |
| `movie_vectors.npz` | Sparse tag matrix (shape: `n_movies × 5000`) |

Loading is instant at inference time — no retraining happens during serving.

---

## Frontend

Built with **pure HTML, CSS and vanilla JavaScript** — no frameworks, no build step required.

| Feature | Detail |
|---|---|
| Autocomplete | Debounced (180 ms) client-side filter on previously searched titles |
| Loading state | Animated three-ring spinner overlay |
| Error handling | Auto-dismissing toast for 404 / network errors |
| Movie cards | Movie poster with rank badge; gradient fallback if poster unavailable |
| Detail modal | Full poster, TMDB link, and "Similar Movies" trigger for chain discovery |
| Scroll animations | `IntersectionObserver` fade-in for the "How It Works" section |
| Hero particles | 28 randomly generated floating dots for visual depth |

The frontend communicates with the backend via a single REST call:

```
GET /recommended/{movie_name}
```

---

## Backend

Built with **FastAPI** (Python 3.12+) and served via **Uvicorn**.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health ping |
| `GET` | `/health` | Structured health check (`{"status": "ok"}`) |
| `GET` | `/recommended/{movie_name}` | Returns 5 recommendations with TMDB posters |

### Request Validation

Input is sanitised through a Pydantic model **before** it reaches the ML layer:

- Unicode normalisation (NFC)
- Collapse internal whitespace
- Strip dangerous characters (`< > ; \ { } | ^ ~ [ ]`)
- Character allowlist — only letters, digits, spaces, and common movie-title punctuation
- Length enforced: **1–150 characters**

### Concurrent Poster Fetching

Once the top-5 movie IDs are resolved, their TMDB poster URLs are fetched **concurrently** using `asyncio.gather` + `httpx.AsyncClient(timeout=10s)`, so total latency is roughly one TMDB round-trip regardless of result count.

### Rate Limiting

A Redis **sliding-window** rate limiter (atomic Lua script) enforces a per-IP cap:

- Default window: **60 seconds**
- Default limit: **100 requests / window**
- Returns HTTP **429** with `"Too many requests. Try again later."` when exceeded

The Lua script stores requests as a Redis sorted set scored by Unix timestamp. On each call it removes entries older than the window before checking the count, giving a true sliding window rather than a hard reset.

### Configuration (`.env`)

```env
API_READ_ACCESS_TOKEN=<TMDB Bearer token>
TMDB_API_KEY=<TMDB API key>
REDIS_URL=redis://localhost:6379
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Redis (local or managed, e.g. Upstash)
- A free [TMDB API key](https://developer.themoviedb.org/docs/getting-started)

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create your env file and fill in the values
# (see Configuration section above)

# Start the development server
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

### Frontend Setup

No build step needed. Open `frontend/index.html` in your browser, or serve the folder:

```bash
# Using Python's built-in server
python -m http.server 5500 --directory frontend
```

> **Important:** For local development, update `API_BASE` in `frontend/app.js` to `http://localhost:8000` instead of the production Render URL.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Python 3.12, FastAPI, Uvicorn |
| ML | scikit-learn, scipy, pandas, nltk |
| Async HTTP | httpx |
| Rate Limiting | Redis + atomic Lua sliding-window script |
| Movie / Poster Data | TMDB API |
| Deployment | Vercel (frontend) · Render (backend) |

---

## License

MIT — feel free to fork, modify and build on it.
