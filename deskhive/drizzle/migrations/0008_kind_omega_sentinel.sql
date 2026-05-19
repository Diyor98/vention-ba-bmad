ALTER TABLE "spaces" ADD COLUMN "amenities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_amenities_subset_check" CHECK ("spaces"."amenities" <@ ARRAY[
        'wifi', 'access_24_7', 'coffee_tea', 'parking', 'meeting_rooms',
        'printing_scanning', 'kitchen', 'phone_booths', 'lockers',
        'air_conditioning', 'standing_desks', 'monitors', 'whiteboard',
        'projector', 'pet_friendly', 'wheelchair_accessible'
      ]::text[]);