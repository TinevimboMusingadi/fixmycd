/**
 * U.S. Census Geocoder helpers — https://geocoding.geo.census.gov/
 * Also uses Nominatim (OpenStreetMap) for global coverage.
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

export async function geocodeCoordinates(
  latitude: number,
  longitude: number
): Promise<CensusGeography> {
  // Try Nominatim first (global coverage)
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'FixMyDistrict/1.0 (contact@fixmydistrict.app)' },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      const address = data.address || {};
      return {
        city: address.city || address.town || address.village || address.hamlet || '',
        stateProvince: address.state || address.region || '',
        postalCode: address.postcode || '',
        county: address.county || '',
        countryCode: (address.country_code || 'US').toUpperCase(),
        latitude,
        longitude,
        geocodeStatus: 'matched',
        geocodeSource: 'nominatim',
        geocodeConfidence: 0.8,
      };
    }
    console.warn('Nominatim returned non-OK status:', res.status);
  } catch (error) {
    console.warn('Nominatim failed, trying Census API...', error);
  }

  // Fall back to Census API (US only)
  try {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    url.searchParams.set('x', String(longitude));
    url.searchParams.set('y', String(latitude));
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('format', 'json');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const geos = data?.result?.geographies || {};
      const states = geos['States']?.[0];
      const counties = geos['Counties']?.[0];
      const places = geos['Incorporated Places']?.[0] || geos['Census Designated Places']?.[0];
      const zctas = geos['2020 Census ZIP Code Tabulation Areas']?.[0];

      if (states) {
        const stateFips = states.STATE;
        const regionInfo = stateFips ? CENSUS_REGIONS[stateFips] : undefined;
        return {
          city: places?.NAME || '',
          stateProvince: states.STUSAB || '',
          postalCode: zctas?.ZCTA5 || '',
          county: counties?.NAME || '',
          countryCode: 'US',
          latitude,
          longitude,
          geocodeStatus: 'matched',
          geocodeSource: 'census',
          geocodeConfidence: 0.9,
          censusRegion: regionInfo?.region,
          censusDivision: regionInfo?.division,
          stateFips,
          countyFips: counties?.COUNTY ? `${stateFips}${counties.COUNTY}` : undefined,
          tractGeoid: geos['Census Tracts']?.[0]?.GEOID,
          congressionalDistrict:
            geos['119th Congressional Districts']?.[0]?.BASENAME ||
            geos['119th Congressional Districts']?.[0]?.NAME ||
            geos['Congressional Districts']?.[0]?.BASENAME,
          schoolDistrict:
            geos['Unified School Districts']?.[0]?.NAME ||
            geos['Secondary School Districts']?.[0]?.NAME,
          metroArea: places?.NAME || counties?.NAME,
        };
      }
    }
  } catch (error) {
    console.warn('Census API failed, using fallback...', error);
  }

  // Final fallback — return empty fields (no fake "Unknown")
  return {
    city: '',
    stateProvince: '',
    postalCode: '',
    county: '',
    countryCode: 'US',
    latitude,
    longitude,
    geocodeStatus: 'unmatched',
    geocodeSource: 'fallback',
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