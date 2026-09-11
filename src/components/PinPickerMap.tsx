'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

interface PinPickerMapProps {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
  onLocationChange?: (location: {
    city: string;
    stateProvince: string;
    postalCode: string;
    county: string;
    latitude: number;
    longitude: number;
  }) => void;
}

function ClickHandler({ onChange, onGeocode }: { 
  onChange: (lat: number, lng: number) => void;
  onGeocode: (lat: number, lng: number) => Promise<void>;
}) {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
      onChange(lat, lng);
      await onGeocode(lat, lng);
    },
  });
  return null;
}

const pinIcon = L.divIcon({
  html: `<div style="background:#8b5cf6;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
  className: 'pin-picker-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export default function PinPickerMap({ latitude, longitude, onChange, onLocationChange }: PinPickerMapProps) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  }, []);

  const handleGeocode = async (lat: number, lng: number) => {
    if (!onLocationChange) return;
    
    setIsGeocoding(true);
    setGeocodeError(null);
    
    try {
      const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Geocoding failed');
      }
      
      onLocationChange({
        city: data.city || '',
        stateProvince: data.stateProvince || '',
        postalCode: data.postalCode || '',
        county: data.county || '',
        latitude: lat,
        longitude: lng,
      });
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : 'Geocoding failed');
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="pin-picker-wrapper" style={{ position: 'relative' }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        style={{ width: '100%', height: '200px', borderRadius: '8px' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} onGeocode={handleGeocode} />
        <Marker position={[latitude, longitude]} icon={pinIcon} />
      </MapContainer>
      
      {/* Geocoding status overlay */}
      {isGeocoding && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '13px',
          zIndex: 1000,
        }}>
          ⟳ Resolving location...
        </div>
      )}
      
      {geocodeError && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(220,50,50,0.9)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '13px',
          zIndex: 1000,
        }}>
          ⚠️ {geocodeError}
        </div>
      )}
      
      <p className="pin-picker-hint">Click the map to set location</p>
    </div>
  );
}