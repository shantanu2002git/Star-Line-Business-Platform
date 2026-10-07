export type StarlineRecord = {
  id: string;
  [key: string]: unknown;
};

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
  productId: string;
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
  invoiceNumber?: string;
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
