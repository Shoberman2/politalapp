function authHeaders(session) {
  if (!session?.access_token) {
    throw new Error('Sign in to use Civic Briefings.')
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error?.message || 'Request failed.')
  }
  return data
}

export async function getBriefingSettings(session) {
  const response = await fetch('/api/briefings', {
    headers: authHeaders(session),
  })
  return readJson(response)
}

export async function saveBriefingPreference(session, payload) {
  const response = await fetch('/api/briefings', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

export async function generateBriefingPreview(session, payload) {
  const response = await fetch('/api/briefings/preview', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

export async function sendBriefingNow(session, payload) {
  const response = await fetch('/api/briefings/send', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

export async function startGmailConnect(session, redirectTo) {
  const response = await fetch('/api/briefings/gmail/start', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ redirectTo }),
  })
  return readJson(response)
}

export async function disconnectGmail(session) {
  const response = await fetch('/api/briefings/gmail/disconnect', {
    method: 'POST',
    headers: authHeaders(session),
  })
  return readJson(response)
}

export async function startConsumerCheckout(session, returnUrl) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ plan: 'consumer', returnUrl }),
  })
  return readJson(response)
}
