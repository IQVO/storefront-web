import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("products/:id", "routes/product.tsx"),
  route("cart", "routes/cart.tsx"),
  route("account", "routes/account.tsx"),
  route("checkout", "routes/checkout.tsx"),
  route("confirmation/:sessionId", "routes/confirmation.tsx"),
  route("orders", "routes/orders.tsx"),
  route("orders/:id", "routes/order-detail.tsx"),
] satisfies RouteConfig;
