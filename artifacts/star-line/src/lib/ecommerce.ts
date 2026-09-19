import { customFetch } from '@workspace/api-client-react';

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  image: string;
  price: number;
  originalPrice: number;
  quantity: number;
  maxStock: number;
  addedAt: string;
};

export type CartBreakdown = {
  items: Array<CartItem & { itemTotal: number; itemOriginalTotal: number }>;
  subtotal: number;
  totalOriginal: number;
  discount: number;
  couponDiscount: number;
  couponCode: string | null;
  platformDiscount: number;
  deliveryCharge: number;
  packagingCharge: number;
  tax: number;
  total: number;
  saved: number;
};

export type WishlistItem = {
  id: string;
  productId: string;
  name: string;
  image: string;
  price: number;
  addedAt: string;
};

export type OrderItem = {
  id: string;
  name: string;
  image: string;
  price: number;
  originalPrice: number;
  quantity: number;
  total: number;
};

export type Order = {
  id: string;
  number: string;
  customer: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  platformDiscount: number;
  deliveryCharge: number;
  packagingCharge: number;
  tax: number;
  total: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  estimatedDelivery: string;
};

export type Notification = {
  id: string;
  customer: string;
  orderId?: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
};

export function getCart() {
  return customFetch<CartItem[]>('/api/cart', { responseType: 'json' });
}

export function addToCart(productId: string, quantity = 1) {
  return customFetch<CartItem>('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId, quantity }),
    responseType: 'json',
  });
}

export function updateCartQuantity(itemId: string, quantity: number) {
  return customFetch<CartItem>(`/api/cart/${itemId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quantity }),
    responseType: 'json',
  });
}

export function removeCartItem(itemId: string) {
  return customFetch<unknown>(`/api/cart/${itemId}`, { method: 'DELETE', responseType: 'json' });
}

export function clearCart() {
  return customFetch<unknown>('/api/cart', { method: 'DELETE', responseType: 'json' });
}

export function getCartBreakdown(couponCode?: string | null) {
  return customFetch<CartBreakdown>(
    couponCode ? `/api/cart/breakdown?coupon=${encodeURIComponent(couponCode)}` : '/api/cart/breakdown',
    { responseType: 'json' },
  );
}

export function getWishlist() {
  return customFetch<WishlistItem[]>('/api/wishlist', { responseType: 'json' });
}

export function addToWishlist(productId: string) {
  return customFetch<WishlistItem>('/api/wishlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId }),
    responseType: 'json',
  });
}

export function removeFromWishlist(itemId: string) {
  return customFetch<unknown>(`/api/wishlist/${itemId}`, { method: 'DELETE', responseType: 'json' });
}

export function checkout(data: {
  customer: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: string;
  couponCode?: string | null;
}) {
  return customFetch<Order>('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    responseType: 'json',
  });
}

export function getOrder(id: string) {
  return customFetch<Order>(`/api/orders/${id}`, { responseType: 'json' });
}

export function listOrders(customer?: string) {
  return customFetch<Order[]>(
    customer ? `/api/orders?customer=${encodeURIComponent(customer)}` : '/api/orders',
    { responseType: 'json' },
  );
}

export function listNotifications(customer = 'Ananya Shah') {
  return customFetch<Notification[]>(`/api/notifications?customer=${encodeURIComponent(customer)}`, { responseType: 'json' });
}

export function markNotificationRead(id: string) {
  return customFetch<Notification>(`/api/notifications/${id}/read`, { method: 'PATCH', responseType: 'json' });
}