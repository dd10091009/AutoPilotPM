/**
 * Weather edge simulation (Open-Meteo)
 *
 * Pulls forecasts for a handful of cities, pairs them with synthetic
 * Polymarket-style YES prices, and prints the edge / bet sizing the weather
 * skill would produce. No Polymarket API calls and no real orders.
 *
 * Usage:
 *   npx tsx scripts/simulate-weather.ts                 # live Open-Meteo
 *   npx tsx scripts/simulate-weather.ts --offline       # synthetic forecasts, no network
 *   npx tsx scripts/simulate-weather.ts --bankroll 500 --seed 7 --cities "new york,chicago,miami"
 */

import { CITY_COORDINATES } from '../src/weather/openmeteo';
import { WeatherEdgeCalculator } from '../src/weather/edge';
import { OpenMeteoClient } from '../src/weather/openmeteo';
import type { WeatherMarket } from '../src/weather/markets';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const offline = process.argv.includes('--offline');
const bankroll = Number(arg('bankroll', '100'));
const seed = Number(arg('seed', '42'));
const cities = (arg('cities', 'new york,chicago,miami,seattle,denver') as string)
  .split(',')
  .map(c => c.trim().toLowerCase());

// Small deterministic PRNG so runs are reproducible
function rng(s: number) {
  let t = s >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);

if (offline) {
  // Synthetic Open-Meteo-shaped responses (NOT real forecasts)
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    const lat = Number(url.searchParams.get('latitude'));
    const today = new Date();
    const time = Array.from({ length: 16 }, (_, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
      return d.toISOString().slice(0, 10);
    });
    const body = {
      utc_offset_seconds: 0,
      daily: {
        time,
        temperature_2m_max: time.map((_, i) => Math.round(90 - lat + Math.sin(i + lat) * 8)),
        temperature_2m_min: time.map((_, i) => Math.round(70 - lat + Math.sin(i + lat) * 8)),
        precipitation_probability_max: time.map((_, i) => Math.round(50 + 45 * Math.sin(i * 1.3 + lat))),
        precipitation_sum: time.map(() => 0.1),
        snowfall_sum: time.map(() => 0),
        weather_code: time.map(() => 3),
        wind_speed_10m_max: time.map(() => 10),
        wind_direction_10m_dominant: time.map(() => 270),
      },
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

function tomorrowNoon(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(18, 0, 0, 0); // ~noon in US time zones
  return d;
}

function syntheticMarket(
  city: string,
  kind: 'rain' | 'temp',
  yesPrice: number,
  threshold?: number,
): WeatherMarket {
  const c = CITY_COORDINATES[city];
  const target = tomorrowNoon();
  return {
    id: `${kind}-${city.replace(/\s+/g, '-')}`,
    conditionId: `sim-${kind}-${city}`,
    slug: `sim-${kind}-${city}`,
    question: kind === 'rain'
      ? `Will it rain in ${c.name} tomorrow?`
      : `Will the high in ${c.name} exceed ${threshold}°F tomorrow?`,
    location: c.name,
    coordinates: { lat: c.lat, lon: c.lon },
    metric: kind === 'rain' ? 'precipitation' : 'temperature',
    threshold,
    thresholdUnit: kind === 'temp' ? '°F' : undefined,
    comparison: kind === 'temp' ? 'above' : undefined,
    targetDate: target,
    endDate: target,
    outcomes: [
      { id: 'y', name: 'Yes', price: yesPrice, tokenId: 'y' },
      { id: 'n', name: 'No', price: 1 - yesPrice, tokenId: 'n' },
    ],
    volume: 10_000,
    liquidity: 5_000,
    active: true,
  };
}

async function main() {
  const client = new OpenMeteoClient();
  const calc = new WeatherEdgeCalculator(client, {} as any);

  console.log(`Weather edge simulation - ${offline ? 'OFFLINE (synthetic forecasts)' : 'LIVE Open-Meteo'}`);
  console.log(`Bankroll $${bankroll} | seed ${seed} | ${new Date().toISOString()}\n`);

  const rows: string[] = [];
  let totalStake = 0;
  let totalEv = 0;

  for (const city of cities) {
    if (!CITY_COORDINATES[city]) {
      console.warn(`skip unknown city: ${city}`);
      continue;
    }

    // Look at tomorrow's forecast to anchor a realistic temperature threshold
    const forecast = await client.getForecast(CITY_COORDINATES[city].lat, CITY_COORDINATES[city].lon);
    const tomorrow = forecast.periods[1] ?? forecast.periods[0];
    const tempThreshold = Math.round(tomorrow.temperatureHigh + (rand() * 10 - 5));

    const markets = [
      // Market price = noisy guess around 50%, so edge comes from forecast disagreement
      syntheticMarket(city, 'rain', Math.min(0.95, Math.max(0.05, 0.3 + rand() * 0.5))),
      syntheticMarket(city, 'temp', Math.min(0.95, Math.max(0.05, 0.3 + rand() * 0.5)), tempThreshold),
    ];

    for (const m of markets) {
      const edge = await calc.calculateEdge(m);
      const bet = calc.getBetRecommendation(edge, bankroll);
      if (bet) {
        totalStake += bet.suggestedAmount;
        totalEv += bet.expectedValue;
      }
      rows.push([
        m.question.slice(0, 52).padEnd(52),
        `fcst ${edge.forecastProbability.toFixed(0).padStart(3)}%`,
        `mkt ${(edge.marketPrice * 100).toFixed(0).padStart(3)}%`,
        `edge ${(edge.edgePercent >= 0 ? '+' : '') + edge.edgePercent.toFixed(1)}%`.padEnd(12),
        edge.recommendation.padEnd(4),
        bet ? `$${bet.suggestedAmount.toFixed(2)} (EV ${bet.expectedValue >= 0 ? '+' : ''}${bet.expectedValue.toFixed(2)})` : '-',
      ].join(' | '));
    }
  }

  console.log(rows.join('\n'));
  console.log(`\nTotal staked: $${totalStake.toFixed(2)} | Model EV: ${totalEv >= 0 ? '+' : ''}$${totalEv.toFixed(2)}`);
  console.log('EV is computed from the forecast-derived probability, not realized outcomes.');
}

main().catch(err => {
  console.error('Simulation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
