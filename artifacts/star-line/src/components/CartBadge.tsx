import { useCart } from '@/contexts/CartContext';

export function CartBadge() {
  const { items } = useCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (count === 0) return null;
  return (
    <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
      {count}
    </span>
  );
}