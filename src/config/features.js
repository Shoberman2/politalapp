// Public watchlists are part of the shipped product. An explicit false value
// remains available as an emergency kill switch; missing configuration must not
// silently remove a route from production again.
export const SHOW_BILL_ALERTS = import.meta.env.VITE_BILL_ALERTS_ENABLED !== 'false'

// Email delivery stays opt-in until a verified sender and delivery credentials
// are configured. The in-app watchlist and official-event history do not depend
// on this flag.
export const BILL_ALERT_EMAIL_ENABLED = import.meta.env.VITE_BILL_ALERT_EMAIL_ENABLED === 'true'
