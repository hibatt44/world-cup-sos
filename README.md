# World Cup 2026 Strength of Schedule Calculator

A real-time World Cup 2026 tournament analyzer that calculates strength of schedule, simulates group stages, and predicts tournament outcomes using Elo ratings.

## Features

- **Live Elo Ratings**: Fetches current team ratings from eloratings.net
- **Strength of Schedule**: Ranks teams by opponent difficulty
- **Monte Carlo Simulation**: 50,000 iterations per group for accurate probabilities
- **Full Tournament Simulation**: Bracket-aware simulation from groups to final
- **Playoff Predictions**: Expected Elo calculations for undecided playoff spots

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/rankings` | Current Elo rankings for all teams |
| `GET /api/groups` | World Cup group compositions |
| `GET /api/sos` | Strength of schedule + simulations |
| `GET /api/results` | Recent match results |

## Deployment to Railway

### Option 1: Deploy via GitHub

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" > "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys

### Option 2: Deploy via CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

### Environment Variables

No environment variables are required. The app uses:
- `PORT` - Automatically set by Railway (defaults to 3000 locally)

## Project Structure

```
soccer_elo/
├── server.js              # Express server & API endpoints
├── lib/
│   ├── sosCalculator.js   # SoS calculations & group simulations
│   └── bracketSimulator.js # Full tournament Monte Carlo
├── data/
│   └── worldCupGroups.json # Tournament structure
├── public/
│   ├── index.html         # Frontend UI
│   ├── app.js             # Client-side JavaScript
│   └── styles.css         # Styling
├── test_win_probability.py      # Unit tests for probability formulas
└── test_server_probabilities.py # Integration tests vs live server
```

## Win Probability Calculations

### Basic Elo Formula
```
P(Team1 wins) = 1 / (1 + 10^((Elo2 - Elo1) / 400))
```

### Three-Outcome Model (Group Matches)
- Draw probability: `max(0.15, 0.27 - |diff| * 0.0004)`
- Win probability: `win_expectancy * (1 - draw_prob)`
- Loss probability: `(1 - win_expectancy) * (1 - draw_prob)`

## Testing

```bash
# Run probability formula tests
python3 test_win_probability.py

# Run server integration tests (requires server running)
npm start &
python3 test_server_probabilities.py
```

## License

MIT
