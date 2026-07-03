/* ============================================================
   CineMatch – app.js
   Connects to the FastAPI Movie Recommendation backend.
   ============================================================ */

"use strict";

// ── CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = "https://cinmatch.onrender.com";
const TMDB_URL = "https://www.themoviedb.org/movie";



// Fallback poster colours (CSS gradient per card index)
const CARD_GRADIENTS = [
  "linear-gradient(135deg,#1a0005 0%,#3d0010 100%)",
  "linear-gradient(135deg,#0a001a 0%,#1e0040 100%)",
  "linear-gradient(135deg,#001a0a 0%,#003d20 100%)",
  "linear-gradient(135deg,#1a1500 0%,#3d3000 100%)",
  "linear-gradient(135deg,#001a1a 0%,#003d3d 100%)",
];

// ── DOM REFS ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const navbar = $("navbar");
const movieInput = $("movieInput");
const searchBtn = $("searchBtn");
const searchBar = $("searchBar");
const autocompleteList = $("autocompleteList");
const navSearchBtn = $("navSearchBtn");

const loadingOverlay = $("loadingOverlay");
const errorToast = $("errorToast");
const toastMessage = $("toastMessage");
const toastClose = $("toastClose");

const resultsSection = $("resultsSection");
const queriedMovie = $("queriedMovie");
const cardsGrid = $("cardsGrid");
const newSearchBtn = $("newSearchBtn");

const modalOverlay = $("modalOverlay");
const modalClose = $("modalClose");
const modalPoster = $("modalPoster");
const modalMeta = $("modalMeta");
const modalTitle = $("modalTitle");
const modalTMDB = $("modalTMDB");
const modalRecommend = $("modalRecommend");

// ── STATE ─────────────────────────────────────────────────────────────────
let currentModal = null;   // { title, movie_id }
let movieTitles = [];     // cached list for autocomplete (populated from a search or on load)

// ── NAVBAR SCROLL ─────────────────────────────────────────────────────────
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

// ── HERO PARTICLES (floating dots) ────────────────────────────────────────
(function createParticles() {
  const container = $("particles");
  if (!container) return;
  const count = 28;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.style.cssText = `
      position:absolute;
      width:${2 + Math.random() * 3}px;
      height:${2 + Math.random() * 3}px;
      border-radius:50%;
      background:rgba(229,9,20,${0.2 + Math.random() * 0.5});
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      animation: particleFloat ${6 + Math.random() * 8}s ease-in-out ${Math.random() * -10}s infinite alternate;
    `;
    container.appendChild(dot);
  }

  // Inject keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes particleFloat {
      from { transform: translate(0,0); opacity:0.4; }
      to   { transform: translate(${(Math.random() - 0.5) * 40}px, ${(Math.random() - 0.5) * 40}px); opacity:1; }
    }
  `;
  document.head.appendChild(style);
})();

// ── SEARCH ────────────────────────────────────────────────────────────────

searchBtn.addEventListener("click", handleSearch);

movieInput.addEventListener("keydown", e => {
  if (e.key === "Enter") handleSearch();
  if (e.key === "Escape") closeAutocomplete();
  if (e.key === "ArrowDown") navigateAutocomplete(1);
  if (e.key === "ArrowUp") navigateAutocomplete(-1);
});

navSearchBtn.addEventListener("click", () => {
  document.querySelector("#search-section").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => movieInput.focus(), 500);
});

// ── AUTOCOMPLETE ──────────────────────────────────────────────────────────

let acDebounce = null;

movieInput.addEventListener("input", () => {
  clearTimeout(acDebounce);
  const val = movieInput.value.trim();
  if (val.length < 2) { closeAutocomplete(); return; }
  acDebounce = setTimeout(() => renderAutocomplete(val), 180);
});

function renderAutocomplete(query) {
  const q = query.toLowerCase();
  const matches = movieTitles
    .filter(t => t.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { closeAutocomplete(); return; }

  autocompleteList.innerHTML = matches
    .map((t, i) => `<li role="option" tabindex="-1" data-title="${escapeHtml(t)}">${highlightMatch(t, query)}</li>`)
    .join("");

  autocompleteList.classList.remove("hidden");

  autocompleteList.querySelectorAll("li").forEach(li => {
    li.addEventListener("mousedown", e => {
      e.preventDefault();
      movieInput.value = li.dataset.title;
      closeAutocomplete();
      handleSearch();
    });
  });
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    `<strong style="color:#fff">${escapeHtml(text.slice(idx, idx + query.length))}</strong>` +
    escapeHtml(text.slice(idx + query.length))
  );
}

function navigateAutocomplete(dir) {
  const items = autocompleteList.querySelectorAll("li");
  if (!items.length) return;
  let current = autocompleteList.querySelector("[aria-selected='true']");
  let idx = -1;
  items.forEach((item, i) => { if (item === current) idx = i; });
  if (current) current.removeAttribute("aria-selected");
  idx = Math.max(0, Math.min(items.length - 1, idx + dir));
  items[idx].setAttribute("aria-selected", "true");
  movieInput.value = items[idx].dataset.title;
}

function closeAutocomplete() {
  autocompleteList.classList.add("hidden");
  autocompleteList.innerHTML = "";
}

document.addEventListener("click", e => {
  if (!searchBar.contains(e.target)) closeAutocomplete();
});

// ── MAIN FETCH ────────────────────────────────────────────────────────────

async function handleSearch() {
  const query = movieInput.value.trim();
  if (!query) {
    shakeSearchBar();
    return;
  }
  closeAutocomplete();
  showLoading(true);
  hideResults();

  try {
    const res = await fetch(`${API_BASE}/recommended/${encodeURIComponent(query)}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();

    // Cache titles for autocomplete
    if (data.recommendations) {
      data.recommendations.forEach(m => {
        if (!movieTitles.includes(m.title)) movieTitles.push(m.title);
      });
      if (!movieTitles.includes(data.searched_movie)) movieTitles.unshift(data.searched_movie);
    }

    showResults(data);
  } catch (err) {
    showToast(
      err.message.includes("not found") || err.message.includes("404")
        ? `"${query}" was not found. Check the spelling or try a different title.`
        : `Could not reach the server. Make sure the backend is running on port 8000.`
    );
  } finally {
    showLoading(false);
  }
}

// ── RESULTS ───────────────────────────────────────────────────────────────

function showResults(data) {
  queriedMovie.textContent = data.searched_movie;
  cardsGrid.innerHTML = "";

  data.recommendations.forEach((movie, i) => {
    const card = buildCard(movie, i);
    cardsGrid.appendChild(card);
  });

  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideResults() {
  resultsSection.classList.add("hidden");
}

function buildCard(movie, index) {
  const card = document.createElement("article");
  card.className = "movie-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details for ${movie.title}`);

  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

  // Use poster URL from backend response; fall back to gradient if unavailable
  const posterStyle = movie.poster
    ? `background-image:url(${movie.poster});background-size:cover;background-position:center top`
    : `background:${gradient}`;

  card.innerHTML = `
    <div class="card__poster" style="${posterStyle}" id="poster-${movie.movie_id}"></div>
    <div class="card__overlay"></div>
    <div class="card__play">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>
    <div class="card__rank">${index + 1}</div>
    <div class="card__info">
      <div class="card__title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</div>
      <div class="card__id">TMDB #${movie.movie_id}</div>
    </div>
  `;

  card.addEventListener("click", () => openModal(movie));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openModal(movie); });

  return card;
}

// ── MODAL ─────────────────────────────────────────────────────────────────

function openModal(movie) {
  currentModal = movie;

  modalTitle.textContent = movie.title;
  modalMeta.innerHTML = `
    <span class="meta-tag">TMDB #${movie.movie_id}</span>
    <span class="meta-tag">Recommended</span>
  `;

  modalTMDB.href = `${TMDB_URL}/${movie.movie_id}`;

  // Use poster URL from the backend response stored on the movie object
  if (movie.poster) {
    modalPoster.style.backgroundImage = `url(${movie.poster})`;
    modalPoster.style.backgroundSize = "cover";
    modalPoster.style.backgroundPosition = "center top";
    modalPoster.style.background = "";
  } else {
    modalPoster.style.backgroundImage = "";
    modalPoster.style.background = CARD_GRADIENTS[0];
  }

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Focus trap
  setTimeout(() => modalClose.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  currentModal = null;
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

modalRecommend.addEventListener("click", () => {
  if (!currentModal) return;
  movieInput.value = currentModal.title;
  closeModal();
  handleSearch();
});

// ── NEW SEARCH ────────────────────────────────────────────────────────────

newSearchBtn.addEventListener("click", () => {
  hideResults();
  movieInput.value = "";
  document.querySelector(".hero").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => movieInput.focus(), 600);
});

// ── LOADING ───────────────────────────────────────────────────────────────

function showLoading(show) {
  loadingOverlay.classList.toggle("hidden", !show);
  searchBtn.disabled = show;
}

// ── TOAST ─────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  toastMessage.textContent = msg;
  errorToast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5500);
}

function hideToast() {
  errorToast.classList.add("hidden");
}

toastClose.addEventListener("click", hideToast);

// ── SEARCH BAR SHAKE ─────────────────────────────────────────────────────

function shakeSearchBar() {
  searchBar.style.animation = "none";
  searchBar.offsetHeight; // reflow
  searchBar.style.animation = "shake 0.4s ease";
  searchBar.addEventListener("animationend", () => {
    searchBar.style.animation = "";
  }, { once: true });
}

// Inject shake keyframe
(function () {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-8px); }
      40%      { transform: translateX(8px); }
      60%      { transform: translateX(-5px); }
      80%      { transform: translateX(5px); }
    }
  `;
  document.head.appendChild(s);
})();

// ── UTILITY ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── INTERSECTION OBSERVER (animate on scroll) ─────────────────────────────

const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".step-card").forEach(el => {
  el.style.opacity = "0";
  el.style.transform = "translateY(24px)";
  el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
  io.observe(el);
});

// ── INITIAL FOCUS ─────────────────────────────────────────────────────────
window.addEventListener("load", () => {
  // Small delay so fonts render first
  setTimeout(() => movieInput.focus(), 300);
});
