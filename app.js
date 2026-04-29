/**
 * NyayaVoice App — Main Controller
 * Uses IndexedDB via db.js for all persistence.
 */

const ADMIN_KEY = 'nyayavoice_admin';

class App {
  constructor() {
    this.currentView = 'view-home';
    this.dbReady = false;
    this.currentLang = 'EN';
    this.langCodes = { 'EN': 'en-IN', 'HI': 'hi-IN', 'KN': 'kn-IN' };
    this.bootApp();
  }

  async bootApp() {
    // Initialize database
    await nyayaDB.open();
    await nyayaDB.seedIfEmpty();
    this.dbReady = true;

    this.bindEvents();
  }

  bindEvents() {
    // Splash
    document.getElementById('start-btn').addEventListener('click', () => {
      const splash = document.getElementById('splash-screen');
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('app-main').style.display = 'block';
        document.getElementById('bottom-nav').style.display = 'flex';
        this.renderHome();
        this.updateNotifBadge();
      }, 400);
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.showView(e.currentTarget.getAttribute('data-target'));
      });
    });

    // Submit form
    document.getElementById('submit-form').addEventListener('submit', (e) => this.handleSubmit(e));

    // Category tiles
    document.querySelectorAll('.cat-tile').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cat-tile').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    });

    // Reporter type toggle
    document.querySelectorAll('.reporter-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.reporter-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });

    // Copy ID
    document.getElementById('copy-id-btn')?.addEventListener('click', () => {
      const id = document.getElementById('new-tracking-id').innerText;
      navigator.clipboard.writeText(id).then(() => this.showToast('Tracking ID copied!', 'success'));
    });

    // Filter chips (home)
    document.querySelectorAll('.filter-chip[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderHome(btn.getAttribute('data-filter'));
      });
    });

    // Track search
    document.getElementById('track-search-btn').addEventListener('click', () => this.handleTrackSearch());
    document.getElementById('track-id-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleTrackSearch();
    });

    // Image preview
    document.getElementById('complaint-image')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const preview = document.getElementById('proof-preview');
        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
        document.getElementById('upload-ui-content').innerHTML = `<i class="ri-check-line" style="color:var(--success)"></i><span>${file.name}</span>`;
      }
    });

    // Voice
    this.setupVoice();

    // Language switching
    document.getElementById('lang-cycle-btn')?.addEventListener('click', () => this.cycleLanguage());

    // Notification bell
    document.getElementById('notification-bell-btn')?.addEventListener('click', () => this.toggleNotifDrawer());
    document.getElementById('close-notif-btn')?.addEventListener('click', () => this.closeNotifDrawer());
    document.getElementById('drawer-overlay')?.addEventListener('click', () => this.closeNotifDrawer());
    window.addEventListener('nyaya_notification', () => this.updateNotifBadge());

    // Admin login
    document.getElementById('admin-login-form').addEventListener('submit', (e) => this.handleAdminLogin(e));
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
      localStorage.removeItem(ADMIN_KEY);
      document.getElementById('admin-dashboard-screen').classList.add('hidden');
      document.getElementById('admin-login-screen').classList.remove('hidden');
      this.showToast('Logged out', 'info');
    });

    // Restore admin session
    if (localStorage.getItem(ADMIN_KEY)) {
      document.getElementById('admin-login-screen').classList.add('hidden');
      document.getElementById('admin-dashboard-screen').classList.remove('hidden');
    }

    // Admin filters
    document.querySelectorAll('.filter-chip[data-admin-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip[data-admin-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderAdmin(btn.getAttribute('data-admin-filter'));
      });
    });

    // Admin modals
    document.getElementById('close-modal-btn')?.addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));
    document.getElementById('admin-update-form')?.addEventListener('submit', (e) => this.handleAdminUpdate(e));
    document.getElementById('close-audit-btn')?.addEventListener('click', () => document.getElementById('audit-modal').classList.add('hidden'));

    // Export DB button (in Safety page — bonus)
    // Can be triggered from console: app.exportDB()
  }

  // ─── VIEW MANAGEMENT ────────────────────────────────
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
    document.querySelector(`[data-target="${viewId}"]`)?.classList.add('active');
    this.currentView = viewId;

    if (viewId === 'view-home') this.renderHome();
    if (viewId === 'view-admin' && localStorage.getItem(ADMIN_KEY)) this.renderAdmin();
    if (viewId === 'view-submit') this.resetSubmitForm();
  }

  resetSubmitForm() {
    document.getElementById('submit-form-wrapper').classList.remove('hidden');
    document.getElementById('submit-success').classList.add('hidden');
    document.getElementById('submit-form').reset();
    document.querySelectorAll('.cat-tile').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.reporter-option').forEach((o, i) => { o.classList.toggle('selected', i === 0); });
    document.getElementById('proof-preview')?.classList.add('hidden');
    document.getElementById('upload-ui-content').innerHTML = '<i class="ri-camera-2-line"></i><span>Tap to upload photo evidence</span>';
    
    // Clear interim text markers if any
    const textArea = document.getElementById('complaint-text');
    if (textArea) textArea.value = '';
  }

  cycleLanguage() {
    const langs = Object.keys(this.langCodes);
    let idx = langs.indexOf(this.currentLang);
    idx = (idx + 1) % langs.length;
    this.currentLang = langs[idx];
    
    const label = document.getElementById('lang-label');
    if (label) label.innerText = this.currentLang;
    
    this.showToast(`Language switched to ${this.currentLang}`, 'info');
    
    // Update UI text (simple version)
    this.updateUITranslations();
  }

  updateUITranslations() {
    // This can be expanded to full i18n
    const translations = {
      'EN': { 'report_title': 'Report a Grievance', 'track_title': 'Track Status' },
      'HI': { 'report_title': 'शिकायत दर्ज करें', 'track_title': 'स्थिति ट्रैक करें' },
      'KN': { 'report_title': 'ದೂರು ಸಲ್ಲಿಸಿ', 'track_title': 'ಸ್ಥಿತಿಯನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ' }
    };
    
    const trans = translations[this.currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (trans[key]) el.innerText = trans[key];
    });
  }

  // ─── TOAST ──────────────────────────────────────────
  showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    const icons = { success: 'ri-checkbox-circle-fill', error: 'ri-error-warning-fill', info: 'ri-information-line' };
    const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--primary)' };
    t.innerHTML = `<i class="${icons[type] || icons.info}" style="color:${colors[type] || colors.info}"></i><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ─── HOME / DASHBOARD ──────────────────────────────
  async renderHome(filter = 'all') {
    if (!this.dbReady) return;
    const list = document.getElementById('home-complaints-list');
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="ri-loader-4-line ri-spin" style="font-size:1.5rem"></i></div>';

    const stats = await nyayaDB.getStats();
    document.getElementById('stat-total-num').innerText = stats.total;
    document.getElementById('stat-pending-num').innerText = stats.pending;
    document.getElementById('stat-progress-num').innerText = stats.inProgress;
    document.getElementById('stat-resolved-num').innerText = stats.resolved;
    document.getElementById('mini-trust-score').innerText = stats.total;

    let db = await nyayaDB.getAllComplaints();

    if (filter === 'resolved') db = db.filter(c => c.status === 'Resolved');
    else if (filter === 'urgent') db = db.filter(c => c.status === 'Pending');
    else if (filter === 'verified') db = db.filter(c => (c.upvotes || 0) >= 10);

    list.innerHTML = '';
    if (!db.length) {
      list.innerHTML = '<div class="glass-card" style="text-align:center;padding:30px;"><p style="color:var(--text-muted)">No complaints found.</p></div>';
      return;
    }

    db.forEach(c => {
      const score = (c.upvotes || 0) - (c.downvotes || 0);
      const statusClass = c.status === 'Pending' ? 'pending' : c.status === 'Resolved' ? 'resolved' : 'in-progress';
      const card = document.createElement('div');
      card.className = 'complaint-card';
      card.innerHTML = `
        <div class="card-header">
          <div>
            <strong style="font-size:.9rem">${c.category}</strong>
            <span style="margin-left:8px;font-size:.75rem;color:var(--text-muted)">${c.id}</span>
          </div>
          <span class="status-badge ${statusClass}">${c.status}</span>
        </div>
        <p style="font-size:.9rem;color:var(--text-muted);margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${c.text}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--glass-border);">
          <span style="font-size:.75rem;color:var(--text-muted)">${new Date(c.date).toLocaleDateString()}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn-outline-sm" onclick="app.showAuditLog('${c.id}')" style="font-size:.75rem;padding:4px 8px;" title="Audit Log"><i class="ri-history-line"></i></button>
            <button class="btn-outline-sm" onclick="app.vote('${c.id}','up',this)" style="font-size:.75rem;padding:4px 8px;">👍 ${score}</button>
          </div>
        </div>`;
      list.appendChild(card);
    });
  }

  // ─── SUBMIT ─────────────────────────────────────────
  async handleSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('complaint-text').value.replace(/\[.*?\]/g, '').trim();
    
    if (!text) {
      this.showToast('Please describe your grievance', 'error');
      return;
    }

    const btn = document.getElementById('submit-btn');
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';
    btn.disabled = true;
    const category = document.querySelector('.cat-tile.active')?.getAttribute('data-cat') || 'Other';
    const reporterType = document.querySelector('.reporter-option.selected input')?.value || 'self';
    const newId = 'NYV-' + Math.floor(1000 + Math.random() * 9000);
    const hash = await nyayaDB._generateHash(newId + text + Date.now());

    const complaint = {
      id: newId,
      hash,
      category,
      text,
      status: 'Pending',
      upvotes: 1,
      downvotes: 0,
      date: new Date().toISOString(),
      proof: null,
      reporterType,
      location: null
    };

    await nyayaDB.addComplaint(complaint);
    await nyayaDB.addNotification(`New complaint ${newId} submitted (${category})`, newId);

    document.getElementById('submit-form-wrapper').classList.add('hidden');
    document.getElementById('submit-success').classList.remove('hidden');
    document.getElementById('new-tracking-id').innerText = newId;
    document.getElementById('new-hash-id').innerText = hash;

    btn.innerHTML = '<i class="ri-secure-payment-line"></i><span>Submit Securely</span>';
    btn.disabled = false;
    this.showToast('Complaint registered securely!', 'success');
  }

  // ─── TRACK ──────────────────────────────────────────
  async handleTrackSearch() {
    const id = document.getElementById('track-id-input').value.trim().toUpperCase();
    const container = document.getElementById('track-result');
    if (!id) { this.showToast('Enter a tracking ID', 'error'); return; }

    const c = await nyayaDB.getComplaint(id);
    container.classList.remove('hidden');

    if (!c) {
      container.innerHTML = `<div class="glass-card" style="text-align:center;padding:30px;"><i class="ri-error-warning-line" style="font-size:2rem;color:var(--danger)"></i><p style="margin-top:10px;color:var(--text-muted)">No complaint found: ${id}</p></div>`;
      return;
    }

    const logs = await nyayaDB.getAuditLogs(id);
    const chain = await nyayaDB.verifyChain(id);
    const statusClass = c.status === 'Pending' ? 'pending' : c.status === 'Resolved' ? 'resolved' : 'in-progress';

    const timeline = logs.map(e => `
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="font-size:1.2rem">${e.icon}</div>
        <div style="flex:1">
          <strong style="font-size:.9rem">${e.action}</strong>
          <p style="font-size:.75rem;color:var(--text-muted)">${new Date(e.date).toLocaleString()}</p>
          <code style="font-size:.6rem;color:var(--text-muted);word-break:break-all;">Hash: ${e.hash}</code>
        </div>
      </div>`).join('');

    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <div><strong>${c.category}</strong><span style="margin-left:8px;font-size:.8rem;color:var(--text-muted)">${c.id}</span></div>
          <span class="status-badge ${statusClass}">${c.status}</span>
        </div>
        <p style="margin:12px 0;font-size:.9rem;color:var(--text-muted)">${c.text}</p>
        ${c.proof ? `<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px;margin-bottom:12px;"><i class="ri-check-double-line" style="color:var(--success)"></i> <strong>Resolution:</strong> <span style="color:var(--text-muted)">${c.proof}</span></div>` : ''}
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <div style="font-size:.8rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;"><i class="ri-links-fill"></i> <code style="color:var(--primary)">${c.hash}</code></div>
          <div style="font-size:.8rem;color:${chain.valid ? 'var(--success)' : 'var(--danger)'};display:flex;align-items:center;gap:4px;"><i class="ri-${chain.valid ? 'shield-check' : 'alarm-warning'}-fill"></i> ${chain.valid ? 'Chain Verified' : 'CHAIN BROKEN'}</div>
        </div>
        <h4 style="margin-bottom:12px;font-size:.9rem;display:flex;align-items:center;gap:6px;"><i class="ri-route-line"></i> Timeline (${logs.length} entries)</h4>
        ${timeline}
      </div>`;
  }

  // ─── AUDIT LOG MODAL ───────────────────────────────
  async showAuditLog(id) {
    const logs = await nyayaDB.getAuditLogs(id);
    const chain = await nyayaDB.verifyChain(id);
    const modal = document.getElementById('audit-modal');
    const list = document.getElementById('audit-log-list');

    list.innerHTML = `
      <div style="margin-bottom:12px;font-size:.8rem;color:${chain.valid ? 'var(--success)' : 'var(--danger)'};display:flex;align-items:center;gap:6px;">
        <i class="ri-${chain.valid ? 'shield-check' : 'alarm-warning'}-fill"></i> ${chain.message}
      </div>` +
      logs.map(e => `
        <div style="display:flex;gap:12px;margin-bottom:16px;padding:10px;background:rgba(255,255,255,.03);border-radius:10px;">
          <div style="font-size:1.3rem">${e.icon}</div>
          <div style="flex:1">
            <strong style="font-size:.9rem">${e.action}</strong>
            <p style="font-size:.75rem;color:var(--text-muted)">${new Date(e.date).toLocaleString()} — ${e.actor}</p>
            <code style="font-size:.55rem;color:var(--text-muted);word-break:break-all;">🔗 ${e.hash}</code>
          </div>
        </div>`).join('');

    modal.classList.remove('hidden');
  }

  // ─── VOTING ─────────────────────────────────────────
  async vote(id, type, btn) {
    try {
      await nyayaDB.voteComplaint(id, type);
      this.renderHome();
      this.showToast('Vote recorded', 'success');
    } catch (e) { this.showToast('Vote failed', 'error'); }
  }

  // ─── NOTIFICATIONS ─────────────────────────────────
  async updateNotifBadge() {
    const count = await nyayaDB.getUnreadCount();
    const badge = document.getElementById('notification-badge');
    if (count > 0) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  }

  async toggleNotifDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer.classList.contains('hidden')) {
      const notifs = await nyayaDB.getNotifications();
      const list = document.getElementById('notifications-list');
      if (!notifs.length) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">No notifications</p>';
      } else {
        list.innerHTML = notifs.map(n => `
          <div style="padding:12px;background:rgba(255,255,255,${n.read ? '.03' : '.08'});border-radius:10px;border-left:3px solid ${n.read ? 'transparent' : 'var(--primary)'};cursor:pointer;" onclick="app.goToComplaint('${n.complaintId}')">
            <p style="font-size:.85rem">${n.message}</p>
            <span style="font-size:.7rem;color:var(--text-muted)">${new Date(n.date).toLocaleString()}</span>
          </div>`).join('');
      }
      drawer.classList.remove('hidden');
      drawer.classList.add('open');
      overlay.classList.remove('hidden');
      await nyayaDB.markAllRead();
      this.updateNotifBadge();
    } else {
      this.closeNotifDrawer();
    }
  }

  closeNotifDrawer() {
    document.getElementById('notifications-drawer').classList.add('hidden');
    document.getElementById('notifications-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.add('hidden');
  }

  goToComplaint(id) {
    if (!id) return;
    this.closeNotifDrawer();
    document.getElementById('track-id-input').value = id;
    this.showView('view-track');
    setTimeout(() => this.handleTrackSearch(), 200);
  }

  // ─── VOICE (Robust Speech-to-Text) ───────────────────
  setupVoice() {
    const voiceBtn = document.getElementById('voice-btn');
    const voiceLabel = document.getElementById('voice-btn-label');
    const visualizer = document.getElementById('voice-visualizer');
    const statusText = document.getElementById('voice-status-text');
    const textArea = document.getElementById('complaint-text');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      voiceBtn.title = 'Voice not supported in this browser';
      voiceBtn.style.opacity = '0.4';
      voiceBtn.addEventListener('click', () => this.showToast('Voice not supported. Use Chrome or Edge.', 'error'));
      return;
    }

    let recognition = null;
    let isRecording = false;
    let networkRetries = 0;
    const MAX_RETRIES = 3;
    let userWantsToRecord = false; // Tracks if user intends to keep recording

    // Create a fresh recognition instance (fixes stale network errors)
    const createRecognition = () => {
      const rec = new SR();
      rec.continuous = false;          // FALSE avoids Chrome network errors
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = this.langCodes[this.currentLang] || 'en-IN';
      return rec;
    };

    const updateUI = (recording) => {
      if (recording) {
        voiceBtn.classList.add('voice-active');
        voiceLabel.innerText = 'Stop';
        visualizer.classList.remove('hidden');
      } else {
        voiceBtn.classList.remove('voice-active');
        voiceLabel.innerText = 'Speak';
        visualizer.classList.add('hidden');
      }
    };

    const startRecording = async () => {
      // Check mic permission first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        const msgs = {
          'NotAllowedError': '🚫 Mic access denied. Allow it in browser settings.',
          'NotFoundError': '🎤 No microphone found. Plug one in and retry.'
        };
        this.showToast(msgs[err.name] || '🎤 Mic error: ' + err.message, 'error');
        return;
      }

      userWantsToRecord = true;
      networkRetries = 0;
      attemptStart();
    };

    const attemptStart = () => {
      // Create fresh instance each time (avoids stale state)
      recognition = createRecognition();
      wireEvents(recognition);

      try {
        recognition.start();
        isRecording = true;
        updateUI(true);
        if (statusText) statusText.innerText = 'Listening... speak now';
        if (networkRetries === 0) this.showToast('🎤 Listening... speak now', 'info');
      } catch (e) {
        console.error('Start error:', e);
        setTimeout(() => attemptStart(), 500);
      }
    };

    const stopRecording = () => {
      userWantsToRecord = false;
      isRecording = false;
      networkRetries = 0;
      try { if (recognition) recognition.stop(); } catch(e) {}
      updateUI(false);
      // Clean interim markers
      textArea.value = textArea.value.replace(/\s*\[.*?\]\s*$/g, '').trim();
      if (textArea.value.trim()) {
        this.showToast('✅ Voice captured!', 'success');
      }
    };

    const wireEvents = (rec) => {
      rec.onresult = (event) => {
        networkRetries = 0; // Reset retries on success
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            // Append final text directly
            const clean = textArea.value.replace(/\s*\[.*?\]\s*$/, '').trim();
            textArea.value = (clean ? clean + ' ' : '') + text;
            if (statusText) statusText.innerText = '✅ Got it! Keep speaking...';
          } else {
            interim = text;
          }
        }
        
        // Show interim text in the textarea with visual feedback
        if (interim) {
          const clean = textArea.value.replace(/\s*\[.*?\]\s*$/, '').trim();
          textArea.value = (clean ? clean + ' ' : '') + '[' + interim + '...]';
          if (statusText) statusText.innerText = '🔊 ' + interim;
        }
      };

      rec.onend = () => {
        // Auto-restart if user still wants to record (simulates continuous mode)
        if (userWantsToRecord && isRecording) {
          setTimeout(() => {
            if (userWantsToRecord) attemptStart();
          }, 200);
          return;
        }
        isRecording = false;
        updateUI(false);
      };

      rec.onerror = (event) => {
        console.warn('Speech error:', event.error);

        // NETWORK ERROR — auto-retry silently
        if (event.error === 'network') {
          networkRetries++;
          if (networkRetries <= MAX_RETRIES && userWantsToRecord) {
            if (statusText) statusText.innerText = `Reconnecting... (${networkRetries}/${MAX_RETRIES})`;
            console.log(`Network retry ${networkRetries}/${MAX_RETRIES}`);
            // Wait longer between each retry
            setTimeout(() => {
              if (userWantsToRecord) attemptStart();
            }, 1000 * networkRetries);
            return;
          }
          // All retries exhausted
          stopRecording();
          this.showToast('🌐 Voice service unavailable. Make sure you have internet and try again.', 'error');
          return;
        }

        // NO SPEECH — auto-restart silently
        if (event.error === 'no-speech') {
          if (userWantsToRecord) {
            if (statusText) statusText.innerText = 'No speech heard... still listening';
            // onend will auto-restart
          }
          return;
        }

        // ABORTED — user or system cancelled, stop silently
        if (event.error === 'aborted') {
          if (!userWantsToRecord) stopRecording();
          return;
        }

        // NOT ALLOWED
        if (event.error === 'not-allowed') {
          stopRecording();
          this.showToast('🚫 Mic access denied. Allow microphone in browser settings.', 'error');
          return;
        }

        // SERVICE NOT AVAILABLE
        if (event.error === 'service-not-available') {
          stopRecording();
          this.showToast('⚠️ Speech service unavailable. Try Chrome browser.', 'error');
          return;
        }

        // AUDIO CAPTURE
        if (event.error === 'audio-capture') {
          stopRecording();
          this.showToast('🎤 No microphone detected. Check your mic.', 'error');
          return;
        }

        // Anything else
        stopRecording();
        this.showToast('Voice error: ' + event.error, 'error');
      };
    };

    // Button click
    voiceBtn.addEventListener('click', () => {
      if (isRecording) stopRecording();
      else startRecording();
    });

    // Track page voice search
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    if (voiceSearchBtn) {
      voiceSearchBtn.addEventListener('click', () => {
        const trackRec = createRecognition();
        trackRec.continuous = false;
        trackRec.interimResults = false;

        try {
          trackRec.start();
          voiceSearchBtn.innerHTML = '<i class="ri-mic-fill" style="color:var(--danger)"></i> Listening...';
          this.showToast('🎤 Say the tracking ID...', 'info');
        } catch(e) {
          this.showToast('Could not start voice search', 'error');
        }

        trackRec.onresult = (e) => {
          const text = e.results[0][0].transcript.replace(/\s+/g, '-').toUpperCase();
          document.getElementById('track-id-input').value = text;
          voiceSearchBtn.innerHTML = '<i class="ri-mic-line"></i> Search by Voice';
          this.handleTrackSearch();
        };
        trackRec.onend = () => { voiceSearchBtn.innerHTML = '<i class="ri-mic-line"></i> Search by Voice'; };
        trackRec.onerror = (ev) => {
          voiceSearchBtn.innerHTML = '<i class="ri-mic-line"></i> Search by Voice';
          if (ev.error === 'network') this.showToast('🌐 Voice needs internet. Type the ID instead.', 'info');
        };
      });
    }
  }

  // ─── ADMIN ──────────────────────────────────────────
  handleAdminLogin(e) {
    e.preventDefault();
    if (document.getElementById('admin-id').value === 'admin' && document.getElementById('admin-pass').value === 'admin123') {
      localStorage.setItem(ADMIN_KEY, 'true');
      document.getElementById('admin-login-screen').classList.add('hidden');
      document.getElementById('admin-dashboard-screen').classList.remove('hidden');
      this.renderAdmin();
      this.showToast('Logged in as Admin', 'success');
    } else { this.showToast('Invalid credentials', 'error'); }
  }

  async renderAdmin(filter = 'all') {
    const list = document.getElementById('admin-complaints-list');
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="ri-loader-4-line ri-spin" style="font-size:1.5rem"></i></div>';

    let db = await nyayaDB.getAllComplaints();
    if (filter !== 'all') db = db.filter(c => c.status === filter);

    list.innerHTML = '';
    db.forEach(c => {
      const statusClass = c.status === 'Pending' ? 'pending' : c.status === 'Resolved' ? 'resolved' : 'in-progress';
      const card = document.createElement('div');
      card.className = 'complaint-card';
      card.innerHTML = `
        <div class="card-header">
          <div><strong style="font-size:.85rem">${c.id}</strong><span style="margin-left:8px;font-size:.8rem;color:var(--text-muted)">${c.category}</span></div>
          <span class="status-badge ${statusClass}">${c.status}</span>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">${c.text}</p>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary-sm" onclick="app.openAdminModal('${c.id}')" style="font-size:.8rem;padding:8px 14px;"><i class="ri-edit-2-line"></i> Update</button>
          <button class="btn-outline-sm" onclick="app.showAuditLog('${c.id}')" style="font-size:.8rem;padding:8px 14px;"><i class="ri-history-line"></i> Log</button>
        </div>`;
      list.appendChild(card);
    });
  }

  openAdminModal(id) {
    document.getElementById('admin-complaint-id').value = id;
    document.getElementById('admin-proof-text').value = '';
    document.querySelectorAll('.status-radio-option input').forEach(r => r.checked = false);
    document.getElementById('admin-modal').classList.remove('hidden');
  }

  async handleAdminUpdate(e) {
    e.preventDefault();
    const id = document.getElementById('admin-complaint-id').value;
    const status = document.querySelector('.status-radio-option input:checked')?.value;
    const proof = document.getElementById('admin-proof-text').value;

    if (!status) { this.showToast('Select a status', 'error'); return; }
    if (status === 'Resolved' && !proof.trim()) { this.showToast('Proof required to resolve', 'error'); return; }

    const updates = { status };
    if (proof) updates.proof = proof;

    await nyayaDB.updateComplaint(id, updates);
    await nyayaDB.addNotification(`Complaint ${id} updated to ${status}`, id);

    document.getElementById('admin-modal').classList.add('hidden');
    this.renderAdmin();
    this.showToast(`${id} → ${status}`, 'success');
  }

  // ─── EXPORT (bonus) ────────────────────────────────
  async exportDB() {
    const data = await nyayaDB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nyayavoice_backup_${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
    this.showToast('Database exported!', 'success');
  }
}

const app = new App();
window.app = app;
