const DEV_API_URL = 'http://localhost:5000'

function trimTrailingSlash(value = '') {
  return value.replace(/\/+$/, '')
}

function isLocalhostHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function getOrigin() {
  if (typeof window === 'undefined') return ''
  return trimTrailingSlash(window.location.origin)
}

function getConfiguredUrl(value) {
  if (!value) return ''

  const normalized = trimTrailingSlash(value)

  if (typeof window === 'undefined') return normalized

  const currentHost = window.location.hostname

  try {
    const parsed = new URL(normalized)
    if (!isLocalhostHost(currentHost) && isLocalhostHost(parsed.hostname)) {
      return ''
    }
  } catch {
    return normalized
  }

  return normalized
}

export function getApiBaseUrl() {
  const configured = getConfiguredUrl(import.meta.env.VITE_API_URL)
  if (configured) return configured

  if (import.meta.env.DEV) return DEV_API_URL

  return getOrigin()
}

export function getWsBaseUrl() {
  const configured = getConfiguredUrl(import.meta.env.VITE_WS_URL)
  if (configured) return configured

  return getApiBaseUrl()
}
