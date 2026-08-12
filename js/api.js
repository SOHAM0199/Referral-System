const API = (() => {
  async function request(method, url, body) {
    const res = await fetch(url, {
      method: method === 'DELETE' ? 'DELETE' : method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (_) {
      if (!res.ok) {
        throw new Error(text.replace(/<[^>]*>/g, '').trim() || `Server error (${res.status})`);
      }
    }

    if (!res.ok) {
      const err = new Error(data.error || `Server error (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    // auth
    status: () => request('GET', 'api/auth.php?action=status'),
    me: () => request('GET', 'api/auth.php?action=me'),
    register: (payload) => request('POST', 'api/auth.php?action=register', payload),
    login: (payload) => request('POST', 'api/auth.php?action=login', payload),
    logout: () => request('POST', 'api/auth.php?action=logout'),

    // requests
    listFeed: () => request('GET', 'api/requests.php'),
    listMine: () => request('GET', 'api/requests.php?action=mine'),
    listReferring: () => request('GET', 'api/requests.php?action=referring'),
    getRequest: (id) => request('GET', `api/requests.php?action=detail&id=${id}`),
    createRequest: (payload) => request('POST', 'api/requests.php', payload),
    addComment: (requestId, payload) => request('POST', `api/requests.php?action=comment&id=${requestId}`, payload),
    deleteRequest: (id) => request('DELETE', `api/requests.php?action=delete&id=${id}`),

    // connections
    connect: (requestId, payload) => request('POST', `api/connections.php?request_id=${requestId}`, payload || {}),

    // referrals
    submitReferral: (connectionId, payload) => request('POST', `api/referrals.php?connection_id=${connectionId}`, payload),

    // thanks
    sendThanks: (referralId, payload) => request('POST', `api/thanks.php?referral_id=${referralId}`, payload || {}),

    // rankings
    rankings: () => request('GET', 'api/rankings.php'),

    // notifications
    notifications: () => request('GET', 'api/notifications.php'),
    markAllRead: () => request('POST', 'api/notifications.php?action=read-all'),

    // invites & member management (admin)
    listInvites: () => request('GET', 'api/invites.php'),
    createInvite: (payload) => request('POST', 'api/invites.php', payload),
    toggleInvite: (id) => request('POST', `api/invites.php?action=toggle&id=${id}`),
    listMembers: () => request('GET', 'api/invites.php?action=members'),
    createMember: (payload) => request('POST', 'api/invites.php?action=members', payload),
    deleteMember: (id) => request('DELETE', `api/invites.php?action=members&id=${id}`),
  };
})();
