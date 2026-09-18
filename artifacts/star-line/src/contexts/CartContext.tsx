import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import {
  addToCart as apiAddToCart,
  addToWishlist as apiAddToWishlist,
  clearCart as apiClearCart,
  checkout as apiCheckout,
  getCart as apiGetCart,
  getCartBreakdown as apiGetCartBreakdown,
  getWishlist as apiGetWishlist,
  removeCartItem as apiRemoveCartItem,
  removeFromWishlist as apiRemoveFromWishlist,
  updateCartQuantity as apiUpdateCartQuantity,
  type CartBreakdown,
  type CartItem,
  type Order,
  type WishlistItem,
} from '@/lib/ecommerce';

interface CartContextValue {
  items: CartItem[];
  breakdown: CartBreakdown | null;
  isLoading: boolean;
  isMutating: boolean;
  wishlist: WishlistItem[];
  addToCart: (productId: string, quantity?: number) => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  applyCoupon: (code: string) => Promise<CartBreakdown | null>;
  addToWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (itemId: string) => Promise<void>;
  checkout: (data: {
    customer: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    paymentMethod: string;
    couponCode?: string | null;
  }) => Promise<Order | null>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [breakdown, setBreakdown] = useState<CartBreakdown | null>(null);
  const [isMutating, setMutating] = useState(false);

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: apiGetCart,
    staleTime: 0,
  });
  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: apiGetWishlist,
    staleTime: 0,
  });

  const items = cartQuery.data ?? [];
  const wishlist = wishlistQuery.data ?? [];

  const refreshBreakdown = useCallback(async (coupon?: string | null) => {
    try {
      const data = await apiGetCartBreakdown(coupon ?? null);
      setBreakdown(data);
    } catch {
      setBreakdown(null);
    }
  }, []);

  useEffect(() => {
    void refreshBreakdown();
  }, [items, refreshBreakdown]);

  const addToCart = async (productId: string, quantity = 1) => {
    setMutating(true);
    try {
      await apiAddToCart(productId, quantity);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast({ title: 'Added to cart' });
    } catch (err) {
      toast({ title: 'Could not add to cart', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setMutating(false);
    }
  };

  const setQuantity = async (itemId: string, quantity: number) => {
    setMutating(true);
    try {
      await apiUpdateCartQuantity(itemId, quantity);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch (err) {
      toast({ title: 'Could not update quantity', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setMutating(false);
    }
  };

  const removeItem = async (itemId: string) => {
    setMutating(true);
    try {
      await apiRemoveCartItem(itemId);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast({ title: 'Item removed' });
    } catch (err) {
      toast({ title: 'Could not remove item', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setMutating(false);
    }
  };

  const clear = async () => {
    setMutating(true);
    try {
      await apiClearCart();
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    } finally {
      setMutating(false);
    }
  };

  const applyCoupon = async (code: string) => {
    try {
      const data = await apiGetCartBreakdown(code);
      setBreakdown(data);
      return data;
    } catch {
      return null;
    }
  };

  const addToWishlist = async (productId: string) => {
    try {
      await apiAddToWishlist(productId);
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({ title: 'Saved to wishlist' });
    } catch (err) {
      toast({ title: 'Could not save item', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const removeFromWishlist = async (itemId: string) => {
    try {
      await apiRemoveFromWishlist(itemId);
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    } catch (err) {
      toast({ title: 'Could not remove item', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const checkout = useMutation({
    mutationFn: apiCheckout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setBreakdown(null);
    },
  });

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      breakdown,
      isLoading: cartQuery.isLoading,
      isMutating,
      wishlist,
      addToCart,
      setQuantity,
      removeItem,
      clear,
      applyCoupon,
      addToWishlist,
      removeFromWishlist,
      checkout: async (data) => {
        try {
          const order = await checkout.mutateAsync(data);
          toast({ title: 'Order placed', description: `Order #${order.number}` });
          return order;
        } catch (err) {
          toast({ title: 'Checkout failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
          return null;
        }
      },
    }),
    [items, breakdown, wishlist, cartQuery.isLoading, isMutating, addToCart, setQuantity, removeItem, clear, applyCoupon, addToWishlist, removeFromWishlist, checkout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useWishlist() {
  const { wishlist, addToWishlist, removeFromWishlist } = useCart();
  return { wishlist, addToWishlist, removeFromWishlist };
}

export function useBreakdown() {
  const { breakdown, applyCoupon } = useCart();
  return { breakdown, applyCoupon };
}