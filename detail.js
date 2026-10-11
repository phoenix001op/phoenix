/* ==========================================================================
   PHOENIX — detail page logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- ember particle field (same ambient effect as the main page) ---- */
  const emberField = document.getElementById('emberField');
  function spawnEmbers(count = 20) {
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

  const detailContent = document.getElementById('detailContent');

  const params = new URLSearchParams(window.location.search);
  const malId = params.get('id');

  if (!malId) {
    detailContent.innerHTML = `
      <div class="loader" style="padding:100px 28px;">
        No anime was specified. <a href="index.html">Go back to Phoenix</a> and pick one from a list.
      </div>`;
    return;
  }

  loadAndRender(malId);

  async function loadAndRender(id) {
    detailContent.innerHTML = '<div class="loader" style="padding:100px 28px;">Loading details…</div>';
    try {
      const anime = await PhoenixAPI.getById(id);
      document.title = `${anime.title_english || anime.title} — Phoenix`;
      renderDetail(anime);
    } catch (e) {
      console.error(e);
      detailContent.innerHTML = `
        <div class="loader" style="padding:100px 28px;">
          Couldn't load this title — the API may be rate-limiting us or briefly down. 
          <button class="btn-ghost" id="retryLoad" style="margin-left:8px;">Try again</button>
        </div>`;
      document.getElementById('retryLoad')?.addEventListener('click', () => loadAndRender(id));
    }
  }

  function renderDetail(anime) {
    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || 'Untitled';
    const saved = PhoenixStore.get(anime.mal_id) || { score: 0, review: '' };
    const genres = anime.genres || [];
    const synopsis = anime.synopsis ? anime.synopsis.trim() : 'No synopsis available for this title yet.';

    // IMDb-style rating badge: big number out of 10, plus rank context if we have it
    const scoreDisplay = anime.score ? anime.score.toFixed(1) : '—';
    const rankBits = [];
    if (anime.ratingRank) rankBits.push(`#${anime.ratingRank} by rating`);
    if (anime.popularityRank) rankBits.push(`#${anime.popularityRank} in popularity`);

    const metaRows = [
      ['Type', anime.type],
      ['Episodes', anime.episodes || 'Unknown'],
      ['Status', anime.status],
      ['Season', anime.season || 'Unknown'],
      ['Studio', anime.studios && anime.studios.length ? anime.studios.join(', ') : 'Unlisted']
    ];

    // always offer Crunchyroll (opens a search for this title) unless Kitsu already listed it
    const watchLinks = [...(anime.streamingLinks || [])];
    if (!watchLinks.some(s => /crunchyroll/i.test(s.url + s.siteName))) {
      watchLinks.push({
        url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`,
        siteName: 'Crunchyroll'
      });
    }

    detailContent.innerHTML = `
      <div class="detail-hero detail-hero-page"><img src="${img}" alt="${title}"></div>
      <div class="detail-body detail-body-page">

        <div class="detail-top-row">
          <div>
            <h1 class="detail-title detail-title-page">${title}</h1>
            <div class="detail-genres">
              ${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('') || '<span class="genre-tag">Uncategorized</span>'}
            </div>
          </div>
          <div class="rating-badge">
            <span class="rating-badge-num">${scoreDisplay}</span>
            <span class="rating-badge-max">/10</span>
            ${rankBits.length ? `<span class="rating-badge-rank">${rankBits.join(' · ')}</span>` : ''}
          </div>
        </div>

        <div class="meta-grid">
          ${metaRows.map(([label, val]) => `
            <div class="meta-cell">
              <span class="meta-cell-label">${label}</span>
              <span class="meta-cell-value">${val}</span>
            </div>
          `).join('')}
        </div>

        <p class="detail-synopsis">${synopsis}</p>

        <div class="watch-block">
          <h3>Where to Watch</h3>
          ${watchLinks.length
            ? `<div class="watch-links">
                ${watchLinks.map(s => `
                  <a class="watch-pill" href="${s.url}" target="_blank" rel="noopener">${s.siteName}</a>
                `).join('')}
               </div>`
            : `<p class="watch-empty">No official streaming links listed on Kitsu for this title yet — try checking Crunchyroll or the anime's official site directly.</p>`
          }
        </div>

        <div class="rate-block">
          <h3>Rate this anime</h3>
          <p class="rate-caption">1 to 10, flame by flame.</p>
          <div class="flame-scale" id="flameScale">
            ${Array.from({ length: 10 }, (_, i) => `<div class="flame-seg" data-value="${i + 1}"></div>`).join('')}
          </div>
          <div class="flame-value" id="flameValue">
            ${saved.score ? `<strong>${saved.score}</strong> / 10` : 'Tap a flame to rate'}
          </div>
          <textarea class="review-textarea" id="reviewText" placeholder="What stuck with you? No spoilers needed, but they're allowed.">${saved.review || ''}</textarea>
          <div class="rate-actions">
            <button class="btn-primary" id="saveReview">Save to my trail</button>
            ${saved.score ? '<button class="btn-ghost" id="removeReview">Remove</button>' : ''}
            <span class="save-confirm" id="saveConfirm">Saved ✦</span>
          </div>
        </div>
      </div>
    `;

    // flame scale interactivity
    let currentScore = saved.score || 0;
    const flameScale = document.getElementById('flameScale');
    const flameValue = document.getElementById('flameValue');
    const segs = flameScale.querySelectorAll('.flame-seg');

    function paintFlames(value) {
      segs.forEach(seg => {
        seg.classList.toggle('is-lit', Number(seg.dataset.value) <= value);
      });
      flameValue.innerHTML = value ? `<strong>${value}</strong> / 10` : 'Tap a flame to rate';
    }
    paintFlames(currentScore);

    segs.forEach(seg => {
      seg.addEventListener('mouseenter', () => paintFlames(Number(seg.dataset.value)));
      seg.addEventListener('click', () => {
        currentScore = Number(seg.dataset.value);
        paintFlames(currentScore);
      });
    });
    flameScale.addEventListener('mouseleave', () => paintFlames(currentScore));

    document.getElementById('saveReview').addEventListener('click', () => {
      if (!currentScore) {
        flameValue.innerHTML = '<span style="color:var(--ash-red)">Pick a flame rating first</span>';
        return;
      }
      const reviewText = document.getElementById('reviewText').value;
      PhoenixStore.save(anime.mal_id, {
        title,
        image: img,
        score: currentScore,
        review: reviewText
      });
      const confirm = document.getElementById('saveConfirm');
      confirm.classList.add('is-shown');
      setTimeout(() => confirm.classList.remove('is-shown'), 1800);
      renderDetail(anime); // re-render to surface the Remove button on first save
    });

    const removeBtn = document.getElementById('removeReview');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        PhoenixStore.remove(anime.mal_id);
        renderDetail(anime);
      });
    }
  }

});