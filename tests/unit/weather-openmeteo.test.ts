/**
 * Weather module tests (Open-Meteo client + edge calculator)
 *
 * fetch is stubbed with responses shaped like the Open-Meteo forecast API,
 * so these run offline.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const realFetch = globalThis.fetch;
let requestedUrls: string[] = [];

function dailyFixture(startDate: string, days: number) {
  const time: string[] = [];
  const base = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    time.push(d.toISOString().slice(0, 10));
  }
  return {
    latitude: 40.7,
    longitude: -74.0,
    utc_offset_seconds: -14400, // EDT
    timezone: 'America/New_York',
    daily: {
      time,
      temperature_2m_max: time.map((_, i) => 70 + i),
      temperature_2m_min: time.map((_, i) => 55 + i),
      precipitation_probability_max: time.map((_, i) => (i === 1 ? 80 : 10)),
      precipitation_sum: time.map((_, i) => (i === 1 ? 0.6 : 0)),
      snowfall_sum: time.map(() => 0),
      weather_code: time.map((_, i) => (i === 1 ? 63 : 1)),
      wind_speed_10m_max: time.map(() => 12.4),
      wind_direction_10m_dominant: time.map(() => 315),
    },
  };
}

function stubFetch(body: unknown, status = 200) {
  globalThis.fetch = (async (input: any) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('OpenMeteoClient', () => {
  beforeEach(() => { requestedUrls = []; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('parses daily forecast into ForecastPeriods with local-offset timestamps', async () => {
    stubFetch(dailyFixture('2026-10-10', 5));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const client = new OpenMeteoClient();

    const forecast = await client.getForecast(40.7128, -74.006);

    assert.equal(forecast.location, 'New York, NY');
    assert.equal(forecast.periods.length, 5);

    const today = forecast.periods[0];
    assert.equal(today.name, 'Today');
    assert.equal(today.temperature, 70);
    assert.equal(today.temperatureHigh, 70);
    assert.equal(today.temperatureLow, 55);
    assert.equal(today.startTime, '2026-10-10T00:00:00-04:00');
    assert.equal(today.endTime, '2026-10-11T00:00:00-04:00');
    assert.equal(today.windSpeed, '12 mph');
    assert.equal(today.windDirection, 'NW');

    const rainy = forecast.periods[1];
    assert.equal(rainy.probabilityOfPrecipitation.value, 80);
    assert.equal(rainy.precipitationSum, 0.6);
    assert.equal(rainy.shortForecast, 'Moderate rain');
  });

  it('requests imperial units and the daily variables it needs', async () => {
    stubFetch(dailyFixture('2026-10-10', 2));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    await new OpenMeteoClient().getForecast(34.0522, -118.2437);

    const url = new URL(requestedUrls[0]);
    assert.equal(url.hostname, 'api.open-meteo.com');
    assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'mph');
    assert.equal(url.searchParams.get('precipitation_unit'), 'inch');
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.match(url.searchParams.get('daily') ?? '', /precipitation_probability_max/);
  });

  it('caches forecasts for the same coordinates', async () => {
    stubFetch(dailyFixture('2026-10-10', 2));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const client = new OpenMeteoClient();
    await client.getForecast(41.8781, -87.6298);
    await client.getForecast(41.8781, -87.6298);
    assert.equal(requestedUrls.length, 1);
  });

  it('finds the period containing a target date', async () => {
    stubFetch(dailyFixture('2026-10-10', 5));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const client = new OpenMeteoClient();

    const hit = await client.getPrecipitationProbability(40.7128, -74.006, new Date('2026-10-11T15:00:00-04:00'));
    assert.equal(hit?.probability, 80);

    const temp = await client.getTemperatureForecast(40.7128, -74.006, new Date('2026-10-12T09:00:00-04:00'));
    assert.deepEqual([temp?.high, temp?.low], [72, 57]);
  });

  it('surfaces the API error reason on HTTP errors', async () => {
    stubFetch({ error: true, reason: 'Latitude must be in range of -90 to 90°.' }, 400);
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    await assert.rejects(
      () => new OpenMeteoClient().getForecast(999, 0),
      /Open-Meteo API error: 400.*Latitude must be in range/,
    );
  });

  it('rejects unknown cities', async () => {
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    await assert.rejects(() => new OpenMeteoClient().getForecastByCity('Atlantis'), /Unknown city/);
  });
});

describe('WeatherEdgeCalculator with Open-Meteo forecasts', () => {
  afterEach(() => { globalThis.fetch = realFetch; });

  function market(overrides: Record<string, unknown>) {
    return {
      id: 'm1',
      conditionId: 'c1',
      slug: 'm1',
      question: 'Test market',
      location: 'New York, NY',
      coordinates: { lat: 40.7128, lon: -74.006 },
      metric: 'precipitation',
      endDate: new Date('2026-10-12T00:00:00Z'),
      targetDate: new Date('2026-10-11T15:00:00-04:00'),
      outcomes: [
        { id: 'y', name: 'Yes', price: 0.5, tokenId: 'y' },
        { id: 'n', name: 'No', price: 0.5, tokenId: 'n' },
      ],
      volume: 1000,
      liquidity: 500,
      active: true,
      ...overrides,
    } as any;
  }

  it('recommends YES when forecast rain probability beats the market price', async () => {
    stubFetch(dailyFixture('2026-10-10', 5));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const { WeatherEdgeCalculator } = await import('../../src/weather/edge.js');
    const calc = new WeatherEdgeCalculator(new OpenMeteoClient(), {} as any);

    const edge = await calc.calculateEdge(market({}));
    assert.equal(edge.forecastProbability, 80);
    assert.equal(edge.recommendation, 'YES');
    assert.equal(Math.round(edge.edgePercent), 30);
    assert.equal(edge.confidence, 'high');

    const bet = calc.getBetRecommendation(edge, 100);
    assert.equal(bet?.side, 'YES');
    assert.ok((bet?.suggestedAmount ?? 0) > 0);
  });

  it('recommends NO when the market overprices a dry day', async () => {
    stubFetch(dailyFixture('2026-10-10', 5));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const { WeatherEdgeCalculator } = await import('../../src/weather/edge.js');
    const calc = new WeatherEdgeCalculator(new OpenMeteoClient(), {} as any);

    const edge = await calc.calculateEdge(market({
      targetDate: new Date('2026-10-10T12:00:00-04:00'), // 10% rain day
      outcomes: [
        { id: 'y', name: 'Yes', price: 0.4, tokenId: 'y' },
        { id: 'n', name: 'No', price: 0.6, tokenId: 'n' },
      ],
    }));
    assert.equal(edge.forecastProbability, 10);
    assert.equal(edge.recommendation, 'NO');
  });

  it('scores temperature markets from the daily high', async () => {
    stubFetch(dailyFixture('2026-10-10', 5));
    const { OpenMeteoClient } = await import('../../src/weather/openmeteo.js');
    const { WeatherEdgeCalculator } = await import('../../src/weather/edge.js');
    const calc = new WeatherEdgeCalculator(new OpenMeteoClient(), {} as any);

    // Oct 12 high is 72°F; threshold 65 'above' -> well clear of the +3°F accuracy band
    const edge = await calc.calculateEdge(market({
      metric: 'temperature',
      threshold: 65,
      comparison: 'above',
      targetDate: new Date('2026-10-12T12:00:00-04:00'),
      outcomes: [{ id: 'y', name: 'Yes', price: 0.6, tokenId: 'y' }],
    }));
    assert.equal(edge.forecastProbability, 95);
    assert.equal(edge.recommendation, 'YES');
  });
});
