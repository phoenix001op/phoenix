/* ==========================================================================
   PHOENIX — app logic (Discover, which also handles search, + My Reviews)
   Clicking any anime card opens its full detail in a new tab (detail.html).
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- ember particle field ---- */
  const emberField = document.getElementById('emberField');
  function spawnEmbers(count = 26) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'ember-particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 80}px`);
      p.style.animationDuration = `${8 + Math.random() * 10}s`;
      p.style.animationDelay = `${Math.random() * 12}s`;
      p.style.opacity = String(0.3 + Math.random() * 0.5);
      emberField.appendChild(p);
    }
  }
  spawnEmbers();

  /* ---- nav / view switching ---- */
  const navBtns = document.querySelectorAll('.main-nav button.nav-btn');
  const views = {
    discover: document.getElementById('view-discover'),
    reviews: document.getElementById('view-reviews')
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('is-hidden', key !== name);
    });
    navBtns.forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === name));
    if (name === 'reviews') renderReviews();
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  /* ---- card rendering helper ---- */
  function cardHTML(anime) {
    const img = anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || 'Untitled';
    const score = anime.score ? anime.score.toFixed(1) : '—';
    const type = anime.type || 'TV';
    const year = anime.year || '';
    const saved = PhoenixStore.get(anime.mal_id);

    return `
      <div class="anime-card" data-id="${anime.mal_id}">
        <div class="card-poster">
          <img src="${img}" alt="${title}" loading="lazy">
          <span class="card-score">★ ${score}</span>
          ${saved ? `<span class="card-your-score">You: ${saved.score}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          <div class="card-meta">${type}${year ? ' · ' + year : ''}</div>
        </div>
      </div>
    `;
  }

  function bindCardClicks(container) {
    container.querySelectorAll('.anime-card').forEach(card => {
      card.addEventListener('click', () => {
        window.open(`detail.html?id=${encodeURIComponent(card.dataset.id)}`, '_blank');
      });
    });
  }

  function renderGrid(container, list, emptyMessage) {
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="loader">${emptyMessage}</div>`;
      return;
    }
    container.innerHTML = list.map(cardHTML).join('');
    bindCardClicks(container);
  }

  /* ---- discover view: status filter + type filter + refresh + search ---- */
  const discoverGrid = document.getElementById('discoverGrid');
  const discoverHeading = document.getElementById('discoverHeading');
  const statusChips = document.querySelectorAll('#seasonFilters .chip');
  const typeChips = document.querySelectorAll('#typeFilters .chip');
  const refreshBtn = document.getElementById('refreshDiscover');
  const filterRows = document.querySelectorAll('#seasonFilters, #typeFilters');
  const searchStatus = document.getElementById('searchStatus');
  const searchStatusText = document.getElementById('searchStatusText');
  const clearSearchBtn = document.getElementById('clearSearch');

  const RESULTS_PER_LOAD = 20; // Kitsu's documented pagination cap — requests above this get rejected
  const FILTER_LABELS = { airing: 'Currently Airing', upcoming: 'Rising Soon', bypopularity: 'All-Time Favorites' };

  let currentFilter = 'airing';
  let currentType = 'all';
  let isSearchMode = false;
  let activeQuery = '';

  function randomOffset() {
    // "Airing Now" and "Rising Soon" are naturally smaller lists than
    // "All-Time Favorites", so keep the random range modest — an offset
    // past the end of a short list just returns nothing.
    const maxOffset = currentFilter === 'bypopularity' ? 400 : 120;
    return Math.floor(Math.random() * maxOffset);
  }

  async function loadDiscover() {
    isSearchMode = false;
    searchStatus.classList.add('is-hidden');
    filterRows.forEach(row => row.classList.remove('is-hidden'));
    discoverHeading.textContent = FILTER_LABELS[currentFilter];
    discoverGrid.innerHTML = '<div class="loader">Stoking the embers…</div>';
    try {
      let list = await PhoenixAPI.getList(currentFilter, currentType, RESULTS_PER_LOAD, randomOffset());
      if (list.length === 0) {
        // random offset likely landed past the end of a shorter list — fall back to the top
        list = await PhoenixAPI.getList(currentFilter, currentType, RESULTS_PER_LOAD, 0);
      }
      renderGrid(discoverGrid, list, 'Nothing found for this combination — try a different type.');
    } catch (e) {
      console.error(e);
      discoverGrid.innerHTML = '<div class="loader">The embers went out — the API may be rate-limiting us. Hit Refresh in a moment.</div>';
    }
  }

  async function runSearch(query) {
    if (!query || !query.trim()) return;
    isSearchMode = true;
    activeQuery = query.trim();
    showView('discover');
    filterRows.forEach(row => row.classList.add('is-hidden'));
    searchStatus.classList.remove('is-hidden');
    searchStatusText.textContent = `Searching for "${activeQuery}"`;
    discoverHeading.textContent = 'Search Results';
    discoverGrid.innerHTML = '<div class="loader">Searching the archive…</div>';
    try {
      const list = await PhoenixAPI.search(activeQuery, 'all', RESULTS_PER_LOAD);
      searchStatusText.textContent = `Results for "${activeQuery}"`;
      renderGrid(discoverGrid, list, `No anime found for "${activeQuery}".`);
    } catch (e) {
      console.error(e);
      searchStatusText.textContent = `Search failed for "${activeQuery}"`;
      discoverGrid.innerHTML = '<div class="loader">Search failed — the API may be rate-limiting us. Try again shortly.</div>';
    }
  }

  statusChips.forEach(chip => {
    chip.addEventListener('click', () => {
      statusChips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentFilter = chip.dataset.filter;
      loadDiscover();
    });
  });

  typeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      typeChips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentType = chip.dataset.type;
      loadDiscover();
    });
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('is-spinning');
    const task = isSearchMode ? runSearch(activeQuery) : loadDiscover();
    task.finally(() => setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400));
  });

  clearSearchBtn.addEventListener('click', () => {
    heroInput.value = '';
    loadDiscover();
  });

  loadDiscover();

  // when the tab regains focus (e.g. coming back from a detail tab),
  // quietly refresh the *current* view so "You: X" badges stay in sync
  // — reload the same batch/search rather than a random new one
  window.addEventListener('focus', () => {
    if (!views.reviews.classList.contains('is-hidden')) renderReviews();
  });

  /* ---- hero search — feeds results into the Discover grid ---- */
  const heroForm = document.getElementById('heroSearchForm');
  const heroInput = document.getElementById('heroSearchInput');

  heroForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(heroInput.value);
  });

  /* ---- reviews view ---- */
  const reviewsGrid = document.getElementById('reviewsGrid');
  const reviewsEmpty = document.getElementById('reviewsEmpty');

  function renderReviews() {
    const all = PhoenixStore.getAll();
    if (all.length === 0) {
      reviewsGrid.innerHTML = '';
      reviewsEmpty.classList.remove('is-hidden');
      return;
    }
    reviewsEmpty.classList.add('is-hidden');
    reviewsGrid.innerHTML = all.map(r => `
      <div class="anime-card" data-id="${r.malId}">
        <div class="card-poster">
          <img src="${r.image}" alt="${r.title}" loading="lazy">
          <span class="card-your-score">You: ${r.score}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${r.title}</div>
          <div class="card-meta">${r.review ? 'Reviewed' : 'Rated only'}</div>
        </div>
      </div>
    `).join('');
    bindCardClicks(reviewsGrid);
  }

});