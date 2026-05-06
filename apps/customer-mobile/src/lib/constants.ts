/**
 * App-wide constants. Anything that's "for now we hardcode this and
 * A4d-3 swaps in the real source" lives here so the swap point is
 * obvious to future-readers (and grep-able).
 */

export const CATEGORY_SLUGS = {
  WEDDING_CAR: "wedding-car",
} as const;

/**
 * Placeholder coordinates used until A4d-3 wires Maps autocomplete.
 * Sultanahmet pickup → Beşiktaş dropoff (~7 km Istanbul reference route).
 * The pricing engine uses these to compute distance + the quote total
 * comes out around 6877 TRY at the seeded pricing profile.
 */
export const DEFAULT_PICKUP_COORDS = {
  lat: 41.0082,
  lng: 28.9784,
};

export const DEFAULT_DROPOFF_COORDS = {
  lat: 41.0428,
  lng: 29.0093,
};

/** OTP resend cooldown in seconds — matches A4d-1 verify screen. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
