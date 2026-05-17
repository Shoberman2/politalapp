# BallotWatch - Congressional Voting Tracker

A beautiful, modern React web application for tracking congressional votes and legislative activity. View your representative based on your state and district, or browse all members of Congress with powerful filtering and search capabilities. Features AI-powered explanations of bills in plain language.

## Features

- **My Representative**: Select your state and district to find and view your congressional representative
- **All Politicians**: Browse, search, and filter all 535+ members of Congress
- **Legislative Activity**: View recent bills sponsored by representatives
- **AI-Powered Bill Explanations**: Click any bill to get a plain-language explanation
- **Real Politician Photos**: Official congressional photos for all members
- **Advanced Filtering**: Filter by chamber (House/Senate), party, and state
- **Modern UI**: Beautiful gradients, smooth animations, and responsive design
- **Fully Responsive**: Works seamlessly on desktop, tablet, and mobile devices

## Technology Stack

- **React 18** with Hooks
- **Vite** for lightning-fast development
- **React Router** for navigation
- **Congress.gov Official API** for real congressional data
- **Modern CSS** with gradients, animations, and transitions
- **Google Fonts** (Inter & Poppins) for premium typography

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Congress.gov API key (free)

## Setup Instructions

### 1. Get Your API Key

#### Congress.gov Official API (Required)
1. Visit https://api.congress.gov/sign-up/
2. Fill out the registration form
3. You'll receive your API key via email
4. **Free tier**: No rate limits for reasonable use

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Congress.gov API key:
   ```env
   VITE_CONGRESS_API_KEY=your_api_key_here
   ```

### 4. Run the Development Server

```bash
npm run dev
```

The application will open at `http://localhost:5173`

## Usage

### Find Your Representative

1. Navigate to the "My Representative" tab (home page)
2. Select your state from the dropdown
3. Select your congressional district
4. Click "Find My Representative"
5. View your representative's profile and recent legislative activity
6. Click any bill to see an AI-powered explanation

### Browse All Politicians

1. Click the "All Politicians" tab in the navigation
2. Use the powerful filters to narrow down results:
   - **Search**: Find politicians by name
   - **Chamber**: Filter by House or Senate
   - **Party**: Filter by Democrat, Republican, or Independent
   - **State**: Filter by specific state
3. Click on any politician card to view their profile

### Understanding Bills

- Each bill shows its number, title, and latest action
- Click the expand button to see an AI-powered plain-language explanation
- Key points highlight what the bill does and who it affects

## Project Structure

```
politicalapp/
├── src/
│   ├── components/              # React components
│   │   ├── Navigation.jsx       # Top navigation bar
│   │   ├── MyPolitician.jsx     # Home page
│   │   ├── AllPoliticians.jsx   # Browse all politicians
│   │   ├── PoliticianCard.jsx   # Politician display card
│   │   ├── VotingHistory.jsx    # Legislative activity
│   │   └── StateDistrictSelector.jsx  # State/district picker
│   ├── services/                # API services
│   │   ├── congress.js          # Congress.gov API integration
│   │   └── district.js          # State/district lookup
│   ├── styles/                  # CSS files
│   │   ├── App.css              # Global styles
│   │   ├── Navigation.css
│   │   ├── MyPolitician.css
│   │   ├── AllPoliticians.css
│   │   ├── PoliticianCard.css
│   │   ├── VotingHistory.css
│   │   └── StateDistrictSelector.css
│   ├── App.jsx                  # Main app component
│   └── main.jsx                 # Entry point
├── index.html                   # HTML template
├── package.json                 # Dependencies
├── vite.config.js              # Vite configuration
├── .env.example                # Environment variables template
└── README.md                    # This file
```

## API Information

### Congress.gov Official API

This app uses the official Congress.gov API to fetch:
- Current members of Congress (House and Senate)
- Member biographical information
- Bills sponsored by members
- Legislative activity and actions
- Member profile photos

**Advantages:**
- Official government data source
- No rate limits for reasonable use
- Most up-to-date congressional information
- Free tier available

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Preview Production Build

```bash
npm run preview
```

## Visual Features

### Modern Design Elements
- **Gradient Backgrounds**: Purple/blue gradients throughout
- **Smooth Animations**: Fade-ins, slide-ins, and hover effects
- **Custom Scrollbar**: Styled scrollbar matching the theme
- **Loading States**: Skeleton loaders and spinner animations
- **Card Hover Effects**: Elevation changes and subtle transforms
- **Responsive Typography**: Using Inter and Poppins fonts
- **Party Color Coding**: Visual distinction between parties
- **Profile Images**: Real photos from Congress.gov
- **AI Badge**: Special indicator for AI-generated content

### Interactions
- Click bills to expand AI explanations
- Hover over cards for elevation effect
- Smooth page transitions
- Staggered grid animations
- Button micro-interactions

## AI Bill Explanations

The platform includes an AI-powered feature to explain bills in plain language. Currently uses a placeholder implementation that can be integrated with:
- OpenAI GPT-4
- Anthropic Claude
- Google Gemini
- Any other LLM API

To integrate a real AI service, update the `explainBillWithAI` function in `src/services/congress.js`.

## Feature Flags

The bills sponsor + routing features ship behind two env-gated flags. Both
default to `false`. Flip in Vercel env after the corresponding data lands.

| Flag | Default | Enables |
|------|---------|---------|
| `VITE_BILLS_SHOW_SPONSOR_FILTER` | `false` | BillsPage sponsor + cosponsor filter pills, `searchBillsInDb` cosponsor join, sponsor activity badge on PoliticianDetail |
| `VITE_BILLS_SHOW_ROUTING_PANEL` | `false` | "Where this bill goes" panel on BillDetail, smart status pill survival popover, `/committee/:code` route |

Rollout sequence (per CEO review D10):

1. Apply `supabase/migrations/006_bill_sponsor_and_routing.sql`.
2. Deploy with both flags `false`.
3. Run `npm run etl:backfill-sponsors` (Phase A — current Congress, ~5 min).
4. Flip `VITE_BILLS_SHOW_ROUTING_PANEL=true`, redeploy, soak 24h.
5. Flip `VITE_BILLS_SHOW_SPONSOR_FILTER=true`, redeploy.
6. Run `npm run etl:backfill-historical-routings` (Phase B — 117th + 118th,
   ~8 hours throttled; writes `backfill_state` sentinel so the survival cron
   skips while in progress).
7. Schedule `npm run etl:compute-survival` weekly — fills committee survival
   stats once Phase B completes.

## Troubleshooting

### API Key Issues
- Ensure your `.env` file has the correct API key
- Variable name must be `VITE_CONGRESS_API_KEY` (note the `VITE_` prefix)
- Restart the dev server after changing environment variables

### No Representative Found
- Verify you selected both state and district
- Some states only have one district (at-large representatives)
- Try selecting a different district if available

### Images Not Loading
- Congress.gov photos may not be available for all members
- Fallback initials will display if photo fails to load
- Check your internet connection

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Ensure Node.js version is 16 or higher

## Future Enhancements

- Real AI integration for bill explanations
- Vote tracking on specific bills
- Email notifications for new votes
- Comparison tool for multiple politicians
- Historical voting patterns and statistics
- Bill tracking and favorites
- User accounts with saved preferences
- Advanced analytics and visualizations
- Committee membership information
- Floor statements and speeches

## Performance

- **Fast Initial Load**: Vite's optimized build process
- **Code Splitting**: React Router lazy loading
- **Image Optimization**: Lazy loading for profile photos
- **Caching**: API responses cached where appropriate
- **Minimal Bundle**: Tree-shaking removes unused code

## Accessibility

- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support
- Focus indicators on all interactive elements
- High contrast color ratios
- Responsive to user preferences

## License

MIT License - feel free to use this project for any purpose

## Credits

- **Data Source**: Congress.gov Official API
- **Design**: Modern gradient-based UI/UX
- **Fonts**: Google Fonts (Inter & Poppins)
- **Icons**: Inline SVG icons

## Support

For issues or questions:
1. Check this README first
2. Verify your API key is correct
3. Check the browser console for errors
4. Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)

---

Built with care for transparency in government and civic engagement.
