const state = {
  user: null,
  tab: 'feed',
  data: {
    feed: [],
    mine: [],
    referring: [],
    rankings: [],
    notifications: [],
    invites: [],
    members: [],
  },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(iso) {
  const then = new Date(iso.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABEL = {
  open: 'Open', connected: 'Connected', referred: 'Referred', thanked: 'Thanked', closed: 'Closed',
};

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'toast--error' : ''}`;
  el.textContent = message;
  $('#toastRoot').appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => {
    el.classList.remove('toast--in');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

/* ---------------------------- Auth screens ---------------------------- */

async function renderAuthGate() {
  const params = new URLSearchParams(window.location.search);
  const inviteFromLink = params.get('invite') || '';

  let hasAdmin = false;
  try {
    const res = await API.status();
    hasAdmin = res.hasAdmin;
  } catch (_) {}

  // Once admin account is created, hide account creation tab on landing page unless visiting via an invite link
  const showRegister = !hasAdmin || Boolean(inviteFromLink);

  $('#app').innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <div class="gate-seal" aria-hidden="true"></div>
        <h1 class="gate-title">The Referral Desk</h1>
        <p class="gate-sub">A members-only room for passing each other forward.</p>

        ${showRegister ? `
          <div class="gate-tabs" role="tablist">
            <button class="gate-tab is-active" data-form="login" type="button">Sign in</button>
            <button class="gate-tab" data-form="register" type="button">Join with an invite</button>
          </div>
        ` : ''}

        <form id="loginForm" class="gate-form">
          <label>Email
            <input type="email" name="email" required autocomplete="email" />
          </label>
          <label>Password
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <p class="form-error" id="loginError"></p>
          <button type="submit" class="btn btn--primary btn--block">Sign in</button>
        </form>

        ${showRegister ? `
          <form id="registerForm" class="gate-form" hidden>
            <label>Invite code
              <input type="text" name="inviteCode" required value="${escapeHtml(inviteFromLink)}" placeholder="Paste the code from your invite link" />
            </label>
            <label>Full name
              <input type="text" name="name" required autocomplete="name" />
            </label>
            <label>Email
              <input type="email" name="email" required autocomplete="email" />
            </label>
            <label>Password
              <input type="password" name="password" required minlength="6" autocomplete="new-password" />
            </label>
            <p class="form-hint">At least 6 characters.</p>
            <p class="form-error" id="registerError"></p>
            <button type="submit" class="btn btn--primary btn--block">Create account</button>
          </form>
        ` : ''}
      </div>
    </div>
  `;

  if (showRegister) {
    $$('.gate-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.gate-tab').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const which = btn.dataset.form;
        $('#loginForm').hidden = which !== 'login';
        $('#registerForm').hidden = which !== 'register';
      });
    });

    $('#registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#registerError').textContent = '';
      try {
        const { user } = await API.register({
          inviteCode: fd.get('inviteCode'),
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
        });
        state.user = user;
        await boot();
      } catch (err) {
        $('#registerError').textContent = err.message;
      }
    });

    if (inviteFromLink) {
      const tabs = $$('.gate-tab');
      if (tabs[1]) tabs[1].click();
    }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginError').textContent = '';
    try {
      const { user } = await API.login({ email: fd.get('email'), password: fd.get('password') });
      state.user = user;
      await boot();
    } catch (err) {
      $('#loginError').textContent = err.message;
    }
  });
}

/* ------------------------------ App shell ------------------------------ */

function renderShell() {
  $('#app').innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar-brand">
          <span class="topbar-seal" aria-hidden="true"></span>
          The Referral Desk
        </div>
        <nav class="topbar-tabs">
          <button class="tab-btn" data-tab="feed">Feed</button>
          <button class="tab-btn" data-tab="mine">My requests</button>
          <button class="tab-btn" data-tab="referring">My referring</button>
          <button class="tab-btn" data-tab="rankings">Rankings</button>
          <button class="tab-btn" data-tab="notifications">Notifications<span class="notif-badge" id="notifBadge" hidden></span></button>
          ${state.user.is_admin ? '<button class="tab-btn" data-tab="admin">Invites</button>' : ''}
        </nav>
        <div class="topbar-actions">
          <span class="topbar-user">${escapeHtml(state.user.name)}</span>
          <button class="btn btn--ghost btn--sm" id="signOutBtn">Sign out</button>
        </div>
      </header>

      <main class="content" id="tabContent"></main>
    </div>
    <div id="modalRoot"></div>
  `;

  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('#signOutBtn').addEventListener('click', async () => {
    await API.logout();
    state.user = null;
    renderAuthGate();
  });
}

function setActiveTabButton() {
  $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
}

async function switchTab(tab) {
  state.tab = tab;
  setActiveTabButton();
  const content = $('#tabContent');
  content.innerHTML = '<div class="loading">Loading\u2026</div>';

  try {
    if (tab === 'feed') {
      state.data.feed = (await API.listFeed()).requests;
      renderFeed();
    } else if (tab === 'mine') {
      state.data.mine = (await API.listMine()).requests;
      renderMine();
    } else if (tab === 'referring') {
      state.data.referring = (await API.listReferring()).requests;
      renderReferring();
    } else if (tab === 'rankings') {
      state.data.rankings = (await API.rankings()).rankings;
      renderRankings();
    } else if (tab === 'notifications') {
      state.data.notifications = (await API.notifications()).notifications;
      renderNotificationsTab();
    } else if (tab === 'admin') {
      const [invitesRes, membersRes] = await Promise.all([
        API.listInvites(),
        API.listMembers(),
      ]);
      state.data.invites = invitesRes.invites;
      state.data.members = membersRes.members;
      renderAdmin();
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

/* -------------------------------- Feed --------------------------------- */

function statusBadge(status) {
  return `<span class="badge badge--${status}">${STATUS_LABEL[status] || status}</span>`;
}

function renderFeed() {
  const requests = state.data.feed;

  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>Referral requests</h2>
        <p class="content-sub">All active referral requests posted across members.</p>
      </div>
      <button class="btn btn--primary" id="newRequestBtn">+ New request</button>
    </div>
    ${requests.length ? `<div class="card-grid">${requests.map(feedCard).join('')}</div>`
      : `<div class="empty-state">No open requests yet. Be the first to ask for a referral — use "+ New request" above.</div>`}
  `;

  $('#newRequestBtn').addEventListener('click', openNewRequestModal);
  $$('.js-connect').forEach((btn) => btn.addEventListener('click', () => openConnectModal(btn.dataset.id, btn.dataset.title)));
  bindCommentForms();
  bindDeleteRequestButtons();
}

function feedCard(r) {
  const isMine = r.requester_id === state.user.id;
  const canDelete = isMine || (state.user && state.user.is_admin);
  return `
    <article class="card ${isMine ? 'card--mine' : ''}">
      <div class="card-top">
        ${statusBadge(r.status)}
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="card-meta">${timeAgo(r.created_at)}</span>
          ${canDelete ? `<button class="btn btn--ghost btn--sm js-delete-request" data-id="${r.id}" data-title="${escapeHtml(r.title)}" style="color: var(--coral); padding: 0.15rem 0.45rem;">Delete</button>` : ''}
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(r.title)}</h3>
      <p class="card-desc">${escapeHtml(r.description)}</p>
      <div class="card-foot">
        <span class="card-by">Asked by ${escapeHtml(r.requester_name)}${isMine ? ' <span class="chip chip--me">you</span>' : ''}</span>
        <span class="card-connections">${r.connection_count} connected</span>
      </div>
      ${isMine
        ? `<button class="btn btn--ghost btn--block" disabled>Your request</button>`
        : (r.status !== 'closed' ? `<button class="btn btn--secondary btn--block js-connect" data-id="${r.id}" data-title="${escapeHtml(r.title)}">I can connect &amp; refer</button>` : '')
      }
      ${renderCommentsSection(r)}
    </article>
  `;
}

function openNewRequestModal() {
  renderModal(`
    <h3>New referral request</h3>
    <p class="modal-sub">Describe the role, company, or team so a connector knows exactly who to introduce you to.</p>
    <form id="newRequestForm" class="modal-form">
      <label>Title
        <input type="text" name="title" required placeholder="e.g. Finance Analyst @ Acme Corp" maxlength="120" />
      </label>
      <label>What do you need?
        <textarea name="description" required rows="5" placeholder="Which team, what the referral should cover, links to the job posting, deadlines, anything a referrer should know\u2026"></textarea>
      </label>
      <p class="form-error" id="newRequestError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Post request</button>
      </div>
    </form>
  `);

  $('#newRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.createRequest({ title: fd.get('title'), description: fd.get('description') });
      closeModal();
      toast('Request posted.');
      switchTab('mine');
    } catch (err) {
      $('#newRequestError').textContent = err.message;
    }
  });
}

function openConnectModal(requestId, title) {
  renderModal(`
    <h3>Connect on "${escapeHtml(title)}"</h3>
    <p class="modal-sub">Provide your referral details to connect with the requester.</p>
    <form id="connectForm" class="modal-form">
      <label>Give your referral details here
        <textarea name="note" rows="4" required placeholder="Give your referral details here\u2026"></textarea>
      </label>
      <p class="form-error" id="connectError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Connect &amp; Submit Details</button>
      </div>
    </form>
  `);

  $('#connectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.connect(requestId, { note: fd.get('note') });
      closeModal();
      toast('You\u2019re connected. They\u2019ve been notified.');
      switchTab('feed');
    } catch (err) {
      $('#connectError').textContent = err.message;
    }
  });
}

/* ------------------------------ My requests ----------------------------- */

function renderMine() {
  const list = state.data.mine;
  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>My requests</h2>
        <p class="content-sub">Track connections, referrals, and send your thank-yous.</p>
      </div>
      <button class="btn btn--primary" id="newRequestBtn2">+ New request</button>
    </div>
    ${list.length ? list.map(mineCard).join('') : `<div class="empty-state">You haven't posted a request yet. Tell the room what referral you need.</div>`}
  `;
  $('#newRequestBtn2').addEventListener('click', openNewRequestModal);
  $$('.js-thank').forEach((btn) => btn.addEventListener('click', () => openThankModal(btn.dataset.referralId, btn.dataset.referrer)));
  bindCommentForms();
  bindDeleteRequestButtons();
}

function mineCard(r) {
  const canDelete = r.requester_id === state.user.id || (state.user && state.user.is_admin);
  const connections = r.connections.map((c) => `
    <li class="thread-item">
      <strong>${escapeHtml(c.referrer_name)}</strong> connected ${timeAgo(c.created_at)}
      ${c.note ? `<div class="thread-note">"${escapeHtml(c.note)}"</div>` : ''}
      <span class="chip chip--${c.status}">${c.status === 'referred' ? 'Referral submitted' : c.status === 'connected' ? 'Awaiting referral' : c.status}</span>
    </li>`).join('');

  const referralBlock = r.referral ? `
    <div class="thread-referral">
      <div class="thread-referral-head">Referral from ${escapeHtml(r.referral.referrer_name)}</div>
      <p>${escapeHtml(r.referral.description)}</p>
      ${r.thanks
        ? `<div class="thanked-note">Thank-you letter sent ${timeAgo(r.thanks.created_at)}. ✓</div>`
        : `<button class="btn btn--accent js-thank" data-referral-id="${r.referral.id}" data-referrer="${escapeHtml(r.referral.referrer_name)}">Say thank you</button>`}
    </div>` : '';

  return `
    <article class="card card--wide">
      <div class="card-top">
        ${statusBadge(r.status)}
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="card-meta">${timeAgo(r.created_at)}</span>
          ${canDelete ? `<button class="btn btn--ghost btn--sm js-delete-request" data-id="${r.id}" data-title="${escapeHtml(r.title)}" style="color: var(--coral); padding: 0.15rem 0.45rem;">Delete</button>` : ''}
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(r.title)}</h3>
      <p class="card-desc">${escapeHtml(r.description)}</p>
      ${r.connections.length ? `<ul class="thread-list">${connections}</ul>` : `<p class="card-empty">No one has connected yet.</p>`}
      ${referralBlock}
      ${renderCommentsSection(r)}
    </article>
  `;
}

function openThankModal(referralId, referrerName) {
  renderModal(`
    <h3>Thank ${escapeHtml(referrerName)}</h3>
    <p class="modal-sub">We'll turn this into a proper letter and deliver it to their screen.</p>
    <form id="thankForm" class="modal-form">
      <label>Add a personal line (optional)
        <textarea name="personalNote" rows="3" placeholder="Anything you want to add in your own words\u2026"></textarea>
      </label>
      <p class="form-error" id="thankError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Send thank-you letter</button>
      </div>
    </form>
  `);

  $('#thankForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { thanks } = await API.sendThanks(referralId, { personalNote: fd.get('personalNote') });
      showLetterReveal(thanks.letter);
      switchTab('mine');
    } catch (err) {
      $('#thankError').textContent = err.message;
    }
  });
}

function showLetterReveal(letterText) {
  renderModal(`
    <div class="letter-reveal">
      <div class="letter-seal" id="letterSeal"></div>
      <div class="letter-paper" id="letterPaper" hidden>
        <pre class="letter-text">${escapeHtml(letterText)}</pre>
        <button class="btn btn--primary" data-close>Close</button>
      </div>
    </div>
  `, 'letter-modal');

  setTimeout(() => {
    $('#letterSeal').classList.add('is-cracking');
    setTimeout(() => {
      $('#letterSeal').hidden = true;
      $('#letterPaper').hidden = false;
    }, 700);
  }, 350);
}

/* ------------------------------ My referring ---------------------------- */

function renderReferring() {
  const list = state.data.referring;
  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>My referring</h2>
        <p class="content-sub">People you've connected with. Submit your referral write-up, then wait for a thank-you.</p>
      </div>
    </div>
    ${list.length ? list.map(referringCard).join('') : `<div class="empty-state">You haven't connected with anyone yet. Head to the Feed to find someone to refer.</div>`}
  `;
  $$('.js-submit-referral').forEach((btn) => btn.addEventListener('click', () => openReferModal(btn.dataset.connectionId, btn.dataset.title)));
  bindCommentForms();
}

function referringCard(r) {
  const myConnection = r.connections.find((c) => c.referrer_id === state.user.id);
  const myReferral = r.referral && r.referral.referrer_id === state.user.id ? r.referral : null;

  let actionBlock = '';
  if (!myReferral && myConnection) {
    actionBlock = `<button class="btn btn--accent js-submit-referral" data-connection-id="${myConnection.id}" data-title="${escapeHtml(r.title)}">Submit referral details</button>`;
  } else if (myReferral) {
    actionBlock = `
      <div class="thread-referral">
        <div class="thread-referral-head">Your referral</div>
        <p>${escapeHtml(myReferral.description)}</p>
        ${r.thanks ? renderReceivedLetter(r.thanks) : `<p class="card-empty">Waiting on their thank-you.</p>`}
      </div>`;
  }

  return `
    <article class="card card--wide">
      <div class="card-top">
        ${statusBadge(r.status)}
        <span class="card-meta">${timeAgo(r.created_at)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(r.title)}</h3>
      <p class="card-desc">${escapeHtml(r.description)}</p>
      <p class="card-by">For ${escapeHtml(r.requester_name)}</p>
      ${actionBlock}
      ${renderCommentsSection(r)}
    </article>
  `;
}

function renderCommentsSection(r) {
  const comments = r.comments || [];
  return `
    <div class="comments-section">
      <div class="comments-head">💬 Replies (${comments.length})</div>
      ${comments.length ? `
        <div class="comments-list">
          ${comments.map((c) => `
            <div class="comment-item">
              <div class="comment-head">
                <strong>${escapeHtml(c.author_name)}</strong>
                <span class="comment-time">${timeAgo(c.created_at)}</span>
              </div>
              <div class="comment-body">${escapeHtml(c.content)}</div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="comments-empty">No replies yet. Be the first to leave a reply!</p>`}
      <form class="comment-form js-comment-form" data-id="${r.id}">
        <input type="text" name="content" required placeholder="Write a reply or offer advice..." autocomplete="off" />
        <button type="submit" class="btn btn--sm btn--primary">Reply</button>
      </form>
    </div>
  `;
}

function bindCommentForms() {
  $$('.js-comment-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const requestId = form.dataset.id;
      const input = form.querySelector('input[name="content"]');
      const content = (input ? input.value : '').trim();
      if (!content) return;
      try {
        await API.addComment(requestId, { content });
        toast('Reply posted.');
        await switchTab(state.tab);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

function renderReceivedLetter(thanks) {
  return `
    <div class="letter-inline">
      <div class="letter-inline-head">A thank-you letter arrived ✉️</div>
      <pre class="letter-text letter-text--inline">${escapeHtml(thanks.letter)}</pre>
    </div>
  `;
}

function openReferModal(connectionId, title) {
  renderModal(`
    <h3>Referral details for "${escapeHtml(title)}"</h3>
    <p class="modal-sub">Describe the referral you made — who you spoke to, what you shared, next steps.</p>
    <form id="referForm" class="modal-form">
      <label>Referral description
        <textarea name="description" required rows="5" placeholder="e.g. Introduced them to the hiring manager over email and forwarded their resume through the internal portal\u2026"></textarea>
      </label>
      <p class="form-error" id="referError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Submit referral</button>
      </div>
    </form>
  `);

  $('#referForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.submitReferral(connectionId, { description: fd.get('description') });
      closeModal();
      toast('Referral submitted.');
      switchTab('referring');
    } catch (err) {
      $('#referError').textContent = err.message;
    }
  });
}

/* -------------------------------- Rankings ------------------------------- */

function renderRankings() {
  const rows = state.data.rankings;
  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>Rankings</h2>
        <p class="content-sub">Who's referring the most people in the room.</p>
      </div>
    </div>
    ${rows.length ? `
      <table class="rank-table">
        <thead>
          <tr><th>#</th><th>Member</th><th>Referrals made</th><th>Thank-yous received</th><th>Connections made</th></tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${r.id === state.user.id ? 'is-me' : ''}">
              <td class="rank-pos">${i + 1}</td>
              <td>${escapeHtml(r.name)}${r.id === state.user.id ? ' <span class="chip chip--me">you</span>' : ''}</td>
              <td>${r.referrals_made}</td>
              <td>${r.thanks_received}</td>
              <td>${r.connections_made}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `<div class="empty-state">No connections yet — rankings fill in as members start referring each other.</div>`}
  `;
}

/* --------------------------------- Admin --------------------------------- */

function renderAdmin() {
  const invites = state.data.invites;
  const members = state.data.members;

  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>Members</h2>
        <p class="content-sub">All registered members and active accounts.</p>
      </div>
      <button class="btn btn--primary" id="addMemberBtn">+ Add Member</button>
    </div>

    ${members.length ? `
      <table class="rank-table" style="margin-bottom: 2.5rem;">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Requests posted</th><th>Referrals made</th><th>Joined</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${members.map((m) => `
            <tr class="${m.id === state.user.id ? 'is-me' : ''}">
              <td><strong>${escapeHtml(m.name)}</strong>${m.id === state.user.id ? ' <span class="chip chip--me">you</span>' : ''}</td>
              <td>${escapeHtml(m.email)}</td>
              <td>${m.is_admin ? '<span class="chip chip--connected">Admin</span>' : '<span class="chip">Member</span>'}</td>
              <td>${m.request_count || 0}</td>
              <td>${m.referral_count || 0}</td>
              <td>${timeAgo(m.created_at)}</td>
              <td>
                ${m.id !== state.user.id ? `<button class="btn btn--ghost btn--sm js-delete-member" data-id="${m.id}" data-name="${escapeHtml(m.name)}" style="color: var(--coral);">Delete</button>` : '\u2014'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `<div class="empty-state" style="margin-bottom: 2.5rem;">No members registered yet.</div>`}

    <div class="content-head" style="margin-top: 1rem;">
      <div>
        <h2>Invite links</h2>
        <p class="content-sub">Create links so new members can join the room themselves.</p>
      </div>
      <button class="btn btn--secondary" id="newInviteBtn">+ New invite link</button>
    </div>

    ${invites.length ? `
      <table class="rank-table">
        <thead><tr><th>Label</th><th>Link</th><th>Uses</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${invites.map((inv) => `
            <tr>
              <td>${escapeHtml(inv.label || '\u2014')}</td>
              <td><code class="invite-code">${window.location.origin}/?invite=${inv.code}</code></td>
              <td>${inv.uses}${inv.max_uses ? ` / ${inv.max_uses}` : ''}</td>
              <td>${inv.is_active ? '<span class="chip chip--connected">Active</span>' : '<span class="chip">Off</span>'}</td>
              <td>
                <button class="btn btn--ghost btn--sm js-copy" data-code="${inv.code}">Copy</button>
                <button class="btn btn--ghost btn--sm js-toggle" data-id="${inv.id}">${inv.is_active ? 'Turn off' : 'Turn on'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `<div class="empty-state">No invite links yet. Create the first one to start bringing members in.</div>`}
  `;

  $('#addMemberBtn').addEventListener('click', openAddMemberModal);
  $('#newInviteBtn').addEventListener('click', openNewInviteModal);
  $$('.js-copy').forEach((btn) => btn.addEventListener('click', () => {
    const link = `${window.location.origin}/?invite=${btn.dataset.code}`;
    navigator.clipboard.writeText(link).then(() => toast('Invite link copied.'));
  }));
  $$('.js-toggle').forEach((btn) => btn.addEventListener('click', async () => {
    await API.toggleInvite(btn.dataset.id);
    switchTab('admin');
  }));
  $$('.js-delete-member').forEach((btn) => btn.addEventListener('click', async () => {
    const memberId = btn.dataset.id;
    const name = btn.dataset.name;
    if (!confirm(`Are you sure you want to delete member "${name}"? This action cannot be undone.`)) return;
    try {
      await API.deleteMember(memberId);
      toast('Member removed.');
      await switchTab('admin');
    } catch (err) {
      toast(err.message, true);
    }
  }));
}

function bindDeleteRequestButtons() {
  $$('.js-delete-request').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const requestId = btn.dataset.id;
      const title = btn.dataset.title;
      if (!confirm(`Are you sure you want to delete the request "${title}"?`)) return;
      try {
        await API.deleteRequest(requestId);
        toast('Request deleted.');
        await switchTab(state.tab);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

function openAddMemberModal() {
  renderModal(`
    <h3>Add member directly</h3>
    <form id="addMemberForm" class="modal-form">
      <label>Full Name
        <input type="text" name="name" required placeholder="e.g. Alex Morgan" autocomplete="off" />
      </label>
      <label>Email
        <input type="email" name="email" required placeholder="e.g. alex@example.com" autocomplete="off" />
      </label>
      <label>Password
        <input type="password" name="password" required minlength="6" placeholder="At least 6 characters" autocomplete="new-password" />
      </label>
      <p class="form-error" id="addMemberError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Add member</button>
      </div>
    </form>
  `);

  $('#addMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.createMember({
        name: fd.get('name'),
        email: fd.get('email'),
        password: fd.get('password'),
      });
      closeModal();
      toast('New member added successfully.');
      switchTab('admin');
    } catch (err) {
      $('#addMemberError').textContent = err.message;
    }
  });
}

function openNewInviteModal() {
  renderModal(`
    <h3>New invite link</h3>
    <form id="newInviteForm" class="modal-form">
      <label>Label (optional)
        <input type="text" name="label" placeholder="e.g. Finance cohort" maxlength="60" />
      </label>
      <label>Max uses (optional)
        <input type="number" name="maxUses" min="0" placeholder="Leave blank for unlimited" />
      </label>
      <p class="form-error" id="newInviteError"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Create link</button>
      </div>
    </form>
  `);

  $('#newInviteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.createInvite({ label: fd.get('label'), maxUses: fd.get('maxUses') });
      closeModal();
      toast('Invite link created.');
      switchTab('admin');
    } catch (err) {
      $('#newInviteError').textContent = err.message;
    }
  });
}

/* -------------------------------- Notifications --------------------------- */

async function refreshNotificationsBadge() {
  const { notifications } = await API.notifications();
  state.data.notifications = notifications;
  const unread = notifications.filter((n) => !n.is_read).length;
  const badge = $('#notifBadge');
  if (badge) {
    badge.textContent = unread;
    badge.hidden = unread === 0;
  }
}

function renderNotificationsTab() {
  const notifs = state.data.notifications;
  const unreadCount = notifs.filter((n) => !n.is_read).length;

  $('#tabContent').innerHTML = `
    <div class="content-head">
      <div>
        <h2>Notifications</h2>
        <p class="content-sub">Updates on your referral requests and connections.</p>
      </div>
      ${unreadCount > 0 ? '<button class="btn btn--secondary" id="markReadTabBtn">Mark all read</button>' : ''}
    </div>
    ${notifs.length ? `
      <div class="notif-card-list">
        ${notifs.map((n) => `
          <div class="notif-card ${n.is_read ? '' : 'is-unread'}">
            <div class="notif-card-msg">${escapeHtml(n.message)}</div>
            <div class="notif-card-time">${timeAgo(n.created_at)}</div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="empty-state">No notifications yet.</div>`}
  `;

  if ($('#markReadTabBtn')) {
    $('#markReadTabBtn').addEventListener('click', async () => {
      await API.markAllRead();
      await refreshNotificationsBadge();
      await switchTab('notifications');
    });
  }
}

/* ---------------------------------- Modal ---------------------------------- */

function renderModal(innerHtml, extraClass = '') {
  $('#modalRoot').innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal ${extraClass}" role="dialog" aria-modal="true">${innerHtml}</div>
    </div>
  `;
  $('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
  $$('[data-close]').forEach((btn) => btn.addEventListener('click', closeModal));
}

function closeModal() {
  $('#modalRoot').innerHTML = '';
}

/* ----------------------------------- Boot ----------------------------------- */

async function boot() {
  renderShell();
  await refreshNotificationsBadge();
  await switchTab('feed');
}

(async function init() {
  try {
    const { user } = await API.me();
    state.user = user;
    await boot();
  } catch (_) {
    renderAuthGate();
  }
})();
