'use client';

import React, { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import ReportFilters, { filtersFromParams, filtersToParams, type ReportFilterValues } from '../../../components/ReportFilters';
import { useApproxLocation } from '../../../components/useApproxLocation';

const MapComponent = dynamic(() => import('./MapComponent'), {
  ssr: false,
  loading: () => <div className="feed-empty">Loading map...</div>,
});

function ExploreContent() {
  const searchParams = useSearchParams();
  const location = useApproxLocation();
  const [filters, setFilters] = useState<ReportFilterValues>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString()))
  );

  // Phones only: filters fold away so the map gets the screen (always shown on desktop).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleFilterChange = (key: keyof ReportFilterValues, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // The radius filter is centred on the user's location (or the default centre).
  const queryString = filtersToParams(filters, location).toString();
  const radiusNote =
    location.source === 'fallback'
      ? 'Location unavailable — measuring from Harare city centre.'
      : null;

  return (
    <>
      <div className="feed-header explore-header">
        <div className="explore-header-row">
          <h2>Explore Map</h2>
          <button
            type="button"
            className={`filter-toggle explore-filters-toggle ${filtersOpen || activeFilterCount ? 'active' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls="explore-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
        </div>
        <div id="explore-filters" className={`explore-filters ${filtersOpen ? 'open' : ''}`}>
          <ReportFilters filters={filters} onChange={handleFilterChange} radiusNote={radiusNote} />
        </div>
        <div className="map-legend">
          <span className="legend-dot legend-high">High (4-5)</span>
          <span className="legend-dot legend-med">Medium (3)</span>
          <span className="legend-dot legend-low">Low (1-2)</span>
        </div>
      </div>
      <MapComponent queryString={queryString} />
    </>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="feed-empty">Loading...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
