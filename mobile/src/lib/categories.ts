import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ReportStatus } from './types';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Mirrors INFRASTRUCTURE_TAXONOMY in the web app (src/lib/categories.ts). */
export const TAXONOMY: { name: string; icon: IconName; types: string[] }[] = [
  { name: 'Transportation', icon: 'car-outline', types: ['Road', 'Bridge', 'Traffic Signal', 'Sidewalk', 'Transit Stop', 'Parking'] },
  { name: 'Water/Wastewater', icon: 'water-outline', types: ['Water Main', 'Sewer', 'Storm Drain', 'Treatment Plant', 'Hydrant'] },
  { name: 'Power', icon: 'flash-outline', types: ['Transmission Line', 'Distribution Line', 'Substation', 'Streetlight', 'Transformer'] },
  { name: 'Telecom/Broadband', icon: 'wifi-outline', types: ['Fiber', 'Cell Tower', 'Public Wi‑Fi', 'Cable Plant'] },
  { name: 'Buildings', icon: 'business-outline', types: ['Public Building', 'Abandoned Structure', 'Housing', 'Commercial'] },
  { name: 'Schools', icon: 'school-outline', types: ['K-12 Facility', 'Campus Infrastructure', 'Playground', 'Accessibility'] },
  { name: 'Health', icon: 'medkit-outline', types: ['Clinic', 'Hospital Access', 'EMS Facility'] },
  { name: 'Parks', icon: 'leaf-outline', types: ['Park Path', 'Play Equipment', 'Green Space', 'Tree Hazard'] },
  { name: 'Waste', icon: 'trash-outline', types: ['Collection Point', 'Illegal Dumping', 'Recycling'] },
  { name: 'Flood/Stormwater', icon: 'rainy-outline', types: ['Flooding', 'Culvert', 'Retention Basin', 'Levee'] },
  { name: 'Public Safety', icon: 'warning-outline', types: ['Signage', 'Barrier', 'Hazard Marker', 'Emergency Access'] },
];

export function categoryIcon(category: string | null | undefined): IconName {
  return TAXONOMY.find((c) => c.name === category)?.icon ?? 'construct-outline';
}

export const FILTER_STATUSES: { value: ReportStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

export const SEVERITY_LABELS: Record<number, { label: string; hint: string }> = {
  1: { label: 'Minor', hint: 'Cosmetic or inconvenient' },
  2: { label: 'Low', hint: 'Needs attention eventually' },
  3: { label: 'Moderate', hint: 'Affects daily use' },
  4: { label: 'High', hint: 'Unsafe or failing' },
  5: { label: 'Critical', hint: 'Danger to life or major outage' },
};
