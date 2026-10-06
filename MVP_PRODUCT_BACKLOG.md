# Odds-Havens MVP Product Backlog

This backlog converts the product brief into a practical development plan for the existing repo foundation.

## Product vision
Odds-Havens is a football prediction platform where users can browse predictions, track outcomes, save favourites, receive notifications, and access tailored insights.

## Current repo baseline
The repo already has:
- user account system
- profile and security flows
- support tickets
- notification preference storage
- push notification server/client setup
- mobile-friendly deployment foundation

The missing work is primarily in the sports prediction product domain.

---

## Phase 1 — MVP foundation (Core product)

### 1. User auth and onboarding
- Register and login flow
- Email verification
- Phone verification
- Password reset
- Profile completion
- Device session tracking

### 2. Prediction catalogue
- Match list and categories
- Team and fixture views
- Prediction cards with odds and labels
- Status states: upcoming, live, completed
- Category filters

### 3. Favorites / Watchlist
- Save prediction items
- Follow categories or teams
- Manage watchlist screen
- Alerts when watched content changes

### 4. User prediction history
- Viewed predictions
- Saved predictions
- Booked predictions
- Completed predictions
- Result timeline

### 5. Search and filtering
- Search predictions by keyword
- Search categories
- Search announcements
- Search support tickets
- Date/category filtering

### 6. Basic stats and dashboard
- Recent activity overview
- Prediction count summary
- Win/loss generated statistics
- Category breakdown

### 7. Notifications
- Prediction alerts
- Booking reminders
- Result updates
- In-app notifications
- Push notifications for reminders

---

## Phase 2 — Engagement and intelligence

### 8. Personalized home screen
- Based on category views
- “For You” recommendation area
- Trending predictions
- Recently viewed items

### 9. AI prediction assistant
- Risk indicator
- Confidence score
- Why this prediction is strong or weak
- Historical trend analysis
- Statistical summary

### 10. Advanced statistics center
- Historical performance
- Category-specific insights
- Daily, weekly, monthly charts
- Accuracy tracking

### 11. Leaderboards
- Monthly rankings
- Category leaderboards
- Badges and achievements
- Community ranking screen

### 12. Live activity feed
- Active users count
- Recent bookings
- Support chat count
- Notifications count

---

## Phase 3 — Monetization and trust

### 13. Referral system
- Personal referral code
- Tracking of referred users
- Referral credit system
- Referral dashboard

### 14. Promo and coupon system
- Admin-created codes
- Expiry and validation
- Use limits
- Redemption history

### 15. Receipt and document center
- Payment receipts
- Booking confirmations
- Downloadable reports
- Customer document archive

### 16. Fraud and abuse prevention
- Suspicious login detection
- Multiple-account checks
- Unusual activity flagging
- Security alerts

### 17. Device management
- Active device list
- Session expiry controls
- Device logout controls
- Security activity review

---

## Phase 4 — Growth and experience

### 18. Multi-language support
- English
- Kiswahili
- Additional languages later

### 19. Multi-currency support
- KES
- USD
- GBP
- EUR

### 20. Announcement system
- Scheduled announcements
- Banner system
- Push alerts and in-app messages
- Admin broadcast workflow

### 21. Advanced UI
- Dark mode and light mode
- Theme system
- Glassmorphism UI
- Skeleton loading
- Smooth transitions
- Animated cards

---

## Suggested implementation order
1. Prediction catalogue
2. Favorites and watchlist
3. Prediction history
4. Search and category filtering
5. Personalization preferences
6. Activity dashboard
7. AI assistant
8. Leaderboards
9. Referral and promo flows
10. Multi-currency and multi-language
11. Announcement system
12. Advanced UX and themes

## Recommended milestone split
### Sprint 1
- Auth improvements
- Prediction catalogue
- Favorites/watchlist

### Sprint 2
- History, filters, search
- Personalized home screen
- Notification improvements

### Sprint 3
- AI prediction assistant
- Stats center
- Leaderboards

### Sprint 4
- Referral system
- Promo system
- Receipt center
- Security and device management

### Sprint 5
- Localization
- Currency support
- Announcement system
- Advanced UI polish

---

## Definition of done for MVP
A feature is considered complete when:
- database tables and backend routes exist
- frontend screens are usable
- user interactions work end-to-end
- notification or activity updates are functioning
- error handling is in place
- security checks are enforced
- the feature is testable and documented

