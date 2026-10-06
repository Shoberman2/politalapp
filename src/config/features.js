// Bill alerts and email briefings are switched off (2026-10-06): neither can
// deliver email in production yet, so the site does not offer them. The code
// stays in place; flip these to bring a feature back once its email delivery is
// configured and tested end to end.
export const SHOW_BILL_ALERTS = false
export const SHOW_BRIEFINGS = false

// Email delivery for bill alerts, if alerts come back. Stays opt-in until a
// verified sender and delivery credentials are configured.
export const BILL_ALERT_EMAIL_ENABLED = import.meta.env.VITE_BILL_ALERT_EMAIL_ENABLED === 'true'
