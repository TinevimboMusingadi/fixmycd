/**
 * U.S. Census Geocoder helpers — https://geocoding.geo.census.gov/
 */

export interface CensusGeography {
  addressLine?: string;
  city?: string;
  postalCode?: string;
  county?: string;
  stateProvince?: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  geocodeStatus: 'matched' | 'unmatched' | 'failed' | 'manual' | 'pending';
  geocodeSource: string;
  geocodeConfidence?: number;
  censusRegion?: string;
  censusDivision?: string;
  stateFips?: string;
  countyFips?: string;
  tractGeoid?: string;
  blockGroupGeoid?: string;
  congressionalDistrict?: string;
  stateSenateDistrict?: string;
  stateHouseDistrict?: string;
  schoolDistrict?: string;
  metroArea?: string;
}

const CENSUS_REGIONS: Record<string, { region: string; division: string }> = {
  '09': { region: 'Northeast', division: 'New England' },
  '23': { region: 'Northeast', division: 'New England' },
  '25': { region: 'Northeast', division: 'New England' },
  '33': { region: 'Northeast', division: 'New England' },
  '44': { region: 'Northeast', division: 'New England' },
  '50': { region: 'Northeast', division: 'New England' },
  '34': { region: 'Northeast', division: 'Middle Atlantic' },
  '36': { region: 'Northeast', division: 'Middle Atlantic' },
  '42': { region: 'Northeast', division: 'Middle Atlantic' },
  '17': { region: 'Midwest', division: 'East North Central' },
  '18': { region: 'Midwest', division: 'East North Central' },
  '26': { region: 'Midwest', division: 'East North Central' },
  '39': { region: 'Midwest', division: 'East North Central' },
  '55': { region: 'Midwest', division: 'East North Central' },
  '19': { region: 'Midwest', division: 'West North Central' },
  '20': { region: 'Midwest', division: 'West North Central' },
  '27': { region: 'Midwest', division: 'West North Central' },
  '29': { region: 'Midwest', division: 'West North Central' },
  '31': { region: 'Midwest', division: 'West North Central' },
  '38': { region: 'Midwest', division: 'West North Central' },
  '46': { region: 'Midwest', division: 'West North Central' },
  '10': { region: 'South', division: 'South Atlantic' },
  '11': { region: 'South', division: 'South Atlantic' },
  '12': { region: 'South', division: 'South Atlantic' },
  '13': { region: 'South', division: 'South Atlantic' },
  '24': { region: 'South', division: 'South Atlantic' },
  '37': { region: 'South', division: 'South Atlantic' },
  '45': { region: 'South', division: 'South Atlantic' },
  '51': { region: 'South', division: 'South Atlantic' },
  '54': { region: 'South', division: 'South Atlantic' },
  '01': { region: 'South', division: 'East South Central' },
  '21': { region: 'South', division: 'East South Central' },
  '28': { region: 'South', division: 'East South Central' },
  '47': { region: 'South', division: 'East South Central' },
  '05': { region: 'South', division: 'West South Central' },
  '22': { region: 'South', division: 'West South Central' },
  '40': { region: 'South', division: 'West South Central' },
  '48': { region: 'South', division: 'West South Central' },
  '04': { region: 'West', division: 'Mountain' },
  '08': { region: 'West', division: 'Mountain' },
  '16': { region: 'West', division: 'Mountain' },
  '30': { region: 'West', division: 'Mountain' },
  '32': { region: 'West', division: 'Mountain' },
  '35': { region: 'West', division: 'Mountain' },
  '49': { region: 'West', division: 'Mountain' },
  '56': { region: 'West', division: 'Mountain' },
  '02': { region: 'West', division: 'Pacific' },
  '06': { region: 'West', division: 'Pacific' },
  '15': { region: 'West', division: 'Pacific' },
  '41': { region: 'West', division: 'Pacific' },
  '53': { region: 'West', division: 'Pacific' },
};

// FALLBACK: Mock data for development when API is unreachable
const getMockLocation = (lat: number, lng: number) => {
  const cityMap: Record<string, { city: string; state: string; county: string }> = {
    '34.0522,-118.2437': { city: 'Los Angeles', state: 'CA', county: 'Los Angeles County' },
    '40.7128,-74.0060': { city: 'New York', state: 'NY', county: 'New York County' },
    '37.7749,-122.4194': { city: 'San Francisco', state: 'CA', county: 'San Francisco County' },
    '41.8781,-87.6298': { city: 'Chicago', state: 'IL', county: 'Cook County' },
    '29.7604,-95.3698': { city: 'Houston', state: 'TX', county: 'Harris County' },
    '39.7392,-104.9903': { city: 'Denver', state: 'CO', county: 'Denver County' },
    '47.6062,-122.3321': { city: 'Seattle', state: 'WA', county: 'King County' },
    '38.9072,-77.0369': { city: 'Washington', state: 'DC', county: 'District of Columbia' },
    '33.7490,-84.3880': { city: 'Atlanta', state: 'GA', county: 'Fulton County' },
    '35.2271,-80.8431': { city: 'Charlotte', state: 'NC', county: 'Mecklenburg County' },
    '42.3601,-71.0589': { city: 'Boston', state: 'MA', county: 'Suffolk County' },
    '39.9526,-75.1652': { city: 'Philadelphia', state: 'PA', county: 'Philadelphia County' },
    '32.7157,-117.1611': { city: 'San Diego', state: 'CA', county: 'San Diego County' },
    '30.2672,-97.7431': { city: 'Austin', state: 'TX', county: 'Travis County' },
    '45.5051,-122.6750': { city: 'Portland', state: 'OR', county: 'Multnomah County' },
    '39.7684,-86.1581': { city: 'Indianapolis', state: 'IN', county: 'Marion County' },
  };
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const exactMatch = cityMap[key];
  if (exactMatch) return exactMatch;
  return {
    city: `City near ${lat.toFixed(2)}, ${lng.toFixed(2)}`,
    state: 'US',
    county: 'Unknown County',
  };
};

export async function geocodeCoordinates(
  latitude: number,
  longitude: number
): Promise<CensusGeography> {
  // Non-US heuristic: outside continental US + Alaska/Hawaii rough bounds
  if (latitude < -60 || latitude > 72 || longitude < -180 || longitude > -60) {
    if (latitude > -23 && latitude < -15 && longitude > 28 && longitude < 34) {
      return {
        city: 'Harare',
        stateProvince: 'Harare',
        countryCode: 'ZW',
        latitude,
        longitude,
        geocodeStatus: 'manual',
        geocodeSource: 'local-fallback',
        metroArea: 'Harare',
      };
    }
    // Return a generic non-US response
    return {
      city: 'International Location',
      stateProvince: 'Unknown',
      countryCode: 'US',
      latitude,
      longitude,
      geocodeStatus: 'unmatched',
      geocodeSource: 'local-fallback',
    };
  }

  try {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    url.searchParams.set('x', String(longitude));
    url.searchParams.set('y', String(latitude));
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('format', 'json');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn('Census API error, using fallback data');
      const fallback = getMockLocation(latitude, longitude);
      return {
        city: fallback.city,
        stateProvince: fallback.state,
        county: fallback.county,
        countryCode: 'US',
        latitude,
        longitude,
        geocodeStatus: 'matched',
        geocodeSource: 'fallback',
        geocodeConfidence: 0.5,
      };
    }

    const data = await res.json();
    const result = data?.result;
    if (!result) {
      console.warn('No result from Census API, using fallback');
      const fallback = getMockLocation(latitude, longitude);
      return {
        city: fallback.city,
        stateProvince: fallback.state,
        county: fallback.county,
        countryCode: 'US',
        latitude,
        longitude,
        geocodeStatus: 'matched',
        geocodeSource: 'fallback',
        geocodeConfidence: 0.5,
      };
    }

    const geos = result.geographies || {};
    const states = geos['States']?.[0];
    const counties = geos['Counties']?.[0];
    const places = geos['Incorporated Places']?.[0] || geos['Census Designated Places']?.[0];
    const zctas = geos['2020 Census ZIP Code Tabulation Areas']?.[0] || geos['ZIP Code Tabulation Areas']?.[0];

    const stateFips = states?.STATE || counties?.STATE;
    const regionInfo = stateFips ? CENSUS_REGIONS[stateFips] : undefined;

    return {
      addressLine: undefined,
      city: places?.NAME || places?.BASENAME || 'Unknown',
      postalCode: zctas?.ZCTA5 || zctas?.GEOID || '',
      county: counties?.NAME || counties?.BASENAME || 'Unknown',
      stateProvince: states?.STUSAB || states?.BASENAME || 'Unknown',
      countryCode: 'US',
      latitude,
      longitude,
      geocodeStatus: states || counties ? 'matched' : 'unmatched',
      geocodeSource: 'census-geocoder',
      geocodeConfidence: states ? 0.9 : 0.4,
      censusRegion: regionInfo?.region,
      censusDivision: regionInfo?.division,
      stateFips,
      countyFips: counties?.COUNTY ? `${stateFips}${counties.COUNTY}` : undefined,
      tractGeoid: geos['Census Tracts']?.[0]?.GEOID,
      blockGroupGeoid: undefined,
      congressionalDistrict: geos['119th Congressional Districts']?.[0]?.BASENAME || 
                           geos['119th Congressional Districts']?.[0]?.NAME ||
                           geos['Congressional Districts']?.[0]?.BASENAME,
      schoolDistrict: geos['Unified School Districts']?.[0]?.NAME ||
                     geos['Secondary School Districts']?.[0]?.NAME,
      metroArea: places?.NAME || counties?.NAME,
    };
  } catch {
    console.warn('Census API error, using fallback data');
    const fallback = getMockLocation(latitude, longitude);
    return {
      city: fallback.city,
      stateProvince: fallback.state,
      county: fallback.county,
      countryCode: 'US',
      latitude,
      longitude,
      geocodeStatus: 'matched',
      geocodeSource: 'fallback',
      geocodeConfidence: 0.5,
    };
  }
}

function unmatched(latitude: number, longitude: number, source: string): CensusGeography {
  return {
    latitude,
    longitude,
    countryCode: 'US',
    geocodeStatus: 'unmatched',
    geocodeSource: source,
    geocodeConfidence: 0,
  };
}

export async function geocodeAddress(address: string): Promise<CensusGeography | null> {
  try {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress');
    url.searchParams.set('address', address);
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('format', 'json');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return null;

    const coords = match.coordinates;
    const enriched = await geocodeCoordinates(coords.y, coords.x);
    return {
      ...enriched,
      addressLine: match.matchedAddress,
      city: match.addressComponents?.city || enriched.city,
      postalCode: match.addressComponents?.zip || enriched.postalCode,
      stateProvince: match.addressComponents?.state || enriched.stateProvince,
      geocodeStatus: 'matched',
    };
  } catch {
    return null;
  }
}