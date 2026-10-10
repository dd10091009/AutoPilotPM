---
name: weather
description: "Weather betting - Open-Meteo data for Polymarket weather markets"
command: weather
emoji: "🌤️"
gates:
  envs:
    - POLY_API_KEY
---

# Weather Betting

Use Open-Meteo weather forecasts to find edge on Polymarket weather markets.

## Commands

```
/weather scan                              Scan all weather markets for edge
/weather forecast <city>                   Get Open-Meteo forecast for a city
/weather markets                           List active weather markets
/weather edge <market-id>                  Calculate edge for specific market
/weather bet <market-id> <amount>          Execute bet
/weather auto [--threshold 10]             Auto-bet on high-edge markets
/weather history                           View bet history
```

## Examples

```
/weather forecast "New York"
/weather scan
/weather edge abc123
/weather bet abc123 10
/weather auto --threshold 15
```

## How It Works

1. **Fetch Open-Meteo Forecast**: Get global forecast data from Open-Meteo (free, no API key)
2. **Match to Markets**: Find Polymarket weather markets for the same location/date
3. **Calculate Edge**: Compare Open-Meteo probability to market YES price
4. **Bet if Edge**: If Open-Meteo probability differs significantly from market, bet

## Edge Calculation

```
Edge = Open-Meteo Probability - Market Price

Example:
  Open-Meteo says 80% chance of rain in NYC tomorrow
  Polymarket "Will it rain in NYC?" YES price: 0.65 (65%)
  Edge = 80% - 65% = +15% -> Bet YES
```

## Supported Market Types

- **Temperature**: "Will NYC exceed 90°F on Saturday?"
- **Precipitation**: "Will it rain in LA tomorrow?"
- **Snow**: "Will Chicago get 6+ inches of snow?"
- **Record**: "Will Phoenix hit a record high this week?"

## Confidence Levels

- **High**: Edge >= 15%, reliable forecast data
- **Medium**: Edge 10-15%, some uncertainty
- **Low**: Edge 5-10%, more speculative

## Position Sizing

Uses quarter-Kelly criterion for conservative sizing:

```
Bet Size = Bankroll * (Edge / Odds) * 0.25
```

Capped at 10% of bankroll per bet.

## Supported Cities

Major US cities including: New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, San Francisco, Seattle, Denver, Washington DC, Boston, Nashville, Detroit, and more.
