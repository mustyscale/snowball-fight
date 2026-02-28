/**
 * leaderboard.js — Supabase leaderboard (submit scores, fetch top 20, modal UI)
 *
 * Setup:
 *   1. Create a Supabase project and run the SQL in README or plan docs.
 *   2. Replace SUPABASE_URL and SUPABASE_KEY with your project values.
 *   3. The Supabase UMD CDN is loaded in index.html before this module.
 */

const SUPABASE_URL = 'https://ztbggrcggdtcudtnivxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0YmdncmNnZ2R0Y3VkdG5pdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzE2MTAsImV4cCI6MjA4Nzg0NzYxMH0.1xRwF3pYXfNIrvILWEsRdvsPH0J-RzL8DRmclekk-a8';

export class Leaderboard {
  constructor() {
    this._client = null;
    try {
      if (
        SUPABASE_URL.startsWith('YOUR_') ||
        SUPABASE_KEY.startsWith('YOUR_') ||
        !window.supabase
      ) return;
      this._client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) { /* ignore — leaderboard simply stays disabled */ }
  }

  get isConfigured() { return !!this._client; }

  // ── Submit ─────────────────────────────────────────────────

  async submit(name, score, wave, kills) {
    if (!this._client) return;
    try {
      // Rate-limit: one submission per 60 s
      const last = parseInt(localStorage.getItem('lb-last') ?? '0');
      if (Date.now() - last < 60_000) return;
      await this._client.from('leaderboard').insert({
        player_name: name.slice(0, 20),
        score,
        wave,
        kills,
      });
      localStorage.setItem('lb-last', String(Date.now()));
    } catch (e) { /* silent */ }
  }

  // ── Fetch ──────────────────────────────────────────────────

  async fetch(period = 'alltime') {
    if (!this._client) return [];
    try {
      let q = this._client
        .from('leaderboard')
        .select('player_name, score, wave, kills, created_at')
        .order('score', { ascending: false })
        .limit(20);

      if (period === 'daily')  q = q.gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
      if (period === 'weekly') q = q.gte('created_at', new Date(Date.now() - 604_800_000).toISOString());

      const { data } = await q;
      return data ?? [];
    } catch (e) { return []; }
  }

  // ── Modal ──────────────────────────────────────────────────

  showModal() {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Wire tabs (re-wire each time to avoid duplicate listeners)
    modal.querySelectorAll('.lb-tab').forEach(tab => {
      tab.onclick = () => {
        modal.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._loadTab(tab.dataset.period);
      };
    });

    // Wire close button
    const closeBtn = document.getElementById('lbClose');
    if (closeBtn) closeBtn.onclick = () => this.hideModal();

    // Default tab
    this._loadTab('alltime');
  }

  hideModal() {
    document.getElementById('leaderboardModal')?.classList.add('hidden');
  }

  async _loadTab(period) {
    const rows = document.getElementById('lbRows');
    if (!rows) return;

    if (!this._client) {
      rows.innerHTML = '<div class="lb-no-data">Leaderboard not configured yet.<br>Set SUPABASE_URL & KEY in leaderboard.js</div>';
      return;
    }

    rows.innerHTML = '<div class="lb-loading">Loading...</div>';
    const data = await this.fetch(period);

    if (!data.length) {
      rows.innerHTML = '<div class="lb-no-data">No scores yet — be the first! ❄️</div>';
      return;
    }

    rows.innerHTML = data.map((row, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      return `<div class="lb-row${i < 3 ? ' lb-top' : ''}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${this._sanitize(row.player_name)}</span>
        <span class="lb-score">${row.score.toLocaleString()}</span>
        <span class="lb-wave">W${row.wave}</span>
      </div>`;
    }).join('');
  }

  _sanitize(str) {
    return String(str).replace(/[<>&"']/g, c => (
      { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' }[c]
    ));
  }
}

export default Leaderboard;
