# Odds-Havens Product Architecture

## 1. Overview
The app should evolve from its current auth and notification foundation into a modular football prediction platform with a clear separation between customer-facing features, admin features, and analytics intelligence.

## 2. Core application modules

### A. Authentication and account module
Responsible for:
- user registration
- login/logout
- profile management
- session tracking
- device verification
- support tickets

Existing repo files that support this:
- `routes/auth.js`
- `database.sqlite`

### B. Notification and communication module
Responsible for:
- push notifications
- in-app notifications
- user alert preferences
- announcement delivery

Existing repo files:
- `services/notification-service.js`
- `push-server.js`
- `public/notification-client.js`
- `routes/push-subscriptions.js`

### C. Prediction and market module
Responsible for:
- match data
- categories
- prediction options
- odds display
- booking and results tracking

This is the largest missing domain.

### D. Personalization and recommendation module
Responsible for:
- learning user behavior
- generating “For You” sections
- category recommendations
- personalization rules

### E. Statistics and analytics module
Responsible for:
- historical performance
- category trends
- win/loss metrics
- accuracy tracking
- chart generation

### F. Leaderboard and achievement module
Responsible for:
- ranking users or categories
- badges and achievements
- monthly competitions

### G. Referral and rewards module
Responsible for:
- referral codes
- tracking conversion
- reward allocation
- credits and wallet activity

### H. Admin operations module
Responsible for:
- announcements
- promotions
- user moderation
- ticket support actions
- fraud monitoring
- security reviews

---

## 3. Recommended technical architecture

### Frontend
Suggested stack:
- HTML/CSS/JavaScript for a lightweight app shell
- modular page scripts
- reusable components for cards, filters, modals, stats panels
- service worker integration for notifications

### Backend
Suggested structure:
- Express routes grouped by feature
- SQLite for MVP persistence
- JSON-based configuration for feature flags
- service layer for analytics and notification operations

### Data model
Core entities:
- users
- sessions
- devices
- predictions
- categories
- watchlists
- prediction_history
- announcement_broadcasts
- notifications
- referrals
- coupons
- receipts
- support_tickets

### API design
Recommended groupings:
- `/api/auth/*`
- `/api/profile/*`
- `/api/predictions/*`
- `/api/watchlist/*`
- `/api/history/*`
- `/api/search/*`
- `/api/notifications/*`
- `/api/announcements/*`
- `/api/referrals/*`
- `/api/coupons/*`
- `/api/stats/*`
- `/api/admin/*`

---

## 4. Recommended database schema additions

### Prediction core tables
- predictions
- markets
- categories
- fixtures
- outcomes
- prediction_results
- prediction_events

### Personalization tables
- user_activity
- viewed_predictions
- watched_categories
- recommendation_history
- user_preferences

### Referral and rewards tables
- referral_codes
- referral_links
- referral_conversions
- rewards_ledger

### Notification tables
- notifications
- push_subscriptions
- announcement_broadcasts
- announcement_targets

### Security tables
- security_alerts
- suspicious_logins
- device_sessions
- fraud_flags

---

## 5. Security and compliance considerations
- secure secret management via `.env`
- validate all user input
- enforce session-based auth on protected routes
- restrict admin-only routes
- log suspicious actions
- protect against brute force login attempts
- use device/session metadata for audits

---

## 6. MVP target and next steps
The near-term target should be:
- a prediction catalogue
- watchlist and saved predictions
- history tracking
- personalized home screen
- notification system improvements
- basic statistics dashboard

This is the best path to evolve the current repo into a real Odds-Havens product without overbuilding before the product is validated.

---

## 7. Recommended growth roadmap
1. MVP prediction product
2. AI and analytics layer
3. User engagement and rankings
4. Referral and monetization
5. Multi-language and multi-currency expansion
6. Advanced admin tools and fraud detection
7. Premium experience and polished UI

