# World Cup 2026 Knockout Forecast

A live World Cup 2026 knockout forecast powered by Elo ratings and 50,000 tournament simulations. The app now leads with the bracket, keeps the completed group stage as an archive, and adds path rankings for hardest routes, easiest routes, dangerous openers, draw value, and bracket tax.

## Features

- **Live Elo Ratings**: Fetches current team ratings from eloratings.net
- **Knockout Bracket**: Traces each team's most likely route from the round of 32 through the final
- **Path Rankings**: Compares hardest paths, easiest paths, opening-match danger, draw value, bracket tax, and volatility
- **Group Archive**: Preserves completed group-stage context that feeds the bracket
- **Rest-of-Group SoS**: Ranks every team by the average Elo of its three group opponents
- **Matchup Lab**: Compares any two teams with the existing Elo win/draw/loss formula
- **Monte Carlo Simulation**: 50,000 bracket-aware tournament runs using the existing tournament model
- **Final Field Modeling**: Uses the confirmed 48-team draw with no expected playoff placeholders

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
| `GET /api/sos` | Tournament forecast payload: group archive, knockout bracket, path probabilities, live/scenario state |
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
│   ├── elo.js             # Shared Elo probability algorithm
│   ├── sosCalculator.js   # SoS calculations & expected playoff Elo support
│   └── bracketSimulator.js # Full tournament Monte Carlo
├── data/
│   └── worldCupGroups.json # Tournament structure
├── public/
│   ├── index.html         # Bracket-first forecast shell
│   ├── paths.html         # Knockout path rankings
│   ├── groups.html        # Completed group-stage archive
│   ├── app.js             # Group archive rendering and matchup lab
│   ├── bracket.js         # Bracket rendering and team route tracing
│   ├── paths.js           # Path difficulty rankings
│   └── styles.css         # Responsive dashboard styling
├── test_win_probability.py      # Unit tests for probability formulas
└── test_server_probabilities.py # Integration tests vs live server
```

## Win Probability Calculations

### Basic Elo Formula
```
P(Team1 wins) = 1 / (1 + 10^((Elo2 - Elo1) / 400))
```

### Three-Outcome Model (Group Matches)
- Draw probability: `0.15 + 0.12 * exp(-0.004 * |diff|)`
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
