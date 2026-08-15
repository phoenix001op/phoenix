/* ==========================================================================
   PHOENIX — local rating & review store (localStorage, per-browser)
   ========================================================================== */

const STORAGE_KEY = 'phoenix_reviews_v1';

function _readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Phoenix: could not read reviews from storage', e);
    return {};
  }
}

function _writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Phoenix: could not save reviews to storage', e);
  }
}

const PhoenixStore = {
  /**
   * Get the saved rating/review for one anime, or null.
   */
  get(malId) {
    const all = _readAll();
    return all[malId] || null;
  },

  /**
   * Get every saved rating/review, newest first.
   */
  getAll() {
    const all = _readAll();
    return Object.values(all).sort((a, b) => b.savedAt - a.savedAt);
  },

  /**
   * Save or update a rating/review for an anime.
   */
  save(malId, { title, image, score, review }) {
    const all = _readAll();
    all[malId] = {
      malId,
      title,
      image,
      score,
      review: review || '',
      savedAt: Date.now()
    };
    _writeAll(all);
  },

  /**
   * Remove a saved rating/review.
   */
  remove(malId) {
    const all = _readAll();
    delete all[malId];
    _writeAll(all);
  }
};