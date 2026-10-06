# Odds-Havens: Missing Features and Product Roadmap

This document summarizes the current state of the repository and the key product features still missing from the platform described in the project brief.

## 1. Current repository status

The repository currently includes a solid foundation for a customer-facing web app, especially around:

- User registration and login
- Email and phone verification
- Profile management
- Session and login tracking
- Support ticket creation and replies
- Notification preferences
- Push notification infrastructure
- PWA/mobile-ready setup

Relevant implementation files in the repo include:

- `routes/auth.js` — customer authentication, profile, verification, support tickets, notification preferences
- `services/notification-service.js` — notification service logic
- `push-server.js` — push notification server
- `public/notification-client.js` — client-side notification support
- `package.json` — Node/Express stack with SQLite, sessions, and web-push

This means the app already has a backend foundation, but it is not yet a full football prediction platform with the product features described in the requirement list.

---

## 2. Features already implemented

The following features are supported or partially supported by the current codebase:

### Account & user management
- Register/login/logout
- Password update
- Email verification
- Phone verification
- Profile updates
- Profile photo upload
- Login history
- Logout from all devices
- Support ticket creation and management

### Security & account monitoring
- Basic account activity logging
- Device/session tracking via login history
- Security-oriented account settings

### Notification system
- Notification preferences storage
- Push notification infrastructure
- Browser client push registration support

### Mobile / deployment readiness
- PWA manifest and service worker setup
- Mobile-responsive documentation and deployment guidance

---

## 3. Features missing from the project

The following features are missing or not implemented in the current repository.

### 1) AI Prediction Assistant
Status: Missing

Needed features:
- Historical prediction analysis
- Statistical insights
- Risk indicators
- Confidence scoring
- Explainability for why a prediction is low/high confidence

Notes:
- No prediction engine, model layer, or analytics service exists in the repo.
- No scoring or probability logic is present.

### 2) Smart Personalization
Status: Missing

Needed features:
- Learn which categories a user views
- Personalized home screen
- Recommended prediction categories
- “For You” section

Notes:
- No recommendation engine or user-interest tracking exists.

### 3) Advanced Statistics Center
Status: Missing

Needed features:
- Historical performance
- Win/loss stats
- Category performance
- Daily/weekly/monthly charts
- Prediction accuracy tracking

Notes:
- No dashboard, charting logic, or analytics module is present.

### 4) Leaderboards
Status: Missing

Needed features:
- Top-performing prediction categories
- Monthly rankings
- Community achievements
- Badges

Notes:
- No ranking system or achievement model exists.

### 5) Prediction History / My Activity
Status: Missing

Needed features:
- Viewed items
- Saved items
- Booked items
- Completed predictions
- Results history

Notes:
- Nothing in the repo tracks prediction lifecycle history or user activity across categories.

### 6) Favorites / Watchlist
Status: Missing

Needed features:
- Save predictions
- Follow categories
- Alerts when followed content changes

Notes:
- No watchlist concept exists in the backend or frontend.

### 7) Global Search
Status: Missing

Needed features:
- Search tickets
- Search categories
- Search announcements
- Search users/support conversations

Notes:
- No full-text search functionality or UI is present.

### 8) Prediction Calendar
Status: Missing

Needed features:
- Upcoming events
- Available prediction content
- Historical results
- Filters by category/date

Notes:
- No event calendar or prediction scheduling system exists.

### 9) Multi-language support
Status: Missing

Needed features:
- English
- Kiswahili
- Additional languages later

Notes:
- No locale configuration or translation system exists.

### 10) Multi-currency support
Status: Missing

Needed features:
- KES
- USD
- GBP
- EUR

Notes:
- No pricing, wallet, or currency conversion layer exists.

### 11) Referral System
Status: Missing

Needed features:
- Personal referral code
- Referral tracking
- Referral rewards/credits
- Referral dashboard

Notes:
- No referral database, codes, or rewards system exists.

### 12) Promo / Coupon System
Status: Missing

Needed features:
- Admin-created promotions
- Expiry dates
- Usage limits
- Customer redemption history

Notes:
- No coupon or voucher tables/functions exist.

### 13) Announcement System
Status: Missing

Needed features:
- Admin broadcasts
- Scheduled announcements
- In-app banners
- Push notifications

Notes:
- The repo has generic push notification support, but not a full admin announcement system.

### 14) Notification Preferences UI
Status: Partially implemented

Needed features:
- Prediction alerts
- Chat
- Payments
- Announcements
- Promotions

Notes:
- Preference storage exists in `routes/auth.js`, but there is no complete notification center or UI management flow for the full preference matrix.

### 15) Live Activity
Status: Missing

Needed features:
- Real-time online user count
- Live notifications count
- Live bookings count
- Live support chats count

Notes:
- No real-time activity or dashboard feed is implemented.

### 16) Document / Receipt Center
Status: Missing

Needed features:
- Payment receipts
- Booking confirmations
- Downloadable reports
- Customer documents

Notes:
- No document storage or receipt generation exists.

### 17) Automatic Receipts
Status: Missing

Needed features:
- Generate unique receipt after verified transaction

Notes:
- No payment transaction flow or receipt generation logic exists in the repo.

### 18) Fraud & Abuse Detection
Status: Missing / partial

Needed features:
- Suspicious login detection
- Multiple-account detection
- Unusual activity alerts
- Admin security alerts

Notes:
- There is logging and basic account activity tracking, but no fraud-analysis engine or admin alert system.

### 19) Device Management
Status: Partially implemented

Needed features:
- My Devices dashboard
- Device status tracking
- Active vs inactive devices
- Logout individual devices or all devices

Notes:
- Current code supports a logout-all-devices flow and login history tracking, but not a full device management module or dashboard.

### 20) Advanced UI
Status: Partially implemented

Needed features:
- Dark/light mode
- Custom themes
- Animated cards
- Glassmorphism
- Skeleton loading
- Smooth page transitions

Notes:
- There is no complete UI system or front-end design package implementing this level of visual polish.

---

## 4. Recommended product roadmap

## Phase 1 — Core MVP (must-have)
This phase should focus on the actual football prediction product and user-facing core flows.

### Priority items
1. Prediction categories and fixtures
2. Prediction cards and odds display
3. Prediction save / favorites / watchlist
4. User prediction history
5. Search and filtering
6. Home dashboard and user personalization
7. Basic stat views
8. Push notifications for prediction updates

### Goal
Deliver a usable prediction platform where users can browse matches, place interest/save actions, view prediction history, and receive updates.

## Phase 2 — Intelligence and engagement
1. AI prediction assistant
2. Confidence scoring and explanation engine
3. Statistical center
4. Leaderboards and achievement system
5. Activity feed and live stats
6. Personalized “For You” feed

### Goal
Increase user engagement through insight-rich experiences and competitive motivation.

## Phase 3 — Monetization and trust
1. Referral system
2. Promo/coupon system
3. Receipt center and payment confirmation flows
4. Fraud and abuse detection
5. Device management and security controls

### Goal
Support real transactions, rewards, and trust features required for a production-ready platform.

## Phase 4 — Growth and global scale
1. Multi-language translations
2. Multi-currency support
3. Admin dashboards and announcement manager
4. Custom themes and polished UI
5. Advanced personalization / recommendation tuning

### Goal
Prepare the product for broader adoption, international users, and high-quality UX.

---

## 5. Suggested first implementation order

The fastest path to a meaningful product is:

1. Prediction listing and detail pages
2. User favorites/watchlist
3. Prediction history
4. Search and category filtering
5. Personalization preferences
6. Stats dashboard
7. Leaderboard
8. Live notifications and announcements
9. Referral and promo modules
10. Multi-language / multi-currency support

This order creates a real product experience before adding heavier AI and fraud-management features.

---

## 6. Final assessment

The existing repo is a strong base for a web app and includes real operational foundations such as authentication, notifications, and security-related components. However, it is not yet equivalent to the full “Odds-Havens” product described in the feature brief.

The current product is best described as:
- a secure customer account and notification foundation
- not yet a complete AI-driven prediction marketplace or sports intelligence platform

To reach the target product, the team needs to build the core prediction domain model and user experience on top of the current backend foundation.

---

## 7. Recommended next step

Build the first MVP feature set around:
- prediction categories
- saved/watchlist features
- personal prediction history
- search/filtering
- stats dashboard
- notification updates

This will transform the app from a backend foundation into a usable sports prediction product.

