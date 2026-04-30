// Sentinel used by client-side filters to represent "match NULL/empty" for a column.
// Shared between client (campaign modal) and server (BQ WHERE builder) — keep in sync.
export const BQ_NULL_SENTINEL = '__NULL__'
