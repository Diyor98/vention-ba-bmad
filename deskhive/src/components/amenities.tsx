/**
 * Story DESIGN-2 — Amenities components.
 *
 * Family:
 *   - AmenitiesForm:   checkbox grid for admin + host space-edit flows
 *   - AmenitiesDisplay: read-only icon grid for the public space-detail page
 *
 * Canonical slug list lives in src/db/schema.ts (AMENITY_SLUGS); the Lucide
 * icon + display label mapping is locked here to avoid spreading mappings
 * across pages. Adding a new slug = (1) extend AMENITY_SLUGS in schema +
 * write a migration that extends the CHECK constraint, (2) add the
 * { slug, label, Icon } row below.
 */

import {
  Accessibility,
  Car,
  ChefHat,
  Clock,
  Coffee,
  Lock,
  Monitor,
  PawPrint,
  Phone,
  Presentation,
  Printer,
  Projector,
  Snowflake,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import type { AmenitySlug } from '@/db/schema';

export type AmenityDefinition = {
  slug: AmenitySlug;
  label: string;
  Icon: LucideIcon;
};

// Locked per DESIGN-EPIC spec. Order is the display order for both form
// + display variants. Icons are Lucide names verbatim from the spec.
export const AMENITY_DEFINITIONS: ReadonlyArray<AmenityDefinition> = [
  { slug: 'wifi', label: 'WiFi', Icon: Wifi },
  { slug: 'access_24_7', label: '24/7 access', Icon: Clock },
  { slug: 'coffee_tea', label: 'Coffee / tea', Icon: Coffee },
  { slug: 'parking', label: 'Parking', Icon: Car },
  { slug: 'meeting_rooms', label: 'Meeting rooms', Icon: Users },
  { slug: 'printing_scanning', label: 'Printing / scanning', Icon: Printer },
  { slug: 'kitchen', label: 'Kitchen', Icon: ChefHat },
  { slug: 'phone_booths', label: 'Phone booths', Icon: Phone },
  { slug: 'lockers', label: 'Lockers', Icon: Lock },
  { slug: 'air_conditioning', label: 'Air conditioning', Icon: Snowflake },
  { slug: 'standing_desks', label: 'Standing desks', Icon: Monitor },
  { slug: 'monitors', label: 'Monitors available', Icon: Monitor },
  { slug: 'whiteboard', label: 'Whiteboard', Icon: Presentation },
  { slug: 'projector', label: 'Projector', Icon: Projector },
  { slug: 'pet_friendly', label: 'Pet-friendly', Icon: PawPrint },
  { slug: 'wheelchair_accessible', label: 'Wheelchair accessible', Icon: Accessibility },
];

/**
 * Render a checkbox-pill grid of all 16 amenities. Each checkbox is a
 * vanilla `<input type="checkbox" name={inputName}>`, so the form
 * submits as a multi-valued string[] without any client JS. The pill
 * styling lives in globals.css (.amenities-grid + .amenity-check) and
 * uses :has(input:checked) for the active-state outline.
 */
export function AmenitiesForm(props: {
  inputName?: string;
  defaultSelected?: ReadonlyArray<string>;
  disabled?: boolean;
}) {
  const inputName = props.inputName ?? 'amenities';
  const defaultSelected = new Set(props.defaultSelected ?? []);
  return (
    <div className="amenities-grid" data-testid="amenities-form">
      {AMENITY_DEFINITIONS.map(({ slug, label, Icon }) => (
        <label
          key={slug}
          className="amenity-check"
          data-testid={`amenity-check-${slug}`}
        >
          <input
            type="checkbox"
            name={inputName}
            value={slug}
            defaultChecked={defaultSelected.has(slug)}
            disabled={props.disabled}
          />
          <Icon className="ico" aria-hidden="true" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Read-only icon grid for the public space-detail page. Renders only the
 * selected amenities (no checkboxes). When `slugs` is empty, renders a
 * single dashed-border empty-state line per the brief's "empty states
 * matter" rule.
 */
export function AmenitiesDisplay(props: {
  slugs: ReadonlyArray<string>;
}) {
  const selected = new Set(props.slugs);
  const tiles = AMENITY_DEFINITIONS.filter((a) => selected.has(a.slug));
  if (tiles.length === 0) {
    return (
      <p className="amenity-empty" data-testid="amenities-empty">
        No amenities listed for this space yet.
      </p>
    );
  }
  return (
    <ul className="amenity-display" data-testid="amenities-display">
      {tiles.map(({ slug, label, Icon }) => (
        <li
          key={slug}
          className="amenity-tile"
          data-testid={`amenity-tile-${slug}`}
        >
          <Icon className="ico" aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
