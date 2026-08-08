const API = (() => {
  async function request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }

    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    // auth
    status: () => request('GET', '/api/auth/status'),
    me: () => request('GET', '/api/auth/me'),
    register: (payload) => request('POST', '/api/auth/register', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: () => request('POST', '/api/auth/logout'),

    // requests
    listFeed: () => request('GET', '/api/requests'),
    listMine: () => request('GET', '/api/requests/mine'),
    listReferring: () => request('GET', '/api/requests/referring'),
    getRequest: (id) => request('GET', `/api/requests/${id}`),
    createRequest: (payload) => request('POST', '/api/requests', payload),
    addComment: (requestId, payload) => request('POST', `/api/requests/${requestId}/comments`, payload),

    deleteRequest: (id) => request('DELETE', `/api/requests/${id}`),

    // connections
    connect: (requestId, payload) => request('POST', `/api/requests/${requestId}/connect`, payload || {}),

    // referrals
    submitReferral: (connectionId, payload) => request('POST', `/api/connections/${connectionId}/refer`, payload),

    // thanks
    sendThanks: (referralId, payload) => request('POST', `/api/referrals/${referralId}/thank`, payload || {}),

    // rankings
    rankings: () => request('GET', '/api/rankings'),

    // notifications
    notifications: () => request('GET', '/api/notifications'),
    markAllRead: () => request('POST', '/api/notifications/read-all'),

    // invites & member management (admin)
    listInvites: () => request('GET', '/api/invites'),
    createInvite: (payload) => request('POST', '/api/invites', payload),
    toggleInvite: (id) => request('PATCH', `/api/invites/${id}/toggle`),
    listMembers: () => request('GET', '/api/invites/members'),
    createMember: (payload) => request('POST', '/api/invites/members', payload),
    deleteMember: (id) => request('DELETE', `/api/invites/members/${id}`),
  };
})();
