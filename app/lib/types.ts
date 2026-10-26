// Shapes of the BFF answers the pages use. The BFF relays upstream documents unchanged
// (apis/openapi.yaml of storefront-bff), so these mirror the upstream contracts.

export type Tier = "SAME_DAY" | "NEXT_DAY" | "TWO_DAY" | "STANDARD";

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface Media {
  mediaId: string;
  url: string;
  altText: string;
  role: string;
}

export interface ProductHit {
  catalogItemId: string;
  title: string;
  effectivePrice?: Money;
  primaryMedia?: Media;
  categoryPath?: string[];
  inStock: boolean;
  purchasable: boolean;
}

export interface FacetValue {
  value: string;
  count: number;
}
export interface Facet {
  name: string;
  values: FacetValue[];
}
export interface CategorySuggestion {
  categoryId: string;
  name: string;
}

export interface ProductSearchResult {
  hits: ProductHit[];
  facets: Facet[];
  categorySuggestions?: CategorySuggestion[];
  next?: string | null;
}

export interface ProductView {
  catalogItemId: string;
  title: string;
  description?: string;
  bullets?: string[];
  attributes?: { name: string; value: string }[];
  media?: Media[];
  categoryPath?: string[];
  listPrice?: Money;
  effectivePrice?: Money;
  inStock: boolean;
  purchasable: boolean;
}

export interface DeliveryTier {
  tier: Tier;
  deliverByEarliest: string;
  deliverByLatest: string;
  offerExpiresAt?: string;
  charge?: { amountMinor?: number; currency?: string };
  freeOver?: { amountMinor?: number; currency?: string };
}
export interface DeliveryDates {
  postalPrefix: string;
  tiers: DeliveryTier[];
  unavailable: unknown[];
}

export interface CartLine {
  catalogItemId: string;
  quantity: number;
}
export interface QuotedOffer {
  offerId: string;
  groupNo: number;
  tier: Tier;
  deliverByEarliest: string;
  deliverByLatest: string;
  expiresAt: string;
}
export interface QuoteGroup {
  groupNo: number;
  lineNos: number[];
  offers: QuotedOffer[];
}
export interface Estimate {
  currency: string;
  itemsMinor: number;
  deliveryMinor: number;
  taxMinor: number;
  totalMinor: number;
}
export interface Cart {
  cartId: string;
  shopperId?: string | null;
  state: string;
  lines: CartLine[];
  destinationPostalPrefix?: string | null;
  deliveryQuote?: { groups: QuoteGroup[]; unavailableTiers: Tier[]; quotedAt: string };
  selections?: { groupNo: number; offerId: string }[];
  estimate?: Estimate;
  checkoutReadiness?: { ready: boolean; allGroupsSelected: boolean; noOfferExpired: boolean };
  version: number;
}

export type SessionState =
  | "OPEN"
  | "AUTHORIZING"
  | "DECLINED"
  | "PLACING"
  | "REQUOTE_REQUIRED"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED";

export interface CheckoutSession {
  sessionId: string;
  state: SessionState;
  cartId: string;
  shopperId: string;
  shipToAddressId: string;
  lines: { lineNo: number; catalogItemId: string; quantity: number }[];
  groups: { groupNo: number; offerId: string; tier: Tier; lineNos: number[]; amountMinor: number }[];
  currency?: string;
  totalMinor?: number;
  quoteExpiresAt: string;
  orderId?: string | null;
  failureCode?: string | null;
  version: number;
}

export interface SavedAddress {
  addressId: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}
export interface Shopper {
  shopperId: string;
  email: string;
  status: string;
  registeredAt: string;
  savedAddresses: SavedAddress[];
}

export interface TrackingPackage {
  trackingNumber: string;
  carrier?: string;
  state?: string;
  lastScanAt?: string;
  deliveredAt?: string;
  exceptionReason?: string;
}
export interface TrackingGroup {
  groupNo: number;
  status: string;
  deliverByEarliest: string;
  deliverByLatest: string;
  atRiskReason?: string;
  cancelRefusedReason?: string;
  packages: TrackingPackage[];
}
export interface Order {
  orderId: string;
  shopperId: string;
  status: string;
  destinationPostalPrefix: string;
  placedAt: string;
  cancelledAt?: string;
  lines: { lineNo: number; catalogItemId: string; quantity: number }[];
  groups: unknown[];
  tracking?: { orderId: string; status: string; groups: TrackingGroup[] };
  totals?: { currency?: string; totalMinor?: number };
}
export interface OrderList {
  items: Order[];
  nextCursor?: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
}
