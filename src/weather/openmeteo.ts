/**
 * Open-Meteo Weather API Client
 *
 * Free, global weather forecasts (no API key required for non-commercial use).
 * https://open-meteo.com/en/docs
 *
 * Replaces the previous NOAA/NWS client. The exported ForecastPeriod /
 * WeatherForecast shapes are kept compatible so the edge calculator and the
 * /weather skill continue to work unchanged.
 */

import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface ForecastPeriod {
  number: number;
  name: string;              // "Today", "Saturday", etc.
  startTime: string;         // ISO-8601 with UTC offset
  endTime: string;
  isDaytime: boolean;
  temperature: number;       // Daily high (°F by default)
  temperatureUnit: 'F' | 'C';
  temperatureHigh: number;
  temperatureLow: number;
  probabilityOfPrecipitation: {
    value: number | null;    // 0-100
    unitCode: string;
  };
  precipitationSum: number | null;  // inches (or mm when unit = C)
  snowfallSum: number | null;       // inches (or cm when unit = C)
  windSpeed: string;         // e.g. "12 mph"
  windDirection: string;     // e.g. "NW"
  weatherCode: number | null;
  icon: string;
  shortForecast: string;
  detailedForecast: string;
}

export interface WeatherForecast {
  location: string;
  generatedAt: string;
  periods: ForecastPeriod[];
}

export interface HourlyPeriod {
  time: string;              // ISO-8601 with UTC offset
  temperature: number;
  temperatureUnit: 'F' | 'C';
  probabilityOfPrecipitation: number | null;
  humidity: number | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
}

export interface HourlyForecast {
  location: string;
  generatedAt: string;
  periods: HourlyPeriod[];
}

export interface CurrentObservation {
  station: string;
  timestamp: string;
  temperature: number;
  temperatureUnit: 'F' | 'C';
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  precipitationLastHour?: number;
}

// City coordinates for major US cities
export const CITY_COORDINATES: Record<string, { lat: number; lon: number; name: string }> = {
  'new york': { lat: 40.7128, lon: -74.0060, name: 'New York, NY' },
  'nyc': { lat: 40.7128, lon: -74.0060, name: 'New York, NY' },
  'los angeles': { lat: 34.0522, lon: -118.2437, name: 'Los Angeles, CA' },
  'la': { lat: 34.0522, lon: -118.2437, name: 'Los Angeles, CA' },
  'chicago': { lat: 41.8781, lon: -87.6298, name: 'Chicago, IL' },
  'houston': { lat: 29.7604, lon: -95.3698, name: 'Houston, TX' },
  'phoenix': { lat: 33.4484, lon: -112.0740, name: 'Phoenix, AZ' },
  'philadelphia': { lat: 39.9526, lon: -75.1652, name: 'Philadelphia, PA' },
  'san antonio': { lat: 29.4241, lon: -98.4936, name: 'San Antonio, TX' },
  'san diego': { lat: 32.7157, lon: -117.1611, name: 'San Diego, CA' },
  'dallas': { lat: 32.7767, lon: -96.7970, name: 'Dallas, TX' },
  'san jose': { lat: 37.3382, lon: -121.8863, name: 'San Jose, CA' },
  'austin': { lat: 30.2672, lon: -97.7431, name: 'Austin, TX' },
  'jacksonville': { lat: 30.3322, lon: -81.6557, name: 'Jacksonville, FL' },
  'fort worth': { lat: 32.7555, lon: -97.3308, name: 'Fort Worth, TX' },
  'columbus': { lat: 39.9612, lon: -82.9988, name: 'Columbus, OH' },
  'charlotte': { lat: 35.2271, lon: -80.8431, name: 'Charlotte, NC' },
  'san francisco': { lat: 37.7749, lon: -122.4194, name: 'San Francisco, CA' },
  'sf': { lat: 37.7749, lon: -122.4194, name: 'San Francisco, CA' },
  'indianapolis': { lat: 39.7684, lon: -86.1581, name: 'Indianapolis, IN' },
  'seattle': { lat: 47.6062, lon: -122.3321, name: 'Seattle, WA' },
  'denver': { lat: 39.7392, lon: -104.9903, name: 'Denver, CO' },
  'washington': { lat: 38.9072, lon: -77.0369, name: 'Washington, DC' },
  'dc': { lat: 38.9072, lon: -77.0369, name: 'Washington, DC' },
  'boston': { lat: 42.3601, lon: -71.0589, name: 'Boston, MA' },
  'nashville': { lat: 36.1627, lon: -86.7816, name: 'Nashville, TN' },
  'detroit': { lat: 42.3314, lon: -83.0458, name: 'Detroit, MI' },
  'oklahoma city': { lat: 35.4676, lon: -97.5164, name: 'Oklahoma City, OK' },
  'portland': { lat: 45.5152, lon: -122.6784, name: 'Portland, OR' },
  'las vegas': { lat: 36.1699, lon: -115.1398, name: 'Las Vegas, NV' },
  'memphis': { lat: 35.1495, lon: -90.0490, name: 'Memphis, TN' },
  'louisville': { lat: 38.2527, lon: -85.7585, name: 'Louisville, KY' },
  'baltimore': { lat: 39.2904, lon: -76.6122, name: 'Baltimore, MD' },
  'milwaukee': { lat: 43.0389, lon: -87.9065, name: 'Milwaukee, WI' },
  'albuquerque': { lat: 35.0844, lon: -106.6504, name: 'Albuquerque, NM' },
  'tucson': { lat: 32.2226, lon: -110.9747, name: 'Tucson, AZ' },
  'fresno': { lat: 36.7378, lon: -119.7871, name: 'Fresno, CA' },
  'sacramento': { lat: 38.5816, lon: -121.4944, name: 'Sacramento, CA' },
  'atlanta': { lat: 33.7490, lon: -84.3880, name: 'Atlanta, GA' },
  'miami': { lat: 25.7617, lon: -80.1918, name: 'Miami, FL' },
  'minneapolis': { lat: 44.9778, lon: -93.2650, name: 'Minneapolis, MN' },
  'cleveland': { lat: 41.4993, lon: -81.6944, name: 'Cleveland, OH' },
  'new orleans': { lat: 29.9511, lon: -90.0715, name: 'New Orleans, LA' },
  'tampa': { lat: 27.9506, lon: -82.4572, name: 'Tampa, FL' },
  'pittsburgh': { lat: 40.4406, lon: -79.9959, name: 'Pittsburgh, PA' },
  'cincinnati': { lat: 39.1031, lon: -84.5120, name: 'Cincinnati, OH' },
  'st louis': { lat: 38.6270, lon: -90.1994, name: 'St. Louis, MO' },
  'orlando': { lat: 28.5383, lon: -81.3792, name: 'Orlando, FL' },
};

const OPEN_METEO_BASE_URL = process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com/v1/forecast';
const FORECAST_DAYS = 16; // Open-Meteo maximum
const REQUEST_TIMEOUT_MS = 15_000;

// WMO weather interpretation codes -> short text
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export function describeWeatherCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'Unknown';
  return WMO_DESCRIPTIONS[code] ?? `Weather code ${code}`;
}

// ============================================================================
// Raw API response types
// ============================================================================

interface OpenMeteoDailyResponse {
  utc_offset_seconds: number;
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    wind_direction_10m_dominant?: (number | null)[];
  };
}

interface OpenMeteoHourlyResponse {
  utc_offset_seconds: number;
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation_probability?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
  };
}

interface OpenMeteoCurrentResponse {
  utc_offset_seconds: number;
  current: {
    time: string;
    temperature_2m: number | null;
    relative_humidity_2m: number | null;
    precipitation: number | null;
    weather_code: number | null;
    wind_speed_10m: number | null;
    wind_direction_10m: number | null;
  };
}

// ============================================================================
// Open-Meteo API Client
// ============================================================================

export class OpenMeteoClient {
  private forecastCache: Map<string, { data: WeatherForecast; timestamp: number }> = new Map();
  private readonly cacheTTL = 15 * 60 * 1000; // 15 minutes
  private readonly maxCacheSize = 500;

  private evictCache<T>(cache: Map<string, { data: T; timestamp: number }>): void {
    if (cache.size <= this.maxCacheSize) return;
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, entry] of cache) {
      if (entry.timestamp < oldestTs) {
        oldestTs = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    const url = `${OPEN_METEO_BASE_URL}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json() as { reason?: string };
        if (body?.reason) detail = ` - ${body.reason}`;
      } catch { /* ignore body parse errors */ }
      throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}${detail}`);
    }

    return await response.json() as T;
  }

  private baseParams(lat: number, lon: number): Record<string, string> {
    return {
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      precipitation_unit: 'inch',
      timezone: 'auto',
    };
  }

  private locationLabel(lat: number, lon: number): string {
    for (const c of Object.values(CITY_COORDINATES)) {
      if (Math.abs(c.lat - lat) < 0.001 && Math.abs(c.lon - lon) < 0.001) return c.name;
    }
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }

  /**
   * Get daily forecast (up to 16 days) for coordinates
   */
  async getForecast(lat: number, lon: number): Promise<WeatherForecast> {
    const cacheKey = `forecast:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = this.forecastCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const data = await this.request<OpenMeteoDailyResponse>({
        ...this.baseParams(lat, lon),
        forecast_days: String(FORECAST_DAYS),
        daily: [
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_probability_max',
          'precipitation_sum',
          'snowfall_sum',
          'weather_code',
          'wind_speed_10m_max',
          'wind_direction_10m_dominant',
        ].join(','),
      });

      const d = data.daily;
      const offset = formatOffset(data.utc_offset_seconds);
      const periods: ForecastPeriod[] = [];

      for (let i = 0; i < d.time.length; i++) {
        const high = d.temperature_2m_max[i];
        const low = d.temperature_2m_min[i];
        if (high === null || high === undefined || low === null || low === undefined) continue;

        const date = d.time[i]; // "YYYY-MM-DD" in the location's local time
        const startTime = `${date}T00:00:00${offset}`;
        const endTime = `${addDays(date, 1)}T00:00:00${offset}`;
        const precipProb = d.precipitation_probability_max?.[i] ?? null;
        const precipSum = d.precipitation_sum?.[i] ?? null;
        const snowSum = d.snowfall_sum?.[i] ?? null;
        const code = d.weather_code?.[i] ?? null;
        const windSpeed = d.wind_speed_10m_max?.[i] ?? null;
        const windDir = d.wind_direction_10m_dominant?.[i] ?? null;
        const description = describeWeatherCode(code);

        periods.push({
          number: periods.length + 1,
          name: i === 0 ? 'Today' : dayName(date),
          startTime,
          endTime,
          isDaytime: true,
          temperature: Math.round(high),
          temperatureUnit: 'F',
          temperatureHigh: Math.round(high),
          temperatureLow: Math.round(low),
          probabilityOfPrecipitation: { value: precipProb, unitCode: 'wmoUnit:percent' },
          precipitationSum: precipSum,
          snowfallSum: snowSum,
          windSpeed: windSpeed !== null ? `${Math.round(windSpeed)} mph` : 'N/A',
          windDirection: windDir !== null ? this.degreesToDirection(windDir) : '',
          weatherCode: code,
          icon: '',
          shortForecast: description,
          detailedForecast:
            `${description}. High ${Math.round(high)}°F, low ${Math.round(low)}°F.` +
            (precipProb !== null ? ` Chance of precipitation ${precipProb}%.` : '') +
            (precipSum !== null && precipSum > 0 ? ` Expected precipitation ${precipSum.toFixed(2)} in.` : '') +
            (snowSum !== null && snowSum > 0 ? ` Expected snowfall ${snowSum.toFixed(1)} in.` : ''),
        });
      }

      const forecast: WeatherForecast = {
        location: this.locationLabel(lat, lon),
        generatedAt: new Date().toISOString(),
        periods,
      };

      this.forecastCache.set(cacheKey, { data: forecast, timestamp: Date.now() });
      this.evictCache(this.forecastCache);
      return forecast;
    } catch (error) {
      logger.error('[OpenMeteo] Failed to get forecast:', error);
      throw error;
    }
  }

  /**
   * Get hourly forecast (next 48h) for coordinates
   */
  async getHourlyForecast(lat: number, lon: number): Promise<HourlyForecast> {
    try {
      const data = await this.request<OpenMeteoHourlyResponse>({
        ...this.baseParams(lat, lon),
        forecast_days: '2',
        hourly: [
          'temperature_2m',
          'precipitation_probability',
          'relative_humidity_2m',
          'weather_code',
          'wind_speed_10m',
          'wind_direction_10m',
        ].join(','),
      });

      const h = data.hourly;
      const offset = formatOffset(data.utc_offset_seconds);
      const periods: HourlyPeriod[] = [];

      for (let i = 0; i < h.time.length; i++) {
        const temp = h.temperature_2m[i];
        if (temp === null || temp === undefined) continue;
        const wind = h.wind_speed_10m?.[i] ?? null;
        const dir = h.wind_direction_10m?.[i] ?? null;

        periods.push({
          time: `${h.time[i]}:00${offset}`, // "YYYY-MM-DDTHH:mm" -> add seconds + offset
          temperature: Math.round(temp),
          temperatureUnit: 'F',
          probabilityOfPrecipitation: h.precipitation_probability?.[i] ?? null,
          humidity: h.relative_humidity_2m?.[i] ?? null,
          windSpeed: wind !== null ? `${Math.round(wind)} mph` : 'N/A',
          windDirection: dir !== null ? this.degreesToDirection(dir) : '',
          shortForecast: describeWeatherCode(h.weather_code?.[i] ?? null),
        });
      }

      return {
        location: this.locationLabel(lat, lon),
        generatedAt: new Date().toISOString(),
        periods,
      };
    } catch (error) {
      logger.error('[OpenMeteo] Failed to get hourly forecast:', error);
      throw error;
    }
  }

  /**
   * Get current conditions for coordinates (model analysis, not a station reading)
   */
  async getCurrentObservation(lat: number, lon: number): Promise<CurrentObservation | null> {
    try {
      const data = await this.request<OpenMeteoCurrentResponse>({
        ...this.baseParams(lat, lon),
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'precipitation',
          'weather_code',
          'wind_speed_10m',
          'wind_direction_10m',
        ].join(','),
      });

      const c = data.current;
      if (!c || c.temperature_2m === null) return null;

      return {
        station: 'open-meteo',
        timestamp: `${c.time}:00${formatOffset(data.utc_offset_seconds)}`,
        temperature: Math.round(c.temperature_2m),
        temperatureUnit: 'F',
        humidity: c.relative_humidity_2m ?? 0,
        windSpeed: Math.round(c.wind_speed_10m ?? 0),
        windDirection: this.degreesToDirection(c.wind_direction_10m ?? 0),
        description: describeWeatherCode(c.weather_code),
        precipitationLastHour: c.precipitation ?? undefined,
      };
    } catch (error) {
      logger.error('[OpenMeteo] Failed to get current observation:', error);
      return null;
    }
  }

  /**
   * Get forecast by city name
   */
  async getForecastByCity(cityName: string): Promise<WeatherForecast> {
    const normalizedCity = cityName.toLowerCase().trim();
    const coords = CITY_COORDINATES[normalizedCity];

    if (!coords) {
      throw new Error(`Unknown city: ${cityName}. Try a major US city like "New York" or "Los Angeles".`);
    }

    return this.getForecast(coords.lat, coords.lon);
  }

  /**
   * Get precipitation probability for a specific date
   */
  async getPrecipitationProbability(
    lat: number,
    lon: number,
    targetDate: Date
  ): Promise<{ probability: number; period: ForecastPeriod } | null> {
    const forecast = await this.getForecast(lat, lon);

    for (const period of forecast.periods) {
      const periodStart = new Date(period.startTime);
      const periodEnd = new Date(period.endTime);

      if (targetDate >= periodStart && targetDate < periodEnd) {
        return {
          probability: period.probabilityOfPrecipitation.value ?? 0,
          period,
        };
      }
    }

    return null;
  }

  /**
   * Get temperature forecast for a specific date
   */
  async getTemperatureForecast(
    lat: number,
    lon: number,
    targetDate: Date
  ): Promise<{ high: number; low: number; periods: ForecastPeriod[] } | null> {
    const forecast = await this.getForecast(lat, lon);

    const periodsForDay = forecast.periods.filter(p => {
      const start = new Date(p.startTime);
      const end = new Date(p.endTime);
      return targetDate >= start && targetDate < end;
    });

    if (periodsForDay.length === 0) return null;

    return {
      high: Math.max(...periodsForDay.map(p => p.temperatureHigh)),
      low: Math.min(...periodsForDay.map(p => p.temperatureLow)),
      periods: periodsForDay,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private degreesToDirection(degrees: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }
}

// ============================================================================
// Date helpers (timezone-safe: operate on "YYYY-MM-DD" strings in UTC)
// ============================================================================

function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

// ============================================================================
// Factory
// ============================================================================

let openMeteoClientInstance: OpenMeteoClient | null = null;

export function getOpenMeteoClient(): OpenMeteoClient {
  if (!openMeteoClientInstance) {
    openMeteoClientInstance = new OpenMeteoClient();
  }
  return openMeteoClientInstance;
}
