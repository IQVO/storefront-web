import { call, query, seg, type CallOptions } from "./api.ts";
import type {
  Cart,
  CategoryList,
  CheckoutSession,
  DeliveryDates,
  Order,
  OrderList,
  ProductSearchResult,
  ProductView,
  Shopper,
} from "./types.ts";

export interface SearchParams {
  q?: string | undefined;
  categoryId?: string | undefined;
  inStock?: boolean | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  sort?: string | undefined;
  after?: string | undefined;
  limit?: number | undefined;
}

export const searchProducts = (p: SearchParams, o?: CallOptions) =>
  call<ProductSearchResult>(`/products${query({ ...p })}`, o);
export const getProduct = (id: string, o?: CallOptions) => call<ProductView>(`/products/${seg(id)}`, o);
export const listCategories = (o?: CallOptions) => call<CategoryList>("/categories", o);
export const quoteDeliveryDates = (id: string, postalPrefix: string, o?: CallOptions) =>
  call<DeliveryDates>(`/products/${seg(id)}:delivery-dates`, { ...o, method: "POST", body: { postalPrefix } });

export const createCart = (actionId?: string) =>
  call<Cart>("/carts", { method: "POST", ...(actionId ? { actionId } : {}) });
export const listCarts = (state = "OPEN") => call<{ items?: Cart[]; carts?: Cart[] }>(`/carts${query({ state })}`);
export const getCart = (id: string) => call<Cart>(`/carts/${seg(id)}`);
export const addCartLine = (id: string, catalogItemId: string, quantity: number, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/lines`, { method: "POST", body: { catalogItemId, quantity }, ...(actionId ? { actionId } : {}) });
export const setLineQuantity = (id: string, item: string, quantity: number, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/lines/${seg(item)}`, { method: "PATCH", body: { quantity }, ...(actionId ? { actionId } : {}) });
export const removeLine = (id: string, item: string, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/lines/${seg(item)}`, { method: "DELETE", ...(actionId ? { actionId } : {}) });
/** The BFF relays the body unchanged to shopping-cart :set-destination, whose strict decoder wants destinationPostalPrefix. */
export const setDestination = (id: string, destinationPostalPrefix: string, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/destination`, { method: "POST", body: { destinationPostalPrefix }, ...(actionId ? { actionId } : {}) });
export const quoteCartDelivery = (id: string, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/delivery:quote`, { method: "POST", ...(actionId ? { actionId } : {}) });
export const selectCartDelivery = (id: string, groupNo: number, offerId: string, actionId?: string) =>
  call<Cart>(`/carts/${seg(id)}/delivery:select`, { method: "POST", body: { groupNo, offerId }, ...(actionId ? { actionId } : {}) });

export const openCheckout = (shipToAddressId: string, cartId?: string, actionId?: string) =>
  call<CheckoutSession>("/checkout", {
    method: "POST",
    body: { shipToAddressId, ...(cartId ? { cartId } : {}) },
    ...(actionId ? { actionId } : {}),
  });
export const getCheckout = (id: string) => call<CheckoutSession>(`/checkout/${seg(id)}`);
export const confirmCheckout = (id: string, paymentMethodToken: string, actionId?: string) =>
  call<CheckoutSession>(`/checkout/${seg(id)}:confirm`, {
    method: "POST",
    body: { paymentMethodToken },
    ...(actionId ? { actionId } : {}),
  });

export const listOrders = (after?: string) => call<OrderList>(`/orders${query({ after })}`);
export const getOrder = (id: string) => call<Order>(`/orders/${seg(id)}`);
export const cancelOrder = (id: string, reason: string, actionId?: string) =>
  call<Order>(`/orders/${seg(id)}:cancel`, { method: "POST", body: { reason }, ...(actionId ? { actionId } : {}) });

export const createSession = (email: string) => call<Shopper>("/sessions", { method: "POST", body: { email } });
export const registerShopper = (body: unknown, actionId?: string) =>
  call<Shopper>("/shoppers", { method: "POST", body, ...(actionId ? { actionId } : {}) });
export const getMe = () => call<Shopper>("/me");
export const addMyAddress = (body: unknown, actionId?: string) =>
  call<unknown>("/me/addresses", { method: "POST", body, ...(actionId ? { actionId } : {}) });
